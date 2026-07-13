"""
AI Jam Sessions — Live tool-grounded QA (baseline vs fine-tuned) · ZeroGPU.

Faithfully reproduces the B-1 eval's `tool_inspected` condition: the model gets the
MIDI-inspector tools, calls them to inspect the actual notes of a phrase, then answers
a multiple-choice question A/B/C/D. We run the prompted Qwen2.5-7B-Instruct baseline
and a jam-ft-v1 LoRA (one seed) side by side on the SAME question.

Honest framing (in the UI): this is the ONLY surface where the fine-tune beats baseline;
on prose-only surfaces it is *below* baseline. One seed at a time (default seed271,
closest to the all-seeds mean); the published claim is the all-seeds mean, no best-of-seeds.

Ports (faithful) from the repo:
  src/dataset/eval/midi-inspector.ts             (8 pure tools)
  src/dataset/eval/annotation-grounding-tool.ts  (system + user prompt, agentic loop)
"""
import spaces  # must precede torch/transformers so ZeroGPU can patch device placement
import json, re, threading
import gradio as gr

# ── data ─────────────────────────────────────────────────────────────────────
with open("demo_data.json", "r", encoding="utf-8") as f:
    DEMO = json.load(f)
PHRASES = DEMO["phrases"]
def phrase_label(p):
    tag = " · held-out test" if p["split"] == "test" else ""
    return f'{p["composer"].split()[-1]}: {p["title"]} ({p["phrase_window"]}){tag}'
PHRASE_BY_LABEL = {phrase_label(p): p for p in PHRASES}
PHRASE_BY_ID = {p["id"]: p for p in PHRASES}

# Per-question B-1 eval scores + a curated, honest "surprise me" cycle (seed271).
# Seeds the divergence picker with cases where baseline and fine-tune disagreed in the
# offline eval — mostly fine-tune rescues, but the cycle deliberately keeps a split and a
# both-miss so it never reads as cherry-picked wins. Live (bf16 LoRA) may differ from the
# eval's GGUF runs; captions say so.
with open("divergence.json", "r", encoding="utf-8") as f:
    DIVERGENCE = json.load(f)
CYCLE = DIVERGENCE["cycle"]

SEEDS = ["seed271", "seed42", "seed512", "seed13", "seed1024"]  # seed271 ≈ all-seeds mean
DEFAULT_SEED = "seed271"
BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
ADAPTER_REPO = "mcp-tool-shop/jam-ft-v1-qwen25"
PC_CANON = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def pc_name(note): return PC_CANON[note % 12]

# ── MIDI-inspector tools (ported from midi-inspector.ts) ──────────────────────
BEAT_EPSILON = 0.1
DOWNBEAT_THRESHOLD = 0.5
def _slim(e): return {"hand": e["hand"], "measure": e["measure"], "beat": e["beat"], "pitch": e["note"], "name": e["name"]}
PC_ALIASES = {"DB": "C#", "EB": "D#", "FB": "E", "GB": "F#", "AB": "G#", "BB": "A#", "CB": "B",
              "C♭": "B", "D♭": "C#", "E♭": "D#", "F♭": "E", "G♭": "F#", "A♭": "G#", "B♭": "A#"}
def _normalize_pc(x):
    if isinstance(x, bool): return None
    if isinstance(x, int): return PC_CANON[x] if 0 <= x <= 11 else None
    if not isinstance(x, str): return None
    t = x.strip()
    if not t: return None
    if re.fullmatch(r"\d+", t):
        n = int(t); return PC_CANON[n] if 0 <= n <= 11 else None
    m = re.fullmatch(r"([A-Ga-g][#b♭♯]?)(?:-?\d+)?", t)
    if not m: return None
    head = m.group(1); cand = head[0].upper() + head[1:].replace("♯", "#")
    if cand in PC_CANON: return cand
    return PC_ALIASES.get(cand.upper()) or PC_ALIASES.get(cand)

def _as_int(v):
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)): return int(v)
    if isinstance(v, str) and re.fullmatch(r"-?\d+", v.strip()): return int(v.strip())
    return None
def _as_num(v):
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)): return float(v)
    try: return float(v.strip()) if isinstance(v, str) else None
    except Exception: return None

