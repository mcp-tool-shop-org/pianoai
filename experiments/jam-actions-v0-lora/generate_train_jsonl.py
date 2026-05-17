"""
Generate train.jsonl for Slice 9c LoRA fine-tuning.

Run from repo root:
    python experiments/jam-actions-v0-lora/generate_train_jsonl.py

Each JSONL line is:
{"messages": [
  {"role": "system", "content": "<E2 system prompt — exact hardened version from llm-runner.ts>"},
  {"role": "user",   "content": "<E2 user message built from prompt record — same shape as buildE2UserPrompt()>"},
  {"role": "assistant", "content": "<gold continuation as JSON: {tokens_remi: [...], tokens_abc: '...'}>"}
]}

Training pairs:  20 prompt -> continuation_target pairs from train split
Validation held out: last 2 pairs (by sort order) recommended for val loss monitoring
No clair-de-lune records.
"""

import json
import os
import sys

RECORDS_DIR = os.path.join(
    os.path.dirname(__file__), "../../datasets/jam-actions-v0/records"
)
SPLITS_PATH = os.path.join(
    os.path.dirname(__file__), "../../datasets/jam-actions-v0/splits.json"
)
OUT_PATH = os.path.join(os.path.dirname(__file__), "train.jsonl")

# ---------------------------------------------------------------------------
# E2 system prompt — exact hardened version from llm-runner.ts (Slice 9d).
# DO NOT modify this string without also updating llm-runner.ts E2_SYSTEM_TEXT.
# ---------------------------------------------------------------------------
E2_SYSTEM = (
    "You are predicting musical phrase continuations for piano music.\n\n"
    "Given the REMI token sequence and metadata for a prompt phrase, "
    "output the continuation phrase as valid JSON with this exact schema:\n\n"
    "{\n"
    '  "tokens_remi": [...],\n'
    '  "tokens_abc": "X:1\\nT:...\\nM:...\\nL:1/8\\nK:...\\n|...|"\n'
    "}\n\n"
    "REMI token vocabulary (the ONLY valid token formats):\n"
    "  Bar_N       -- bar marker (e.g. Bar_1, Bar_2, ...)\n"
    "  Position_N  -- position within bar (e.g. Position_0, Position_24, ...)\n"
    "  Pitch_N     -- MIDI pitch 0-127 (e.g. Pitch_60 for middle C)\n"
    "  Velocity_N  -- velocity 0-124 in steps of 4 (e.g. Velocity_64)\n"
    "  Duration_N  -- duration in 1/16th note units (e.g. Duration_4 = quarter note)\n\n"
    "ONE-SHOT EXAMPLE -- valid 3-bar continuation in C major, 4/4, quarter-note melody:\n"
    '{"tokens_remi": [\n'
    '  "Bar_1", "Position_0", "Pitch_60", "Velocity_64", "Duration_4",\n'
    '  "Position_24", "Pitch_62", "Velocity_60", "Duration_4",\n'
    '  "Position_48", "Pitch_64", "Velocity_62", "Duration_4",\n'
    '  "Position_72", "Pitch_65", "Velocity_58", "Duration_4",\n'
    '  "Bar_2", "Position_0", "Pitch_67", "Velocity_64", "Duration_8",\n'
    '  "Position_48", "Pitch_65", "Velocity_60", "Duration_4",\n'
    '  "Position_72", "Pitch_64", "Velocity_58", "Duration_4",\n'
    '  "Bar_3", "Position_0", "Pitch_62", "Velocity_64", "Duration_8",\n'
    '  "Position_48", "Pitch_60", "Velocity_62", "Duration_16"\n'
    '], "tokens_abc": "X:1\\nT:Example\\nM:4/4\\nL:1/8\\nK:C\\n|CDEF|G2 FE|D2 C4|"}\n\n'
    "Notice: every bar (Bar_1, Bar_2, Bar_3) has at least one Pitch_N token.\n\n"
    "CRITICAL RULES:\n"
    "- Output ONLY valid JSON. Nothing else.\n"
    "- No markdown code fences (no ```json or ```).\n"
    "- No explanation text before or after the JSON.\n"
    "- No thinking blocks or reasoning text (<think>, <thinking>, etc.).\n"
    "- tokens_remi MUST be a JSON array where each element is a SINGLE token string.\n"
    '  WRONG: {"tokens_remi": ["Bar_1 Position_0 Pitch_60"]}\n'
    '  RIGHT: {"tokens_remi": ["Bar_1", "Position_0", "Pitch_60"]}\n'
    "- Each token must use ONLY the 5 valid prefixes above."
    "  No Note_On_, Note_Off_, BPM_, etc.\n"
    "- Include multiple measures (at least 4 bars of tokens) matching the specified window.\n"
    "- Your continuation MUST include at least one Pitch_N token per bar."
    "  A bar with only Bar_N, Position_N, Velocity_N, or Duration_N but no Pitch_N is INVALID.\n"
    "- Before your final output, verify: does every bar in your continuation contain"
    "  at least one Pitch_N token? If not, add the missing Pitch_N tokens before outputting.\n"
    "- The continuation must match the musical style, key, tempo, and rhythmic patterns"
    "  of the prompt."
)


