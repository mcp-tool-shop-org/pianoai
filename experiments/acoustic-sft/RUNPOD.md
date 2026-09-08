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

## The thing `dry` is really there to tell you

`lora-config.json` says `max_seq_len: 4096`. That number has never been validated
against a real tokenizer, and the full 54-tool catalog is **47 KB of JSON before
a single message is added** — comfortably past 4096 tokens on its own. The
`listen` subset is 5 KB.

So one of two things is true after `dry`, and the trainer will tell you which:

- every example fits, and it prints the headroom; or
- some exceed it, and it prints the largest and refuses to train.

It refuses rather than truncating, because a silently truncated training example
is a lie told at every step. Raise `max_seq_len` to what `dry` measured, or run
with `--tools listen` and accept that the model is learning tool selection from a
five-item menu rather than the fifty-four it faces live.

Prefer raising the limit. The realistic inference condition is the full surface,
and a task made easy by shrinking the menu is the shape the experiment contract
exists to prevent.

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