def t_get_events_in_measure(ev, a):
    m = _as_int(a.get("measure_number"))
    if m is None or m < 1: return []
    xs = sorted([e for e in ev if e["measure"] == m], key=lambda e: (e["beat"], 0 if e["hand"] == "right" else 1, e["note"]))
    return [_slim(e) for e in xs]
def t_get_events_in_hand(ev, a):
    h = a.get("hand")
    if h not in ("right", "left"): return []
    xs = sorted([e for e in ev if e["hand"] == h], key=lambda e: (e["measure"], e["beat"]))
    return [_slim(e) for e in xs]
def t_count_distinct_pitch_classes(ev, a):
    xs = ev; mr = a.get("measure_range")
    if isinstance(mr, list) and len(mr) == 2:
        lo, hi = _as_int(mr[0]), _as_int(mr[1])
        if lo is not None and hi is not None and lo <= hi:
            xs = [e for e in ev if lo <= e["measure"] <= hi]
    classes = sorted({pc_name(e["note"]) for e in xs})
    return {"count": len(classes), "classes": classes}
def t_count_notes_with_pitch_class(ev, a):
    canon = _normalize_pc(a.get("pitch_class"))
    if canon is None:
        return {"pitch_class": None, "count": 0, "error": f"unrecognized pitch class: {json.dumps(a.get('pitch_class'))}"}
    return {"pitch_class": canon, "count": sum(1 for e in ev if pc_name(e["note"]) == canon)}
def t_count_beat_1_onsets(ev, a):
    if not ev: return {"count": 0, "events": []}
    hz = any(e["beat"] == 0 for e in ev); ho = any(e["beat"] == 1.0 for e in ev)
    if hz and not ho: matched = [e for e in ev if e["beat"] == 0]
    elif ho and not hz: matched = [e for e in ev if e["beat"] == 1.0]
    else: matched = [e for e in ev if e["beat"] < DOWNBEAT_THRESHOLD]
    matched = sorted(matched, key=lambda e: (e["measure"], 0 if e["hand"] == "right" else 1, e["beat"]))
    return {"count": len(matched), "events": [_slim(e) for e in matched]}
def t_get_pitch_at(ev, a):
    m, b, h = _as_int(a.get("measure")), _as_num(a.get("beat")), a.get("hand")
    if m is None or b is None: return None
    cand = [e for e in ev if e["measure"] == m and abs(e["beat"] - b) <= BEAT_EPSILON and (h not in ("right", "left") or e["hand"] == h)]
    if not cand: return None
    cand.sort(key=lambda e: (abs(e["beat"] - b), e["note"]))
    return _slim(cand[0])
def t_get_hand_balance(ev, a):
    rh = sum(1 for e in ev if e["hand"] == "right"); lh = sum(1 for e in ev if e["hand"] == "left"); tot = rh + lh
    return {"right_count": rh, "left_count": lh, "ratio": (rh / tot) if tot else None}
def _extreme(ev, a, lowest):
    h = a.get("hand"); xs = [e for e in ev if e["hand"] == h] if h in ("right", "left") else list(ev)
    if not xs: return None
    best = xs[0]
    for e in xs:
        better = (e["note"] < best["note"]) if lowest else (e["note"] > best["note"])
        tie = e["note"] == best["note"] and (e["measure"] < best["measure"] or (e["measure"] == best["measure"] and e["beat"] < best["beat"]))
        if better or tie: best = e
    return _slim(best)