def build_user_message(prompt_rec: dict) -> str:
    """Mirror buildE2UserPrompt() from src/dataset/eval/llm-runner.ts exactly."""
    s = prompt_rec["scope"]
    tokens_remi = prompt_rec["observation"].get("tokens_remi", [])
    tokens_str = " ".join(tokens_remi)

    cont_window = s.get("continuation_target_window")
    if cont_window:
        n_measures = cont_window[1] - cont_window[0] + 1
    else:
        n_measures = 4

    return (
        f"Composer: {s['song_id']}\n"
        f"Phrase window: {s['phrase_window']}\n"
        f"Key: {s.get('key', 'unknown')}\n"
        f"Time signature: {s.get('time_signature', '4/4')}\n"
        f"Tempo: {s.get('tempo_bpm', 'unknown')} BPM\n"
        f"Instrument: {s.get('instrument', 'piano')}\n\n"
        f"REMI tokens for this prompt phrase:\n{tokens_str}\n\n"
        f"Predict the continuation phrase for the next {n_measures} measures. "
        "Use predict_continuation to output the tokens."
    )


def build_assistant_message(target_rec: dict) -> str:
    """Build the gold continuation JSON response."""
    tokens_remi = target_rec["observation"].get("tokens_remi", [])
    tokens_abc = target_rec["observation"].get("tokens_abc", "")
    return json.dumps({"tokens_remi": tokens_remi, "tokens_abc": tokens_abc}, ensure_ascii=False)


def run_assertions(prompts, targets_by_prompt_id, examples):
    """Run all data-quality assertions. Raises AssertionError on first failure."""
    # A1: No clair-de-lune records in training prompts
    for p in prompts:
        assert "clair-de-lune" not in p["id"], (
            f"ASSERTION FAIL A1: clair-de-lune in prompt id: {p['id']}"
        )

    # A2: No clair-de-lune in targets
    for pid, t in targets_by_prompt_id.items():
        assert "clair-de-lune" not in t["id"], (
            f"ASSERTION FAIL A2: clair-de-lune in target id: {t['id']}"
        )

    # A3: Every prompt has a paired target
    for p in prompts:
        assert p["id"] in targets_by_prompt_id, (
            f"ASSERTION FAIL A3: no continuation_target for prompt: {p['id']}"
        )

    # A4: Every example's user message contains valid REMI tokens (Bar_ + Pitch_)
    for i, ex in enumerate(examples):
        user = ex["messages"][1]["content"]
        remi_line_start = user.find("REMI tokens for this prompt phrase:\n")
        assert remi_line_start != -1, f"ASSERTION FAIL A4[{i}]: no REMI tokens section in user message"
        remi_section = user[remi_line_start:]
        assert "Bar_" in remi_section, f"ASSERTION FAIL A4[{i}]: no Bar_ tokens in user message"
        assert "Pitch_" in remi_section, f"ASSERTION FAIL A4[{i}]: no Pitch_ tokens in user message"

    # A5: Every assistant message is valid JSON with tokens_remi (list) and tokens_abc (str)
    for i, ex in enumerate(examples):
        asst = ex["messages"][2]["content"]
        parsed = json.loads(asst)
        assert isinstance(parsed.get("tokens_remi"), list), (
            f"ASSERTION FAIL A5[{i}]: tokens_remi not a list in example {i}"
        )
        assert isinstance(parsed.get("tokens_abc"), str), (
            f"ASSERTION FAIL A5[{i}]: tokens_abc not a string in example {i}"
        )

    # A6: Every assistant message has at least one Pitch_* token (FM-4 sanity)
    for i, ex in enumerate(examples):
        asst_json = json.loads(ex["messages"][2]["content"])
        remi_tokens = asst_json["tokens_remi"]
        pitch_tokens = [t for t in remi_tokens if t.startswith("Pitch_")]
        assert len(pitch_tokens) >= 1, (
            f"ASSERTION FAIL A6[{i}]: no Pitch_* tokens in assistant REMI for example {i} "
            f"(target: {ex['_meta']['target_id']})"
        )

    # A7: Count in valid range
    assert 20 <= len(examples) <= 22, (
        f"ASSERTION FAIL A7: expected 20-22 examples, got {len(examples)}"
    )


