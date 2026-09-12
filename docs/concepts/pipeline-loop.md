# Pipeline Loop

**Last Updated**: 2026-09-12

The daily loop as a contract: what the GitHub Actions job does from reading the digest through synthesis, publishing, and the prune that holds the cap - and the invariants each step must keep. This is the build-time core loop; every other concept doc hangs off it.

**This loop is designed, not built.** Almost none of it exists in code yet. This page states the contract the pipeline must satisfy and says plainly at each step what does not exist. A later doc that describes a stage as shipping when it does not is the failure to avoid.

## The unit of work is one item

An **item** is one digest entry from yen-idhazh - a title, a summary, a source link, and its Topic and Tag ([ui-shell.md](ui-shell.md)) - plus the audio derived from it. yen-oli-kalari does not fetch articles or write summaries; it reads what yen-idhazh already published and adds one thing: a clip.

- Each item is voiced independently. One item's failure is its own: a clip that will not synthesise degrades that item and records why, and the run continues.
- A clip is written **temp-then-rename**, so a clip either exists complete or does not exist. There is no half-written clip.

## Every item gets a voice

The owner ruling of 2026-09-11: **every item is voiced.** The 1 GB cap is not held by voicing only the top items a day - it is held by the prune stage below. Selecting which items get a voice is not a stage in this loop. This reverses what the benchmark alone would suggest, and the reversal is deliberate - see [Rejected alternatives](#rejected-alternatives).

## Storage is bounded by the prune, not by the voice

Measured 2026-09-12 at the real speaking pace: a median day is 370 items and about 258 minutes of speech, which is 46 MB at opus@24k. Unpruned that would fill the 1 GB published site in 22 days - **but nothing is ever unpruned.** The prune stage below clears the oldest audio on every run as steady state, so the site size is a controlled figure rather than a growing one and there is no storage problem to solve. What the cap actually buys is a retention window: at 46 MB a day, 1 GB holds about three weeks of voiced days, and how far back a listener can hear is the thing the cap sets.

**Compute is the constraint that can actually fail a run.** Measured on the runner at a real-time factor of 1.0112, a single job voicing the whole busiest day (731 items) costs 8.58 h against a 6 h cap and does not finish. That is why the loop shards: four runners carry a quarter each and the same day costs 2.15 h ([model-formats-and-inference.md](model-formats-and-inference.md) derives the budget). A run that busts its job loses a day of audio; a full site only shortens the archive.

## The stages

In order, with what each one owns. None of these is built yet.

| Stage | Owns | Emits |
| --- | --- | --- |
| **Read** | Loading the day's committed digest from yen-idhazh and listing every item. It reads the summary text into memory to voice it; it does not copy that text into the audio payload. | The day's item list. |
| **Synthesise** | Turning one item's summary into one speech clip on the runner. The model is chosen on speech quality, real-time factor against the 6 h job, and output bytes against the 1 GB cap. The text is read into memory, voiced, and dropped. | One clip per item, plus its duration and its byte count. |
| **Publish** | Committing the clips and writing the audio payload - the title, the clip location, its duration, its bytes, and an optional peak array ([ui-shell.md](ui-shell.md)) - plus the run manifest the Console reads. | The committed day payload and run manifest. |
| **Prune** | Holding the 1 GB cap by clearing the oldest audio first, so the site stays under the cap as new days arrive. It clears clips, never items: an aged-out day keeps its titles, its Topics, its Tags, and its source links. It records what it cleared - the oldest day still voiced, clips cleared, bytes reclaimed. | The pruned site and the retention figures on the manifest. |

**Prune is what holds the cap.** It is a stage in the loop, not a cleanup script and not a cron nobody watches. A reader who finishes this page should understand one thing above all: the cap is held by throwing away the oldest audio, on every run, as steady state - not by voicing fewer items and not by a one-time alarm. What the prune has cleared is a measured figure on the Console ([ui-shell.md](ui-shell.md)), because an operator has to be able to see how much past is left.

## Synthesis is runner-only

**No speech model ships to the browser.** "Read aloud" means playing a clip the runner already made ([ui-shell.md](ui-shell.md)). The text is voiced once, at build time, and dropped; the audio payload carries the clip, not a second copy of the text the digest already publishes.

One consequence is worth stating, because it frees a real choice: the runner model carries **zero** browser payload budget. A listener never downloads it, so it may be far larger than anything shippable to a page. That is the correct trade when the listener only ever receives the finished bytes.

## What holds at every step

- **No stage fetches at read time.** Everything here is build time; a listener's browser only fetches committed clips (Guardrail #1).
- **No article body is committed or served**, and the audio payload adds no text of its own (Guardrail #1, section 0a).
- **No stage silently drops data.** A failed clip, an aged-out day, and an item not yet voiced are three different facts, and each is recorded as itself ([ui-shell.md](ui-shell.md) carries the words a listener sees).
- **Nothing costs more as the archive grows.** A run reads one day and writes one day; the prune reads the oldest audio, never a walk over everything ever published (Guardrail #12).

## What does not exist yet

- No synthesis stage has run on the target runner as part of this loop. One voice model has been measured standalone ([benchmark](../reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md)), but the loop itself has never voiced a day.
- **The shard stage is designed here and not written.** A single job cannot voice the busiest day inside the 6 h cap, so the fan-out is load-bearing rather than an optimisation.
- The prune stage is designed here and not written. Until it exists, nothing holds the cap and the site would fill in 22 days.
- Whether the audio payload carries a per-item peak array is undecided ([ui-shell.md](ui-shell.md)). The answer moves a payload line and no stage boundary.

## Rejected alternatives

- **Voice only the top-N items a day.** Rejected: every item is voiced and the cap is held by the prune stage instead. Voicing the top 50 a day would fill the 1 GB cap in 189 days rather than 26, but it drops most of the day from audio - the archive the project exists to keep - and makes the "No audio yet" row state ([ui-shell.md](ui-shell.md)) a permanent class of item instead of a pending one. Owner ruling, 2026-09-11 ([benchmark](../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md)).
- **An in-browser text-to-speech model.** Rejected: synthesis is runner-only. An on-device voice model that spoke text a listener pasted would be a second large download after the search encoder (21.6 MB), paid by every listener, for a job that was nobody's first question - and it is the one failure mode that would mean "this product does not work on your machine". Owner ruling 3, 2026-09-11.

## See also

- [vision.md](vision.md) - what the project is for and what it refuses to be.
- [ui-shell.md](ui-shell.md) - the surfaces that render this payload, and the words a listener sees for each item state.
- [design-system.md](design-system.md) - the visual language of those surfaces.
- [../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md](../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - what one day costs to voice, measured.
- [../reference/measurements.md](../reference/measurements.md) - the instrument log of figures now in force.
- [../agents/guardrails.md](../agents/guardrails.md) - the guardrails every stage honours.
- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - the checks a pipeline change runs before it merges.
- [../../CLAUDE.md](../../CLAUDE.md) - the engineering contract, including the layer rules for stages.