TOOLS = {
    "get_events_in_measure": (t_get_events_in_measure, "Return all MIDI events (notes) in the given measure, with hand, beat (0-indexed), pitch (MIDI number) and name.",
        {"type": "object", "properties": {"measure_number": {"type": "integer", "minimum": 1, "description": "1-indexed measure number."}}, "required": ["measure_number"]}),
    "get_events_in_hand": (t_get_events_in_hand, "Return all MIDI events played by the given hand (right or left) across the phrase.",
        {"type": "object", "properties": {"hand": {"type": "string", "enum": ["right", "left"]}}, "required": ["hand"]}),
    "count_distinct_pitch_classes": (t_count_distinct_pitch_classes, "Count how many DISTINCT pitch classes (C, C#, ... B) appear. Optionally restrict to a measure range. Returns count and the sorted class list.",
        {"type": "object", "properties": {"measure_range": {"type": "array", "items": {"type": "integer", "minimum": 1}, "minItems": 2, "maxItems": 2}}, "required": []}),
    "count_notes_with_pitch_class": (t_count_notes_with_pitch_class, "Count the TOTAL number of notes whose pitch class equals the given one (e.g. 'C', 'C#', 'Bb'). Use for 'how many notes with pitch class X' questions.",
        {"type": "object", "properties": {"pitch_class": {"type": "string", "description": "e.g. 'C', 'C#', 'Bb'. Octave digits ignored."}}, "required": ["pitch_class"]}),
    "count_beat_1_onsets": (t_count_beat_1_onsets, "Count events whose onset falls on beat 1 (the downbeat) of any measure. Returns count and matched events.",
        {"type": "object", "properties": {}, "required": []}),
    "get_pitch_at": (t_get_pitch_at, "Look up the pitch at a specific (measure, beat) position, optionally by hand. Returns the event or null.",
        {"type": "object", "properties": {"measure": {"type": "integer", "minimum": 1}, "beat": {"type": "number", "minimum": 0}, "hand": {"type": "string", "enum": ["right", "left"]}}, "required": ["measure", "beat"]}),
    "get_hand_balance": (t_get_hand_balance, "Return right-hand and left-hand event counts plus ratio rh/(rh+lh).",
        {"type": "object", "properties": {}, "required": []}),
    "find_highest_pitch": (lambda ev, a: _extreme(ev, a, False), "Find the highest-pitched event, optionally by hand.",
        {"type": "object", "properties": {"hand": {"type": "string", "enum": ["right", "left"]}}, "required": []}),
    "find_lowest_pitch": (lambda ev, a: _extreme(ev, a, True), "Find the lowest-pitched event, optionally by hand.",
        {"type": "object", "properties": {"hand": {"type": "string", "enum": ["right", "left"]}}, "required": []}),
}
TOOL_DEFS = [{"type": "function", "function": {"name": n, "description": d, "parameters": p}} for n, (fn, d, p) in TOOLS.items()]

# ── prompts (from annotation-grounding-tool.ts) ───────────────────────────────
SYS = ("You are answering multiple-choice questions about piano music phrases. "
       "Each question has exactly 4 options labeled A, B, C, D.\n\n"
       "You DO NOT see the raw MIDI data. Instead, you have access to a set of "
       "MIDI INSPECTION TOOLS that let you query specific facts about the phrase "
       "(notes in a measure, hand balance, pitch at a position, etc.).\n\n"
       "Strategy:\n"
       "  1. Read the annotation and question carefully.\n"
       "  2. If the question requires MIDI-grounded evidence "
       "(pitch counts, hand counts, specific notes, beat onsets), CALL THE TOOLS to inspect.\n"
       "  3. After gathering enough evidence, respond with ONLY the single letter "
       "(A, B, C, or D) of your chosen answer. No explanation, no punctuation — just the letter.\n\n"
       "Tool calls are free and fast; use them whenever the annotation alone does "
       "not contain a specific fact you need.")

def build_user(p, q):
    at = p["annotation"]; labels = ["A", "B", "C", "D"]
    opts = "\n".join(f"{labels[i]}) {o}" for i, o in enumerate(q["options"]))
    blocks = []
    if at.get("structure"): blocks.append(f"Structure: {at['structure']}")
    if at.get("key_moments"): blocks.append("Key moments: " + "; ".join(at["key_moments"]))
    if at.get("teaching_goals"): blocks.append("Teaching goals: " + "; ".join(at["teaching_goals"]))
    if at.get("style_tips"): blocks.append("Style tips: " + "; ".join(at["style_tips"]))
    if at.get("teaching_notes"):
        tn = "; ".join(f"m{t['measure']}: {t['note']}" + (f" ({', '.join(t['technique'])})" if t.get("technique") else "") for t in at["teaching_notes"])
        blocks.append("Teaching notes: " + tn)
    scope = f"Song: {p['song_id']}\nComposer: {p['composer']}\nKey: {p['key']}\nTime signature: {p['time_signature']}\nPhrase: {p['phrase_window']}"
    return (f"{scope}\n\nAnnotation:\n" + "\n".join(blocks) +
            f"\n\nQuestion: {q['text']}\nOptions:\n{opts}\n\n"
            "Use the MIDI inspector tools as needed to inspect the phrase, then respond with ONLY A, B, C, or D.")

