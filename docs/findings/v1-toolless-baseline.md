# jam-actions-v1: the tool-less baseline, run before any GPU

**mistral-small:24b, 56 held-out records, 5.4% overall.**

Each question asked with **no tools, no record, no context** — just the user turn. Whatever the model
gets right, it got from pretraining, and those records measure recall rather than tool use.

| family | correct | accuracy |
|---|---|---|
| `chord` | 2/7 | 28.6% |
| `compare` | 0/4 | 0.0% |
| `measures` | 0/9 | 0.0% |
| `sections` | 0/9 | 0.0% |
| `teaching_cues` | 1/9 | 11.1% |
| `teaching_note` | 0/9 | 0.0% |
| `transpose` | 0/9 | 0.0% |
| **total** | **3/56** | **5.4%** |

For contrast, `jam-actions-acoustic-v0`'s fairly-prompted base model scored **97.2%** on its own
held-out split. That corpus was built, published, and fine-tuned on before anyone measured it. One
pod and 35 minutes to learn what this script answers in two minutes for free.

## The prediction I got wrong

I expected `transpose` to be the leaky family. "Transpose Scarborough Fair up a whole step, what key
is the result in?" looked like arithmetic on a fact a model already knows. It scored **0/9** — the
key of *this arrangement* is not something pretraining reliably delivers, and the answer format is
specific.

Which is the point of running it rather than reasoning about it. The script is
`src/dataset/acoustic-v1/toolless-baseline.mjs`; it is free, it takes two minutes, and it is now a
standing gate on every new family.
