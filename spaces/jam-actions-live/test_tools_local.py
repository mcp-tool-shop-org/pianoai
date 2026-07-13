# Local validation of the ported tools + prompt/parse logic (no model, no GPU).
# Execs app.py up to the model-loading marker, stubbing spaces/gradio.
import sys, types, re, json

sys.modules["spaces"] = types.ModuleType("spaces")
sys.modules["spaces"].GPU = lambda *a, **k: (lambda f: f)
sys.modules["gradio"] = types.ModuleType("gradio")

src = open("app.py", encoding="utf-8").read()
# split on the stable model-section prefix (the parenthetical wording has drifted before)
top = src.split("# ── model (")[0]
assert top != src, "model-section marker '# ── model (' not found in app.py"
ns = {}
exec(compile(top, "app_top", "exec"), ns)

PHRASES = ns["PHRASES"]; TOOLS = ns["TOOLS"]; build_user = ns["build_user"]
parse_answer = ns["parse_answer"]; parse_tool_calls = ns["parse_tool_calls"]

fails = []

# 1) Ground-truth check: pitch_class_count correct option == tool count
for p in PHRASES:
    for q in p["questions"]:
        if q["type"] != "pitch_class_count":
            continue
        m = re.search(r"pitch class ([A-G][#b]?)", q["text"])
        assert m, f"no pitch class in: {q['text']}"
        pc = m.group(1)
        res = TOOLS["count_notes_with_pitch_class"][0](p["events"], {"pitch_class": pc})
        expected = q["options"][q["correct"]]
        got = str(res["count"])
        tag = "OK " if got == expected else "MISMATCH"
        if got != expected:
            fails.append(f"{p['song_id']} {pc}: tool={got} correctOption={expected}")
        print(f"  [{tag}] {p['song_id']:<28} pc={pc:<3} tool_count={got:<3} correctOption={expected}")

# 2) every tool runs without exception on every phrase
for p in PHRASES:
    for name, (fn, _d, _s) in TOOLS.items():
        for args in ({}, {"measure_number": 1}, {"hand": "right"}, {"pitch_class": "C#"}, {"measure": 1, "beat": 0}, {"measure_range": [1, 2]}):
            try:
                fn(p["events"], args)
            except Exception as e:
                fails.append(f"tool {name} threw on {p['song_id']} args={args}: {e}")

# 3) prompt builder + parsers
for p in PHRASES:
    u = build_user(p, p["questions"][0])
    assert "Options:" in u and "Question:" in u, "prompt missing sections"
assert parse_answer("A") == 0 and parse_answer(" the answer is C ") == 2 and parse_answer("xyz zzz") is None
tc = parse_tool_calls('<tool_call>\n{"name":"count_notes_with_pitch_class","arguments":{"pitch_class":"C#"}}\n</tool_call>')
assert tc == [{"name": "count_notes_with_pitch_class", "arguments": {"pitch_class": "C#"}}], tc
assert parse_tool_calls("just a letter A") == []

print("\n" + ("PASS — all checks green" if not fails else f"FAIL ({len(fails)}):\n  " + "\n  ".join(fails)))
sys.exit(1 if fails else 0)