def parse_answer(txt):
    if not txt: return None
    t = txt.strip().upper()
    if len(t) == 1 and t in "ABCD": return "ABCD".index(t)
    m = re.search(r"\b([A-D])\b", t) or re.search(r"([A-D])", t)
    return "ABCD".index(m.group(1)) if m else None

_TOOLCALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)
def parse_tool_calls(text):
    calls = []
    for m in _TOOLCALL_RE.finditer(text):
        try:
            obj = json.loads(m.group(1))
            if isinstance(obj, dict) and obj.get("name"):
                calls.append({"name": obj["name"], "arguments": obj.get("arguments") or {}})
        except Exception:
            pass
    return calls

# ── model (module-scope load; `spaces` defers .to('cuda') to the GPU call) ─────
# There is no GPU at import time on ZeroGPU, so load on CPU here. `.to("cuda")` is
# intercepted by the `spaces` runtime and applied inside the @spaces.GPU call.
# (device_map=... would force a real CUDA op at import and crash — don't use it.)
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

TOK = AutoTokenizer.from_pretrained(BASE_MODEL)
_base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True)
# peft infers the adapter's load device from torch.cuda.is_available(), which `spaces`
# fakes as True at import — that forces a real CUDA safetensors load and crashes
# ("No CUDA GPUs are available"). Pin it to CPU just for the adapter load.
_cuda_avail = torch.cuda.is_available
torch.cuda.is_available = lambda: False
try:
    MODEL = PeftModel.from_pretrained(_base, ADAPTER_REPO, subfolder=DEFAULT_SEED, adapter_name=DEFAULT_SEED)
finally:
    torch.cuda.is_available = _cuda_avail
MODEL.to("cuda")   # deferred by `spaces` until inside @spaces.GPU
MODEL.eval()
_loaded = {DEFAULT_SEED}
_lock = threading.Lock()

def _ensure_seed(seed):
    if seed not in _loaded:
        MODEL.load_adapter(ADAPTER_REPO, subfolder=seed, adapter_name=seed)
        _loaded.add(seed)

@torch.no_grad()
def _gen(messages, use_adapter, seed):
    prompt = TOK.apply_chat_template(messages, tools=TOOL_DEFS, add_generation_prompt=True, tokenize=False)
    inputs = TOK(prompt, return_tensors="pt").to(MODEL.device)
    kw = dict(max_new_tokens=320, do_sample=False, pad_token_id=TOK.eos_token_id)
    if use_adapter:
        MODEL.set_adapter(seed)
        out = MODEL.generate(**inputs, **kw)
    else:
        with MODEL.disable_adapter():
            out = MODEL.generate(**inputs, **kw)
    return TOK.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

def run_agent(p, q, use_adapter, seed, max_iters=8):
    messages = [{"role": "system", "content": SYS}, {"role": "user", "content": build_user(p, q)}]
    trace, final = [], None
    for _ in range(max_iters):
        gen = _gen(messages, use_adapter, seed)
        calls = parse_tool_calls(gen)
        if calls:
            messages.append({"role": "assistant", "content": "", "tool_calls": [{"type": "function", "function": {"name": c["name"], "arguments": c["arguments"]}} for c in calls]})
            for c in calls:
                fn = TOOLS.get(c["name"])
                res = fn[0](p["events"], c["arguments"]) if fn else {"error": f"unknown tool: {c['name']}"}
                trace.append({"tool": c["name"], "args": c["arguments"], "result": res})
                messages.append({"role": "tool", "name": c["name"], "content": json.dumps(res)})
            continue
        final = gen.strip()
        break
    return {"trace": trace, "final": final, "selected": parse_answer(final)}

