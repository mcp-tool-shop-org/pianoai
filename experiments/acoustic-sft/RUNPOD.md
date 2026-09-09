# Training the acoustic LoRA on RunPod

The whole loop, in the order that spends the least money. Every step before the
last one is free or nearly free, and that ordering is the point: a pod bills from
the moment it boots, so anything that can fail should fail before it exists.

## Before you spend anything

```bash
export RUNPOD_API_KEY=...          # never committed, never printed
node experiments/acoustic-sft/runpod.mjs verify
```

`verify` is read-only. It confirms the API answers, reports **any pod already
billing**, checks the Docker image tag really exists on Docker Hub, and checks
you have an SSH key to inject. It refuses to continue if any of that is missing.

That image check is not ceremony. A nonexistent tag produces a pod that reports
`RUNNING` with no ports — byte-for-byte identical to a dead host — and the studio
has burned four pods learning that.

## The loop

```bash
node experiments/acoustic-sft/runpod.mjs up      # deploy, poll to SSH-ready
node experiments/acoustic-sft/runpod.mjs sync    # push 228 KB of data + scripts
# ssh in, then on the pod:
bash /workspace/acoustic-sft/scripts/pod-bootstrap.sh dry
bash /workspace/acoustic-sft/scripts/pod-bootstrap.sh train
# back on the studio rig:
node experiments/acoustic-sft/runpod.mjs fetch   # pull the adapters
node experiments/acoustic-sft/runpod.mjs down --all
```

`up` prints the exact `ssh` line and writes the endpoint to
`~/.ssh/runpod_acoustic_pod.json`, which is what `sync` and `fetch` read. It polls
for fifteen minutes: `publicIp` populates first, `portMappings` second. Do not
judge a pod dead before that window is up.

`sync` moves six files and nothing else — the 72 training examples, the held-out
36, the tool catalog, the LoRA config, and the two scripts. Not the repository:
pushing `node_modules` and a 115-file dataset to a billing host is minutes of
transfer for nothing.

## On the pod, cheapest check first

`pod-bootstrap.sh` is ordered the same way. GPU, then dependencies, then a data
dry-run, then the run.

| step | what it proves | cost |
|---|---|---|
| `dry` | the GPU is real, deps install, every example renders and tokenizes | minutes, no weights |
| `smoke` | one optimiser step completes end to end | one download, one step |
| `train` | the actual run | the whole thing |

**Do not skip `dry`.** It answers the one question that cannot be answered from
the studio rig: what these examples actually tokenize to. It also asserts the
chat template's prefix property on every example, which is what catches a
tokenizer whose template does not compose the way the trainer assumes.

## max_seq_len, measured

`lora-config.json` used to say `max_seq_len: 4096`, and that number had never
been put in front of a tokenizer. It is now, against the real
`Qwen/Qwen2.5-3B-Instruct` tokenizer on 2026-09-08:

| tool catalog | min | median | max | tokens/epoch | assistant tokens |
|---|---|---|---|---|---|
| full, 54 tools | 13,110 | 13,252 | **13,276** | 953,106 | 11,654 |
| listen, 5 tools | 1,538 | 1,680 | 1,704 | 119,922 | 11,654 |

**All 72 of 72 examples exceeded 4096** on the full catalog, by a factor of
three. `max_seq_len` is now **16,384** — about 3,100 tokens of headroom, which is
roughly a dozen more tools before it binds again. The catalog grew from 53 to 54
this week, so that headroom is not theoretical.

Read the last column twice. The assistant token count is **identical** in both
rows, because the catalog is pure prompt. The full surface costs eight times the
compute for exactly the same learning signal. That cost is accepted on purpose:
the realistic inference condition is the full surface, and a task made easy by
shrinking the menu is the shape the experiment contract exists to prevent.

`per_device_train_batch_size` dropped from 2 to 1 and `gradient_accumulation_steps`
rose from 4 to 8, so `effective_batch` is unchanged at 8. At 13k tokens per
example the activation footprint binds rather than the optimiser, and 1x8 is the
shape the v1 arc proved at this sequence length.

Run `dry` anyway on a fresh pod. It costs minutes and it re-checks the numbers
above against whatever tokenizer that pod actually resolves, plus the chat
template's prefix property on every example. The trainer refuses to train when an
example exceeds the limit rather than truncating, because a silently truncated
training example is a lie told at every step.

## What comes back

`fetch` pulls `runs/` into `experiments/acoustic-sft/runs/`: one adapter per
epoch plus `run-config.json`, the receipt. The receipt carries the seed, every
hyperparameter read from the config, the SHA-256 of the training data and the
tool catalog, the token statistics, the loss curve, the GPU, and the package
versions. That is what makes a result re-runnable rather than merely reported.

There is **no checkpoint-selection heuristic** in the trainer. It saves every
epoch and stops. Choosing among them is the eval's job, on the held-out phrase,
against the trivial baselines and the base model on the same split — rule 4 of
the [experiment contract](../_template/README.md). A trainer that picks its own
best epoch has graded its own homework.

## Teardown

```bash
node experiments/acoustic-sft/runpod.mjs list      # what is billing, and at what rate
node experiments/acoustic-sft/runpod.mjs down --all
```

`down` re-lists afterwards and says plainly whether anything is still billing. It
is the named compensator for `up`, and it is the only one — nothing else in this
directory can delete a pod, including the bootstrap script running on it. A
script that can destroy the host it runs on cannot report that it did.

Two standing rules, both paid for:

- **Never a network volume.** `volumeInGb` is pod-local and dies with the pod.
  The console's "automatically create a network volume" option keeps billing
  after the pod is gone.
- **`cloudType` defaults to SECURE**, which is the dearer tier. The deploy passes
  `COMMUNITY` explicitly.

## If SSH never comes up

The image tag was verified before anything was created, so a pod that boots and
never opens port 22 implicates the host, not the configuration. Check the web
console before terminating — the poller has been wrong before, and the pod is
billing either way. `runpod.mjs down <podId>` when you are sure.