def main():
    # Load splits
    with open(SPLITS_PATH) as f:
        splits = json.load(f)

    train_ids = set(splits["train"])
    test_ids = set(splits["test"])

    # Assertion: no clair-de-lune in train_ids
    clair_in_train = [rid for rid in train_ids if "clair-de-lune" in rid]
    assert len(clair_in_train) == 0, (
        f"ASSERTION FAIL: splits.json has clair-de-lune in train: {clair_in_train}"
    )

    # Load all records
    records = {}
    for fname in sorted(os.listdir(RECORDS_DIR)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(RECORDS_DIR, fname)) as f:
            r = json.load(f)
        records[r["id"]] = r

    # Separate prompts and continuation_targets in train set
    prompts = []
    targets_by_prompt_id = {}
    for rid, r in records.items():
        if rid not in train_ids:
            continue
        role = r["scope"].get("window_role")
        if role == "prompt":
            prompts.append(r)
        elif role == "continuation_target":
            prompt_id = r["scope"].get("paired_prompt_record_id")
            if prompt_id:
                targets_by_prompt_id[prompt_id] = r

    prompts.sort(key=lambda r: r["id"])

    print(f"Prompt records found: {len(prompts)}")
    print(f"Continuation_target records found: {len(targets_by_prompt_id)}")

    # Build examples
    examples = []
    for p in prompts:
        if p["id"] not in targets_by_prompt_id:
            print(f"  WARNING: no target for {p['id']}, skipping", file=sys.stderr)
            continue
        t = targets_by_prompt_id[p["id"]]

        user_msg = build_user_message(p)
        asst_msg = build_assistant_message(t)

        remi_p = p["observation"].get("tokens_remi", [])
        remi_t = t["observation"].get("tokens_remi", [])

        examples.append({
            "messages": [
                {"role": "system",    "content": E2_SYSTEM},
                {"role": "user",      "content": user_msg},
                {"role": "assistant", "content": asst_msg},
            ],
            # Human-readable metadata — stripped by training script, not fed to model
            "_meta": {
                "prompt_id":          p["id"],
                "target_id":          t["id"],
                "pair_index":         len(examples),
                "song_id":            p["scope"]["song_id"],
                "time_sig":           p["scope"].get("time_signature", "?"),
                "key":                p["scope"].get("key", "?"),
                "tempo_bpm":          p["scope"].get("tempo_bpm"),
                "prompt_remi_count":  len(remi_p),
                "target_remi_count":  len(remi_t),
            },
        })

    # Run all assertions
    run_assertions(prompts, targets_by_prompt_id, examples)

    # Write output
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"\nWritten {len(examples)} examples to {OUT_PATH}")
    print("\nALL ASSERTIONS PASSED\n")

    # Summary
    print("Recommended validation split (last 2 pairs by sort order):")
    for ex in examples[-2:]:
        m = ex["_meta"]
        print(f"  [{m['pair_index']}] {m['song_id']} | prompt={m['prompt_id'].split(':')[1]}"
              f" | target={m['target_id'].split(':')[1]}")

    print("\nFull pair list:")
    for ex in examples:
        m = ex["_meta"]
        print(f"  [{m['pair_index']:2d}] {m['song_id']:40s}  ts={m['time_sig']:4s}"
              f"  key={m['key']:12s}  p_remi={m['prompt_remi_count']:3d}"
              f"  t_remi={m['target_remi_count']:3d}")


if __name__ == "__main__":
    main()