def _fmt(title, r, q):
    labels = ["A", "B", "C", "D"]; out = [f"### {title}"]
    if r["trace"]:
        out.append("**Tool calls**")
        for t in r["trace"]:
            args = ", ".join(f"{k}={json.dumps(v)}" for k, v in t["args"].items())
            out.append(f"- `{t['tool']}({args})` → `{json.dumps(t['result'])[:150]}`")
    else:
        out.append("_No tool calls — answered from the annotation alone._")
    sel = r["selected"]
    if sel is None:
        out.append(f"\n**Answer:** _unparseable_ · `{(r['final'] or '')[:40]}`")
    else:
        ok = sel == q["correct"]
        out.append(f"\n**Answer: {labels[sel]})** {q['options'][sel]} — {'✅ correct' if ok else '❌ incorrect'}")
    return "\n".join(out)

@spaces.GPU(duration=60)  # ZeroGPU reserves duration+60 (=120s) against the daily quota; keep it
def compare(phrase_label_val, q_idx, seed):  # low so calls start on modest remaining quota (a 120 bump
    # reserved 180s and failed at 161s-left). 60 was the part-2 proven value; the two loops fit it.
    import traceback
    try:
        p = PHRASE_BY_LABEL.get(phrase_label_val) or PHRASES[0]
        q = p["questions"][int(q_idx)]
        with _lock:
            _ensure_seed(seed)
            base_r = run_agent(p, q, use_adapter=False, seed=seed)
            ft_r = run_agent(p, q, use_adapter=True, seed=seed)
        labels = ["A", "B", "C", "D"]
        header = (f"**Question ({q['type']}):** {q['text']}\n\n"
                  + "  ".join(f"**{labels[i]})** {o}" for i, o in enumerate(q["options"]))
                  + f"\n\n*Correct answer:* **{labels[q['correct']]}**")
        vb = "✅" if base_r["selected"] == q["correct"] else "❌"
        vf = "✅" if ft_r["selected"] == q["correct"] else "❌"
        verdict = f"## Baseline {vb}  ·  Fine-tuned {vf}"
        return header, verdict, _fmt("Prompted baseline · Qwen2.5-7B", base_r, q), _fmt(f"Fine-tuned · jam-ft-v1 · {seed}", ft_r, q)
    except Exception:
        tb = traceback.format_exc()
        return "### ⚠ Error", "", "```\n" + tb[-1800:] + "\n```", ""

# ── UI ────────────────────────────────────────────────────────────────────────
def q_choices(v):
    p = PHRASE_BY_LABEL.get(v) or PHRASES[0]
    return gr.update(choices=[(f"{i+1}. {q['type']} — {q['text'][:64]}", i) for i, q in enumerate(p["questions"])], value=0)

# "Surprise me" — advance a curated, honest divergence cycle (server-side index).
_surprise = {"i": -1}
_surprise_lock = threading.Lock()

def _pct(x):
    return "—" if x is None else f"{round(100 * x)}%"

def surprise_caption(item, p, q):
    cat = item["category"]; b, ft = item["base_score"], item["ft271_score"]
    tag = " · held-out test" if p["split"] == "test" else ""
    head = f"🔀 **{p['composer'].split()[-1]}: {p['title']}** ({p['phrase_window']}){tag} — a *{q['type'].replace('_', ' ')}* question."
    if cat == "ft_rescue":
        body = (f"In the offline B-1 eval (seed271, GGUF) the **baseline missed this and the fine-tune got it right** "
                f"({_pct(b)} → {_pct(ft)}). Hit **Run** to see if it reproduces live.")
    elif cat in ("ft_better", "ft_worse"):
        body = (f"In the offline eval (seed271) the fine-tune scored **{_pct(ft)}** vs the baseline's **{_pct(b)}** here — "
                f"an improvement, but a split across runs, not a clean sweep. See what happens live.")
    elif cat == "both_miss":
        body = (f"An honest one: in the offline eval **both models missed this** (baseline {_pct(b)}, fine-tune {_pct(ft)}). "
                f"The fine-tune doesn't fix everything — prose-heavy questions are exactly what a future B-2 retrain would target.")
    else:
        body = f"Offline eval (seed271): baseline {_pct(b)}, fine-tune {_pct(ft)}. Run it live below."
    return head + "\n\n" + body

