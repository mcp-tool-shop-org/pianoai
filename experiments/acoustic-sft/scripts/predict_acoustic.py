#!/usr/bin/env python3
"""Generate predictions on the held-out split, base model and adapter alike.

Runs ON THE POD. Writes one JSONL line per test record, `{"id", "verdict"}`,
which is exactly what `experiments/acoustic-sft/eval.ts` consumes.

Why this exists at all: rule 4 of the experiment contract says a result is
reported beside the trivial baselines AND the base model on the same split. An
adapter score alone cannot be distinguished from a model that already knew the
answer, so the base run is not optional and `eval.ts` prints a warning when it
is missing. Producing both from one script, on one pod, with one prompt
construction, is the only way to be sure the two are comparable -- a base run
built differently from the adapter run measures the prompt, not the adapter.

    python predict_acoustic.py --out preds-base.jsonl
    python predict_acoustic.py --adapter runs/seed13/epoch5 --out preds-lora.jsonl

The prompt is the record's own conversation truncated at the point the gold
verdict would be produced, rendered with the same chat template and the same
tool catalog the trainer used. Nothing about the scoring lives here: this script
emits a verdict string and stops. Grading is `eval.ts`, on the studio rig.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

# Imported from the trainer so the two cannot drift. If the rendering differs
# between training and inference, every number afterwards is measuring that
# difference rather than the adapter.
import importlib.util

_spec = importlib.util.spec_from_file_location("trainer", HERE / "train_acoustic_sft.py")
_trainer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_trainer)

load_tools = _trainer.load_tools
to_template_messages = _trainer.to_template_messages


def verdict_pattern(label: str) -> "re.Pattern[str]":
    r"""One label, however it is spelled.

    `nothing_to_grade` and "Nothing to grade" are the same answer; underscore
    versus space is a rendering detail. The guards are `(?<!\w)` / `(?!\w)`
    rather than `\b`, and since `_` is a word character that is what stops
    `pitch_fail` matching inside `pitch_fail_cents` -- which the adapter emits
    in every completion, because it echoes the gates.
    """
    body = "[ _-]".join(re.escape(w) for w in label.split("_"))
    return re.compile(rf"(?<!\w){body}(?!\w)", re.IGNORECASE)


def verdict_from_text(text: str, allowed: list[str]) -> str:
    """Pull a declared verdict out of free text.

    Strict about the vocabulary, tolerant only about how a label is spelled,
    and silent when the answer is not exactly one label. A completion naming
    none or several is `unparseable`, never guessed -- guessing would launder a
    format failure into an accuracy number.

    This was wrong once, and it inverted a result. The first version matched
    only the literal underscore form with `\b`, so the adapter's correct answer
    on the silence records -- "Nothing to grade. The file is silence, not a
    failed take." -- scored as unparseable. That read as the fine-tune failing
    the very trap case the corpus was built around, when it had in fact got it
    right and the grader had thrown it away.
    """
    hits = [v for v in allowed if verdict_pattern(v).search(text)]
    return hits[0] if len(hits) == 1 else "unparseable"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(EXP / "lora-config.json"))
    ap.add_argument("--data", default=str(EXP / "data" / "sft-test.jsonl"))
    ap.add_argument("--tools-file", default=str(EXP / "tool-schemas.json"))
    ap.add_argument("--tools", choices=["full", "listen"], default="full")
    ap.add_argument("--adapter", default=None, help="LoRA dir; omit for the base model")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-new-tokens", type=int, default=64)
    ap.add_argument(
        "--name-verdicts",
        action="store_true",
        help=(
            "append a system line listing the closed verdict set. The FAIR base "
            "condition: without it the base model writes fluent prose and never "
            "names a label, so a 0%% score measures the output format rather than "
            "the task, and the adapter's gain is overstated by exactly that much."
        ),
    )
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    model_name = cfg["base_model"]
    allowed = sorted(
        {
            "match", "pitch_fail", "pitch_warn", "timing_fail", "timing_pass",
            "missed", "extra", "in_tune", "nothing_to_grade",
        }
    )

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tools = load_tools(Path(args.tools_file), args.tools)

    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, dtype=torch.bfloat16, device_map="cuda"
        )
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, torch_dtype=torch.bfloat16, device_map="cuda"
        )

    which = "base"

    if args.adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, args.adapter)
        which = args.adapter
    model.eval()

    lines = [
        json.loads(l)
        for l in Path(args.data).read_text(encoding="utf-8").splitlines()
        if l.strip()
    ]
    print(f"[predict] {which} | {len(lines)} held-out records | {len(tools)} tools")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    with out_path.open("w", encoding="utf-8", newline="\n") as fh:
        for i, line in enumerate(lines, 1):
            tmpl = to_template_messages(line["messages"])
            # Cut at the last assistant turn: that turn is the answer we are
            # asking the model to produce.
            last_assistant = max(
                idx for idx, m in enumerate(tmpl) if m["role"] == "assistant"
            )
            prompt_msgs = tmpl[:last_assistant]
            if args.name_verdicts:
                prompt_msgs = list(prompt_msgs) + [{
                    "role": "system",
                    "content": (
                        "Answer with exactly one of these verdicts and nothing else: "
                        + ", ".join(allowed) + "."
                    ),
                }]
            text = tokenizer.apply_chat_template(
                prompt_msgs, tokenize=False, add_generation_prompt=True, tools=tools
            )
            enc = tokenizer(text, return_tensors="pt", add_special_tokens=False).to(model.device)
            with torch.no_grad():
                gen = model.generate(
                    **enc,
                    max_new_tokens=args.max_new_tokens,
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id,
                )
            completion = tokenizer.decode(
                gen[0][enc["input_ids"].shape[1]:], skip_special_tokens=True
            )
            verdict = verdict_from_text(completion, allowed)
            counts[verdict] = counts.get(verdict, 0) + 1
            # `raw` is extra baggage for eval.ts, which reads only id and
            # verdict -- and it is the difference between 'the model got it
            # wrong' and 'the model answered in prose'. Without the completion
            # on disk there is no telling those apart later, and they support
            # opposite conclusions about an adapter.
            fh.write(json.dumps({
                "id": line["id"],
                "verdict": verdict,
                "raw": completion.strip()[:600],
            }) + chr(10))
            if i % 6 == 0:
                print(f"  {i}/{len(lines)}")

    print(f"[predict] wrote {out_path}")
    print(f"[predict] verdict distribution: {dict(sorted(counts.items()))}")
    if counts.get("unparseable"):
        print(
            f"[predict] {counts['unparseable']} of {len(lines)} did not name exactly one "
            f"declared verdict. Those are recorded as unparseable, never guessed."
        )


if __name__ == "__main__":
    main()
