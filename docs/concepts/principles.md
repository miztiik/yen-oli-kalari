# Principles

**Last Updated**: 2026-09-11

The small set of beliefs that shape every yen-oli-kalari decision, stated once as
vocabulary. These operationalize the engineering contract for a build-time audio
pipeline; the authoritative guardrails live in [../../CLAUDE.md](../../CLAUDE.md) and
the guardrails-only digest in [../agents/guardrails.md](../agents/guardrails.md). This
page explains the *why* a reader needs before those guardrails make sense - it does
not restate them.

The numbering follows the sibling project's principles page for the subjects the
two share, so a reader who knows one can read the other. Principle 12 is this
project's own, because its binding constraint is not the sibling's.

## 1. Static-first, or there is no project

What reaches a listener is a file that was committed hours earlier - the clip and
the payload that describes it. No backend, no runtime inference, no accounts, no
telemetry, no calls home. This is not asceticism: it is the only shape in which a
one-person project keeps running for years without a bill, an on-call rota, or a
breach. Every design question starts by asking what can be decided at build time,
because build time is the only time there is.

## 2. The runner is the architecture

A stock 4 vCPU runner with no GPU, a 6 h job cap and a 1 GB published site is the
machine. Which voice model can be used, how many items get voiced, what bitrate a
clip carries and how long the archive reaches back all fall out of that. When a
feature does not fit, the feature is simplified - the budget is not raised.
Treating the constraint as the platform rather than as an inconvenience is what
keeps the design honest.

## 3. Measured, not estimated

An unmeasured number may not justify a design. Every throughput, size, cost and
quality claim carries the hardware it came from, the date and the spread. The
live example on this project is the speaking pace: 150 words a minute is an
**assumption**, not a measurement, so every byte and hour figure downstream of it
is an estimate and says so. A model that speaks at 130 words a minute moves all
of them by 15 percent. When a measurement contradicts the design, the design
changes - which is the point of measuring at all.

## 4. Contracts before logic

Every persisted shape is a typed model before anything reads or writes it, and
the schemas and frontend types are generated from those models rather than
written twice. Stages then talk in validated payloads rather than function calls,
so a boundary can be logged, replayed and tested from a real fixture. The shape
of the data is the design; the code is an implementation detail of it.

## 5. Text is data, never instruction - and a synthesiser is a parser

This project does not fetch the open web. The text it voices arrives already
fetched, sanitized and published upstream, so the prompt-injection hazard of a
summarising pipeline is not the hazard here. The hazard that replaces it is
narrower and easier to forget: **a speech synthesiser is a parser, and the text
is untrusted input to it.** A hostile string aims at the front end - markup that
a synthesiser interprets, a control sequence, a pronunciation directive, a
pathological length. Nothing derived from the text becomes a shell argument, a
file path, or a URL to fetch. The schema and the sanitizer are the control.

## 6. The voice is measured, or it is run on taste

A voice nobody measures mispronounces a company name for a year and nobody
notices, because every clip sounds equally fluent. Fluency is exactly what a
speech model is good at, so it is the worst possible signal of correctness. The
measurement therefore looks at what fluency hides: whether the words that came
out are the words that went in, and whether names, numbers, acronyms and units
survived.

The corollary is a rule that is easy to break by accident and is stated in
[../../CLAUDE.md](../../CLAUDE.md) section 0a: **a metric used to choose an
output can no longer detect that outputs are getting worse.** The selector and
the alarm stay separate, and no model decides what publishes.

## 7. Degrade, do not fail

One item that will not synthesise, one clip that will not upload, one source that
has gone - each degrades its own item, records why, and lets the run finish. Work
items are independent by construction: one clip is one file written
temp-then-rename under a predictable path, so a failure never damages a sibling
and a re-run costs only what did not finish. The day publishes even at zero
successes, because a failure count that nobody sees is a failure nobody fixes.

## 8. Config-driven, with sane defaults

Bitrate, voice reference, retention window, prune thresholds, retry budgets and
the caps live in `config/`, schema-validated, never in code. A fresh clone runs
on the defaults. Tuning the system should never require reading it.

## 9. Logging is local by construction

There is no log sink, because there is nothing to send logs to. On a developer
machine the backend writes structured records to stderr; in CI the same stream is
what the Actions run retains, and that IS the log store; on the published page
the browser console is the whole of it. A stage logs the same structured payload
it emits, so a log line and a persisted file never disagree about what happened.

## 10. Publish the clip and the link, never the article

The pipeline serves a URL, the summary already published upstream, and the audio
of that summary. The text is read into memory, voiced, and dropped - the audio
payload carries a title, a clip, a duration and a byte count, not a second copy
of the text. This is a copyright rule and a scope rule at once, and it is also
why the link to the original is a first-class element of every item rather than a
footnote.

## 11. Delete before you build, and build before you settle

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

## 12. The window moves, and moving it is the feature

Every item gets a voice. Measured 2026-09-11, a median day is 370 items and about
222 minutes of speech, which is 40 MB at opus@24k - and 40 MB a day fills the
1 GB published site in 26 days. Nothing about that is fixable by voicing fewer
items, because **storage is the binding constraint and compute is not**: the job
only busts its 6 h cap at a real-time factor of 3.0 and above, so a faster model
does not rescue the design.

So the cap is held by throwing away the oldest audio, on every run, as steady
state. **The prune is a stage in the loop, not a cleanup script and not a cron
nobody watches** ([pipeline-loop.md](pipeline-loop.md)). Two consequences follow
and both are load-bearing. The archive is a **moving window**, so an item that
plays today may be a title and a link next month, and the surface says which of
those it is in plain words rather than going quiet. And what the prune cleared is
a **measured figure** an operator can see, because a window that shrinks silently
is indistinguishable from a pipeline that stopped working.

## Design rationale

These twelve are not new law - they are the concept-tier restatement of the Adaptive Guardrails
in the vocabulary an audio pipeline needs, so a contributor learns the *why* from
the concept tier and the *rule* from the contract. The rejected alternative was
to let each concept doc re-derive the ethos in passing; that duplicates the
contract and drifts ([../../CLAUDE.md](../../CLAUDE.md) Guardrail #4, one definition).

**Principle 5 is the one that changed most from the sibling, and the change is
the point.** Inheriting "fetched text is data, never instruction" verbatim would
have armed this project against a threat it does not face - it fetches nothing -
while leaving the threat it does face unnamed. A principle carried across
unexamined is worse than a missing one, because it reads as though somebody
checked.

**Principle 12 has no sibling counterpart** because the sibling's archive is text
and grows slowly enough to keep. Audio does not. A project whose defining
constraint is absent from its own principles page will rediscover that constraint
in an incident instead.

## See also

- [vision.md](vision.md) - what the project is and is not.
- [pipeline-loop.md](pipeline-loop.md) - the stages these principles govern, and the prune that holds the cap.
- [ui-shell.md](ui-shell.md) - principles 7 and 12 as states a listener actually sees.
- [design-system.md](design-system.md) - principle 11's second clause as the sufficiency checks.
- [../reference/measurements.md](../reference/measurements.md) - principle 3 in force: the figure now in force for each quantity.
- [../reference/documentation-structure.md](../reference/documentation-structure.md) - where a statement of project knowledge belongs.
- [../agents/guardrails.md](../agents/guardrails.md) - the guardrails-only digest every advisor loads.
- [../../CLAUDE.md](../../CLAUDE.md) - the authoritative contract.