def surprise():
    with _surprise_lock:
        _surprise["i"] = (_surprise["i"] + 1) % len(CYCLE)
        item = CYCLE[_surprise["i"]]
    p = PHRASE_BY_ID[item["phrase_id"]]; qi = item["q_idx"]; q = p["questions"][qi]
    label = phrase_label(p)
    q_up = gr.update(choices=[(f"{i+1}. {qq['type']} — {qq['text'][:64]}", i) for i, qq in enumerate(p["questions"])], value=qi)
    return gr.update(value=label), q_up, gr.update(value=DEFAULT_SEED), surprise_caption(item, p, q)

# Piano-roll note data for every phrase, keyed by the exact dropdown label, in the
# explorer's {t,d,n,v,h} render format. Bundled into a <head> script so the roll +
# Web Audio run entirely client-side (no server round-trip, no inference cost).
def _notes(p):
    return [{"t": e["t"], "d": e["d"], "n": e["note"], "v": e["v"], "h": "L" if e["hand"] == "left" else "R"} for e in p["events"]]
JAM = {
    "default": phrase_label(PHRASES[0]),
    "phrases": {phrase_label(p): {"notes": _notes(p), "tempo_bpm": p["tempo_bpm"]} for p in PHRASES},
}

PIANO_JS = r"""
(function(){
  const NS='http://www.w3.org/2000/svg';
  const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const pitchName=n=>NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1);
  let actx=null, playState={raf:0, playing:false}, curLabel=null;
  const phrase=label=>(window.JAM&&window.JAM.phrases[label])||null;

  function buildRoll(ph){
    const notes=ph.notes;
    const W=880,H=270,padL=34,padR=12,padT=12,padB=22;
    const tMax=Math.max(...notes.map(n=>n.t+n.d))*1.02;
    const loP=Math.min(...notes.map(n=>n.n))-1.5, hiP=Math.max(...notes.map(n=>n.n))+1.5;
    const plotW=W-padL-padR, plotH=H-padT-padB;
    const X=t=>padL+(t/tMax)*plotW, Y=p=>padT+(1-(p-loP)/(hiP-loP))*plotH, rowH=plotH/(hiP-loP);
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('width','100%'); svg.style.display='block'; svg.style.borderRadius='8px';
    const add=(tag,at)=>{const el=document.createElementNS(NS,tag);for(const k in at)el.setAttribute(k,at[k]);svg.appendChild(el);return el;};
    add('rect',{x:0,y:0,width:W,height:H,rx:8,fill:'#0a0f18'});
    for(let p=Math.ceil(loP);p<=Math.floor(hiP);p++){ if(((p%12)+12)%12===0){ const y=Y(p);
      add('line',{x1:padL,y1:y,x2:W-padR,y2:y,stroke:'#182234','stroke-width':1});
      const tx=add('text',{x:padL-6,y:y+3,'text-anchor':'end',fill:'#5f6d82','font-family':'ui-monospace,monospace','font-size':'10.5'}); tx.textContent=pitchName(p);
    }}
    const beat=60/ph.tempo_bpm;
    for(let t=0;t<=tMax;t+=beat) add('line',{x1:X(t),y1:padT,x2:X(t),y2:H-padB,stroke:'#121a29','stroke-width':1});
    add('line',{x1:padL,y1:H-padB,x2:W-padR,y2:H-padB,stroke:'#24314a','stroke-width':1});
    notes.forEach(n=>{
      const x=X(n.t), w=Math.max(3,X(n.t+n.d)-X(n.t)-1.5), y=Y(n.n)-rowH*0.42, h=Math.max(3,rowH*0.84);
      const r=add('rect',{x:x,y:y,width:w,height:h,rx:2.5,fill:n.h==='L'?'#9b8cff':'#5b9bff','fill-opacity':0.34+0.5*(n.v/127),stroke:n.h==='L'?'#b3a6ff':'#84b2ff','stroke-width':0.8});
      r.classList.add('jnrect');
    });
    const head=add('line',{x1:padL,y1:padT,x2:padL,y2:H-padB,stroke:'#7fe3b6','stroke-width':1.5,opacity:0});
    svg._meta={X:X,notes:notes,tMax:tMax,head:head};
    return svg;
  }

  window.__jamRender=function(label){
    const mount=document.getElementById('jamroll');
    if(!mount){ setTimeout(()=>window.__jamRender(label),120); return; }
    const ph=phrase(label); if(!ph) return;
    stopPlayback(); curLabel=label;
    mount.innerHTML=''; mount.appendChild(buildRoll(ph));
    const hint=document.getElementById('jamhint'); if(hint) hint.textContent=ph.notes.length+' notes · '+ph.tempo_bpm+' bpm · synthesized live';
  };
  window.__jamTogglePlay=function(){ playState.playing?stopPlayback():startPlay(); };

  function startPlay(){
    const ph=phrase(curLabel); if(!ph) return;
    const svg=document.querySelector('#jamroll svg'); if(!svg||!svg._meta) return;
    try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); }catch(_){ return; }
    if(actx.state==='suspended') actx.resume();
    const master=actx.createGain(); master.gain.value=0.85; master.connect(actx.destination);
    const t0=actx.currentTime+0.08;
    for(const n of ph.notes){
      const f=440*Math.pow(2,(n.n-69)/12), st=t0+n.t, dur=Math.max(0.14,n.d), peak=0.06+0.28*(n.v/127);
      const g=actx.createGain();
      g.gain.setValueAtTime(0.0001,st); g.gain.linearRampToValueAtTime(peak,st+0.006);
      g.gain.exponentialRampToValueAtTime(0.0006,st+dur*0.95); g.gain.setValueAtTime(0,st+dur); g.connect(master);
      const o1=actx.createOscillator(); o1.type='triangle'; o1.frequency.value=f; o1.connect(g); o1.start(st); o1.stop(st+dur+0.03);
      const g2=actx.createGain(); g2.gain.value=0.32; g2.connect(g);
      const o2=actx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2; o2.connect(g2); o2.start(st); o2.stop(st+dur+0.03);
    }
    playState.playing=true;
    const btn=document.getElementById('jamplay'); if(btn) btn.textContent='⏸ Stop';
    const meta=svg._meta; meta.head.setAttribute('opacity','0.9');
    const rects=[...svg.querySelectorAll('.jnrect')], dur=meta.tMax;
    const tick=()=>{
      const el=actx.currentTime-t0;
      if(el>=dur+0.15){ stopPlayback(); return; }
      const x=meta.X(Math.max(0,el)); meta.head.setAttribute('x1',x); meta.head.setAttribute('x2',x);
      rects.forEach((r,i)=>{const n=meta.notes[i]; r.setAttribute('fill-opacity',(el>=n.t&&el<n.t+n.d)?0.98:(0.34+0.5*(n.v/127)));});
      playState.raf=requestAnimationFrame(tick);
    };
    playState.raf=requestAnimationFrame(tick);
  }
  function stopPlayback(){
    if(playState.raf) cancelAnimationFrame(playState.raf); playState.raf=0; playState.playing=false;
    const btn=document.getElementById('jamplay'); if(btn) btn.textContent='▶ Play phrase';
    const svg=document.querySelector('#jamroll svg');
    if(svg&&svg._meta){ svg._meta.head.setAttribute('opacity','0'); svg.querySelectorAll('.jnrect').forEach((r,i)=>{const n=svg._meta.notes[i]; r.setAttribute('fill-opacity',0.34+0.5*(n.v/127));}); }
    if(actx){ try{actx.close();}catch(_){}; actx=null; }
  }
  document.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('#jamplay')){ e.preventDefault(); window.__jamTogglePlay(); } });
  // Robust initial render: DOMContentLoaded may have already fired before this head script
  // runs (SPA hydration), and hydration can wipe the mount after a single render. Poll for
  // ~3s and (re)draw only while the roll is empty, so a user's phrase pick is never clobbered.
  (function ensureInitial(tries){
    if(window.JAM && document.getElementById('jamroll') && !document.querySelector('#jamroll svg')) window.__jamRender(window.JAM.default);
    if(tries>0) setTimeout(function(){ ensureInitial(tries-1); }, 400);
  })(9);
})();
"""
HEAD = "<script>window.JAM=" + json.dumps(JAM) + ";\n" + PIANO_JS + "</script>"

