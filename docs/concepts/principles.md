# Principles

**Last Updated**: 2026-09-12

The beliefs that shape yen-oli-kalari decisions and are **not** already law in
the contract.

**The guardrails are not repeated here.** Static-first publication, the runner as
the production target, measured-not-estimated, contracts before logic, fetched
text as data, degrade-do-not-fail, config-driven defaults and logging that is
local by construction are all stated once, with their reasons, in
[`../../CLAUDE.md`](../../CLAUDE.md) sections 1 and 1a. This page carried a second
copy of all eight until 2026-09-12; the [Design rationale](#design-rationale)
says why that was worse than useless.

What follows is the reasoning an audio pipeline needs that the contract does not
carry.

## 1. The voice is measured, or it is run on taste

A voice nobody measures mispronounces a company name for a year and nobody
notices, because every clip sounds equally fluent. **Fluency is exactly what a
speech model is good at, so it is the worst possible signal of correctness.** The
measurement therefore looks at what fluency hides: whether the words that came
out are the words that went in, and whether names, numbers, acronyms and units
survived.

This is not hypothetical. The model in hand drops out-of-dictionary words from
the audio when its phoneme fallback is unavailable - it logs and continues rather
than failing - which produces a clip that sounds perfect and is missing a name
([`../reference/voice-model-survey.md`](../reference/voice-model-survey.md)).

The corollary is easy to break by accident and is stated in
[`../../CLAUDE.md`](../../CLAUDE.md) section 0a: **a metric used to choose an
output can no longer detect that outputs are getting worse.** The selector and
the alarm stay separate, and no model decides what publishes.

## 2. Publish the clip and the link, never the article

The pipeline serves a URL, the summary already published upstream, and the audio
of that summary. The text is read into memory, voiced, and dropped - the audio
payload carries a title, a clip, a duration and a byte count, not a second copy
of the text. **This is a copyright rule and a scope rule at once**, and it is
also why the link to the original is a first-class element of every item rather
than a footnote.

## 3. Delete before you build, and build before you settle

One developer, weekends. Every kept line is rent paid forever. Before asking how
to build something well, ask whether it should exist: name the consumer and name
what concretely breaks without it. If neither is concrete, the honest answer is
not to build it.

The second clause is not a softening, it is the other failure. **A surface nobody
would choose to look at has not been simplified, it has been abandoned.**
Deleting is free and building is not, so a project that only rewards the first
ratchets one way until what is left is correct and unloved. When the answer is
that the thing should exist, it is then owed the craft that makes it worth
someone's attention - and "it works" is not that.

## 4. The window moves, and moving it is the feature

Every item gets a voice, and the archive is bounded by throwing away the oldest
audio on every run as steady state. **The prune is a stage in the loop, not a
cleanup script and not a cron nobody watches**
([pipeline-loop.md](pipeline-loop.md)).

Two consequences follow and both are load-bearing. The archive is a **moving
window**, so an item that plays today may be a title and a link next month, and
the surface says which of those it is in plain words rather than going quiet. And
what the prune cleared is a **measured figure** an operator can see, because a
window that shrinks silently is indistinguishable from a pipeline that stopped
working.

The figures that size the window live in
[`../reference/measurements.md`](../reference/measurements.md) and are not
restated here. An earlier version of this page carried them inline and was still
asserting a superseded pace, a superseded byte cost, and a superseded conclusion
about which constraint binds.

## Design rationale

**This page held twelve principles until 2026-09-12, and eight were the contract
restated.** Its own rationale said as much: "the concept-tier restatement of the
Adaptive Guardrails". The intent was that a contributor learns the *why* from the
concept tier and the *rule* from the contract - but each guardrail already
carries its reason, so the split bought nothing and cost a second copy.

**Two of those copies had gone wrong, which is the argument against the
arrangement rather than against any one page.** The old principle 12 asserted
that storage was the binding constraint and compute was not, on figures the
2026-09-12 benchmarks superseded. The old principle 5's rationale claimed this
project "fetches nothing", where Guardrail #11 states plainly that it does fetch,
from the upstream digest. **A restatement does not stay a restatement** - it
becomes a second answer, and a reader cannot tell which one governs.

The same failure in the same week removed `docs/agents/guardrails.md`, a
section-by-section mirror of the contract that had drifted into telling agents
the opposite of it.

## See also

- [`../../CLAUDE.md`](../../CLAUDE.md) - the contract: the guardrails this page no longer repeats, and the non-goals in section 0a.
- [vision.md](vision.md) - what the project is and is not.
- [pipeline-loop.md](pipeline-loop.md) - the stages these principles govern, and the prune that holds the window.
- [ui-shell.md](ui-shell.md) - principle 4 as states a listener actually sees.
- [design-system.md](design-system.md) - principle 3's second clause as the sufficiency checks.
- [`../reference/measurements.md`](../reference/measurements.md) - the figure now in force for each quantity.
- [`../reference/voice-model-survey.md`](../reference/voice-model-survey.md) - what is known about the voice principle 1 asks to measure.
