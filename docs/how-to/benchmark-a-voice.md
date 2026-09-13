# Benchmark a voice

**Last Updated**: 2026-09-13

How to get a figure you are allowed to compare. One model, one configuration,
one run - and the reasons that rule is not negotiable.

## The rule

**A benchmark run measures ONE model at ONE configuration, with nothing else
voicing on the runner pool while it is timed.**

Everything below follows from that. If you only need the command, it is:

Actions -> **benchmark one voice** -> pick a model -> Run workflow.

## Why it is not a model list any more

The workflow used to take a comma-separated list of models and cross it with the
shard count. Asking for seven models at four shards started **28 jobs at the same
instant**. They contended for Hugging Face, for npm and for the Actions runner
pool while every one of them was having its wall clock read, and one arm died of
`ETIMEDOUT` inside `onnxruntime-node`'s native postinstall.

That is not a slow benchmark. It is a benchmark that changed what it was
measuring. A real-time factor is meant to say "this model costs this much on a
4-vCPU runner"; a factor taken beside twenty-seven other jobs says "this model
cost this much on a 4-vCPU runner on a busy afternoon", which is not a number a
design may be priced on.

So the run is now one model, and the only fan-out left is shards.

## A shard is a machine, not a thread

A shard is **a whole 4-vCPU runner voicing its own slice of the corpus**. Four
shards are four machines and sixteen vCPU. Splitting one 4-vCPU box four ways
would make each slice slower and the reading meaningless; splitting the corpus
across four boxes leaves every clip costing exactly what it would have cost
alone, and only the elapsed time falls.

That is why sharding survived the re-architecture and the model list did not.

Summaries are dealt **round-robin**, not in contiguous blocks: they vary in
length by more than tenfold, so a contiguous slice would hand one shard every
long one and the fan-out would finish no sooner than a single job.

## The knobs, and why each one is recorded

Every input below changes a figure, so every one of them is written into the
manifest under `run.config` and flattened into the run's `configSlug`.

| Input | What it changes | Why it is in the slug |
| --- | --- | --- |
| `model` | everything | one run, one model |
| `shards` | elapsed time, and which clips are measured together | a merged reading must never be silently compared with an unsharded one |
| `maxWordsAChunk` | inference calls per clip, and the seams a listener is later asked about | it changes speed and quality at once |
| `repeats` | how many times each clip is voiced; the **median** is reported | a defence against one unlucky moment, at linear cost |
| `threads` | inference threads; `0` lets the runtime choose | `0` is a different configuration from `4`, so it is written `auto` |
| `maxItems` | corpus ceiling, applied **before** sharding; `0` is all | a capped reading is not comparable with an uncapped one |

`notes` is free text saying what you were tweaking. It is recorded too, because
a sweep produces runs whose slugs differ by one character.

A run therefore looks like:

```
kokoro-fp32-uk__c40-r1-t4-iall-s4
```

Read it as: chunk 40 words, 1 repeat, 4 threads, all items, 4 shards.

**The slug is derived, never typed.** `test/voice-evaluation/run-config.mjs` is
the only thing that computes it, and
[`tests/test_run_contract.py`](../../tests/test_run_contract.py) proves that
changing any knob changes the slug. A hand-written slug that disagreed with its
own config would be worse than no slug at all.

## Tweaking one thing at a time

That is the whole point of the configuration being in the identity. To answer
"does a smaller chunk cost more?", run the same model twice and change one input:

```
model = kokoro-fp32-uk, maxWordsAChunk = 40   -> kokoro-fp32-uk__c40-r1-t4-iall-s4
model = kokoro-fp32-uk, maxWordsAChunk = 25   -> kokoro-fp32-uk__c25-r1-t4-iall-s4
```

Two runs, two artifacts, two manifests that each state the configuration that
produced them. Nothing overwrites anything, and the difference between the two
figures is attributable to the one knob that moved.

## Measuring several models

Use **sweep the voices**. It dispatches `benchmark one voice` once per model and
waits for each to finish, so at most one model is ever voicing.

It costs the **sum** of its runs rather than the slowest of them - roughly six
times twenty minutes instead of twenty. That is about two hours more for figures
that can actually be compared, and it is the trade this project chooses.

Each model still fans out over its own shards, because that is the parallelism
that does not change the reading.

## What makes a figure comparable

The manifest carries `run.isolated`. It is **true** only when the dispatcher
asserted it, which `benchmark-voice.yml` does because its `voice-measurement`
concurrency group guarantees nothing else is voicing.

Two things are stamped **false**:

- anything published by `publish-listening-page.yml`, which voices every model
  in parallel on purpose so the page builds in twenty minutes rather than two
  hours;
- any local run, because a process cannot see what else is on the machine.

A run that is not isolated must say what polluted it - the schema refuses an
`isolated: false` with no `notIsolatedBecause`. "Do not trust this" without a
reason is not a finding.

`collate-benchmarks.mjs` will not draw the 6 h job-cap table for an unisolated
reading. It says why instead.