ROLL_HTML = """
<div style="background:#0d1117;border:1px solid #1c2432;border-radius:13px;padding:14px 14px 11px;margin:6px 0 2px">
  <div id="jamroll" style="min-height:120px"></div>
  <div style="display:flex;align-items:center;gap:14px;margin:11px 3px 2px;flex-wrap:wrap">
    <button id="jamplay" type="button" style="display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,monospace;font-size:13px;font-weight:600;padding:8px 17px;border-radius:999px;border:1px solid #5b9bff;color:#eaf1ff;background:linear-gradient(#2c5fb0,#244d92);cursor:pointer">▶ Play phrase</button>
    <span style="font-family:ui-monospace,monospace;font-size:11.5px;color:#7f8da0"><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#5b9bff;vertical-align:-1px;margin-right:5px"></span>right hand&nbsp;&nbsp;<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#9b8cff;vertical-align:-1px;margin:0 5px 0 6px"></span>left hand</span>
    <span id="jamhint" style="font-family:ui-monospace,monospace;font-size:11.5px;color:#5f6d82;margin-left:auto">synthesized live · no inference cost</span>
  </div>
</div>
"""

INTRO = """
# 🎹 AI Jam Sessions — live tool-grounded QA

The **only** surface where the `jam-actions` fine-tune beats the prompted baseline is **tool-grounded** musical QA — it answers by *inspecting* the notes with MIDI tools, not by recalling prose. Pick a phrase (**hear it and see it** on the piano roll), then run the **prompted Qwen2.5-7B-Instruct baseline** and a **jam-ft-v1 LoRA** side by side on the same question. Watch each model call the MIDI tools, then commit to an answer.

> **Honest framing.** On prose-only surfaces the fine-tune is *below* baseline — this shows its winning surface, not a chat box. One seed at a time (default `seed271`, closest to the all-seeds mean); the published claim is the **all-seeds mean, no best-of-seeds**. First run downloads Qwen2.5-7B (~15 GB) — give it a minute.

📄 [Eval write-up](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-eval) · 🧭 [Interactive explorer](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-explorer) · 🤖 [Model](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) · 💾 [Dataset](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)
"""
CSS = ".gradio-container{max-width:1100px!important} footer{visibility:hidden}"
with gr.Blocks(css=CSS, head=HEAD, theme=gr.themes.Base(primary_hue="blue", neutral_hue="slate")) as demo:
    gr.Markdown(INTRO)
    keys = list(PHRASE_BY_LABEL.keys())
    with gr.Row():
        phrase_dd = gr.Dropdown(choices=keys, value=keys[0], label="Phrase", scale=3)
        q_dd = gr.Dropdown(choices=[(f"{i+1}. {q['type']} — {q['text'][:64]}", i) for i, q in enumerate(PHRASES[0]["questions"])], value=0, label="Question", scale=4)
        seed_dd = gr.Dropdown(choices=SEEDS, value=DEFAULT_SEED, label="Fine-tune seed", scale=1)
    gr.HTML(ROLL_HTML)
    with gr.Row():
        surprise_btn = gr.Button("🔀 Surprise me — find a divergent question", scale=1)
        run_btn = gr.Button("▶ Run baseline vs fine-tuned", variant="primary", scale=1)
    surprise_md = gr.Markdown()
    q_md = gr.Markdown()
    verdict_md = gr.Markdown()
    with gr.Row():
        base_md = gr.Markdown()
        ft_md = gr.Markdown()
    # .input fires only on user selection (not programmatic) → surprise() below won't re-trigger it
    phrase_dd.input(q_choices, inputs=phrase_dd, outputs=q_dd, js="(label)=>{window.__jamRender(label); return label;}")
    surprise_btn.click(surprise, outputs=[phrase_dd, q_dd, seed_dd, surprise_md]).then(
        None, inputs=phrase_dd, js="(label)=>{window.__jamRender(label);}")
    run_btn.click(compare, inputs=[phrase_dd, q_dd, seed_dd], outputs=[q_md, verdict_md, base_md, ft_md])
    demo.load(None, js="()=>{ if(window.JAM) window.__jamRender(window.JAM.default); }")

if __name__ == "__main__":
    demo.queue(max_size=12).launch(show_error=True, ssr_mode=False)