Isolation is separate from **host**: `host.isCi` says the runner timed it. A
laptop reading is never comparable regardless of isolation, because the same
corpus measured 1.0112 on the runner and 2.576 on a laptop.

### The lock, and the one thing it cannot do

Every workflow that voices holds the `voice-measurement` concurrency group -
`benchmark-voice.yml`, `publish-listening-page.yml`, `measure-voice.yml` and
both `compare-*` workflows. That is what makes `isolated: true` a statement
rather than a hope: an assertion is only as good as the number of workflows that
can contradict it.

**It is a lock, not a queue.** GitHub holds at most one pending run per
concurrency group, and a newly queued run cancels whichever run was already
pending. `cancel-in-progress: false` protects the run that is *executing*; it
does not create a waiting line. So if one run holds the group, a second is
pending, and a third is dispatched, the second is cancelled.

In practice that means: do not dispatch benchmarks by hand while a sweep is
running. A sweep leg cancelled this way shows as `cancelled` in the sweep's own
summary table, so it is visible rather than silent - but it is still a leg you
have to re-run.

## Merging shards

The merge job recomputes the real-time factor from **all** the merged clips
rather than averaging the shard figures. Averaging would weight a shard that
drew three short summaries the same as one that drew nine long ones.

It **refuses to merge shards whose `run.runId` differs**. A mixed merge does not
look broken - it produces a plausible number describing a configuration that was
never run - so the check is identity rather than directory layout.

It also **will not let one contended shard hide inside a clean reading**.
Isolation is deliberately not part of the run id, so a shard dispatched without
the assertion has the same id as one dispatched with it. The merged run is
isolated only if every shard was, and it names the shard that was not.

**A lost shard is counted, not assumed away.** `shardsExpected` comes from
`run.config.shards`, never from counting the directories that arrived - a shard
that dies before writing its first clip uploads no artifact at all, so counting
the tree would report three of three for a four-shard run and recompute the
totals over three quarters of the corpus. When a shard is missing the merged
manifest carries `shard.complete: false` and `shard.incompleteBecause`, and the
collator prints a warning above the table. The real-time factor survives,
because it is a ratio; the clip count, byte total and audio duration do not.

Peak memory is the **maximum** across shards, never the sum: four shards are four
machines, and a deployment provisions for the worst one.

## On the page

The listening page reads the run block, so two readings of one model can never
look like one row:

- Each model card carries **only the knobs that differ** between the runs on the
  page. When every run shares a configuration the cards stay clean; the moment
  one differs, every card says which. One helper, `runLabel()`, names a run for
  the card, both cross-run charts, the dock title, the A/B selector and the A/B
  tally - six places that each used to build `name + quantisation` themselves and
  therefore rendered two configurations identically.
- A reading that is not isolated carries a **not isolated** badge, the host note
  refuses to call it "the figure the design is priced on", and the cross-run
  chart says some bars carry contention.
- A run that lost a shard carries a **3/4 shards** badge, because its clip count
  and byte totals are short.
- The run readout shows **Chunk size** and **Isolated** beside the speed figures.
- A downloaded evaluation records `benchmarkRunId`, `configSlug`, `config` and
  `isolated` for every run, so a verdict still names the reading it judged after
  the clips are gone.

## Running it locally

You can, and the manifest will say `isolated: false` and `host.isCi: false`, so
nothing downstream will treat the figure as comparable.

```powershell
cd test/voice-evaluation
npm ci
$env:MODEL = "kokoro-fp32-uk"; $env:MAX_ITEMS = "2"
node benchmark-model.mjs
```

To see what a configuration resolves to without voicing anything:

```powershell
$env:MODEL = "kokoro-fp32-uk"; $env:SHARDS = "4"
node run-config.mjs
```

## Adding a knob

A knob is anything that changes a figure. Adding one is deliberately a
three-file change, because a knob that is not recorded makes every reading taken
with it incomparable:

1. `test/voice-evaluation/run-config.mjs` - add it to `KNOBS`, resolve it, put it
   in `slugFor`.
2. `test/voice-evaluation/run-manifest.schema.json` - add it to
   `run.config.properties` **and** `required`. The object is closed, so a knob
   that skips this step fails validation rather than being silently dropped.
3. The workflow input in `.github/workflows/benchmark-voice.yml`.

`tests/test_run_contract.py` checks that the resolver and the schema name the
same set, so forgetting step 2 fails the suite rather than the benchmark.

## See also

- [`../../test/voice-evaluation/run-manifest.schema.json`](../../test/voice-evaluation/run-manifest.schema.json) - the contract every producer and consumer agrees on.
- [`../../test/voice-evaluation/README.md`](../../test/voice-evaluation/README.md) - the harness, the listening page and the four quality scores.
- [`../concepts/model-formats-and-inference.md`](../concepts/model-formats-and-inference.md) - what a real-time factor is, and where the shard budget comes from.
- [`run-the-gates.md`](run-the-gates.md) - what to run before claiming a change is done.
- [`../reference/measurements.md`](../reference/measurements.md) - the figure in force for each quantity.
- [`../reference/evaluation-coverage.md`](../reference/evaluation-coverage.md) - which metrics are measured and which are not.
