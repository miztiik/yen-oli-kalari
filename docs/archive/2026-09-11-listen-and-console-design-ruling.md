# Listen and Console - the 2026-09-11 design ruling

**Last Updated**: 2026-09-11

**Archived.** The paired design ruling that settled the Listen and Console
surfaces, plus the owner's answers to the five questions it could not settle. It
is history, not the live contract. Every durable rule it produced now lives in
the concept docs under "See also", and those pages govern: where this page and a
concept doc disagree, the concept doc is right.

It is kept rather than deleted for two reasons. Step 5 of
[`../how-to/distill-a-plan.md`](../how-to/distill-a-plan.md) deletes a plan-doc
*into* git history, and when this page was archived the checkout was not yet a
git repository, so there was no ledger for a deletion to leave it in. That
changed on 2026-09-11 when the project moved off OneDrive and was initialised
([`../reference/agent-notes.md`](../reference/agent-notes.md)) - but history
starts at the seed commit, so a deletion now would still erase this rather than
preserve it. The second reason is the durable one: it was never a plan-doc to
begin with, because it carries rationale, which the plan-doc class forbids and
the concept class owns.

Page labels I use throughout (owner's internal names in parentheses): **Listen** (the cast), **Console** (the console). Payload words the reader never sees: `vertical` -> **Topic**, `lens` -> **Tag**, `band` -> **how well we checked it**, `shard`/`truncated` -> **"we could not read the whole source"**.
> **Owner rulings, 2026-09-11 - read this before the sections below.** Four of the five open questions came back settled. **Tag** replaces "Angle" on the page. **Every item gets a voice**, and the 1 GB cap is held by an aggressive prune cycle in the Action rather than by voicing fewer items. **Ad-hoc TTS is struck** - "Read aloud" means playing the clip we generated, so no voice model ships to the browser. **Auto-advance is on by default.** Per-item waveform peaks are the one question still open. Struck sections are kept below with their reason rather than deleted. Full table at [Owner rulings - 2026-09-11](#owner-rulings---2026-09-11).

---

## PART 1 - JONY

### TAB 1 - Listen (the cast)

### Reader's first question
"What can I put in my ears right now, and how long is it?"

### Default view
A single reading column in the inherited `--frame-reading` (1280px), a Topic spine down the left (`--zone-rail`, 14rem), and the day's items as rows on the inherited time rail, newest first. A persistent player docks at the bottom.

Each row, at rest:
- a play control on the leading edge (the thing the owner asked for),
- the **title** (the one thing that lands),
- **source name** in small type, and it is the link out (worldview #7),
- **duration** as `0:36` in the tabular face - the price of the tap, shown before the tap,
- the rail prints the **time** once, per the inherited group marker, not per row,
- a **played** mark reusing the item's read-swatch: filled = not played, hollow = played.

Considered and struck:
- Summary text on the row - struck: the audio *is* the summary; a row that prints it competes with the thing it plays.
- `key_points`, `entities` - struck: a wall of names on 370 rows; they live in a per-row expand.
- A Topic chip on every row - struck: that is what the spine and the leading-edge mark do; a chip on all 370 is one grey stripe repeated.
- Confidence word on every row - struck at rest: printed only when it is not "high" or the source was cut (worldview #6). A high row says nothing, which is how "we could not check this one" stays loud.
- Audio bytes - struck: an operator number; it belongs on the Console.
- N inline `<audio>` players - struck: 370-731 media elements is a wall and a memory bill; one player, always in the same place (Brichter).

### Controls (priority order)
1. Play a row - loads that clip into the one docked player and starts it - tap the leading control; it flips to the playing state on the next frame.
2. Topic spine - filters the list to one topic - anchor click; each entry carries its live count (`AI 71`, `Energy 40`), driven by the payload, so it is never a 40-link tree.
3. Tag chips - narrow within the current view - a chip row above the list, populated only with the Tags present *today*, ordered by count, capped with a "more" disclosure. A taxonomy the day did not use is not drawn.
4. Auto-advance - plays the list as a station - a toggle on the player, **on by default** (owner ruling 5). The page is a station first and a list second; it steps to the next row when one ends, and the toggle is sticky once a reader turns it off.
5. Expand a row - reveals summary, key points, source link, and the "we could not check this" reason - native disclosure, in the document with no script.

### Labelling rules
- "Play", "Playing", "Played". Not "media", not a bare triangle with no name.
- Duration is `m:ss`. A clip with no duration prints nothing, never `0:00`.
- Source name is the exit; it is a real link, not a tooltip.
- Uncertainty in the reader's words: "We could not fully check this one." / "We could not read the whole source." Never `band_low`, never `truncated`.
- Times are absolute UTC, printed once by the rail (inherited).

### Empty / degraded states
- Not voiced yet: the row still renders - title, source, time - and the play control is replaced by the quiet words "No audio yet". The item is never hidden, because hiding it makes the day's list lie about the day. Under owner ruling 1 every item is voiced, so this is a *pending* state and not a permanent class of item.
- Cleared by the prune cycle (owner ruling 1): an older day's row keeps its title, source and time, and prints "Audio cleared to make room" with the source link. The clip is gone; the item is not. An aged-out day must never wear the words of a day that failed - those are different facts and they get different words.
- Failed cross-origin fetch: whatever is on screen stays; the row and the player say "This clip did not load", and offer Retry and the source link. No white screen (inherited Unreachable).
- A day with nothing voiced: "Nothing voiced for this day yet.", and the archive of days that do (inherited Empty/Missing, two sentences, never merged).
- Truncated source: the row plays as normal and the expand carries the one sentence, so a cut source is a fact, not a gap.

### The player, and the no-spinner rule, resolved honestly
One docked player, not per row. Audio genuinely waits on `raw.githubusercontent.com`, and worldview #8 bans the spinner. Both hold, because the ban was always about *measuring*: a spinner spins at the same rate on a 200 ms wait and a dead socket, so it says only "not dead", which the reader can already see. The tap still gets an immediate result - the control flips to active on the next frame. The wait is then drawn as a **determinate buffer fill on the player track** (real buffered bytes, from the native element), which measures something. Past an `audio.slow_ms` threshold it adds one line, "Fetching audio...", and never a dot. If the clip is so big the wait needs more than that, the clip is too big - a build-time problem, not a UI one.

### Component impact
- Extend the inherited **item card** into a **ListenRow**: same hairline, same hover/focus lift, same read-swatch reused as the played mark. One component parameterised by `{title, source_name, source_url, published_at, time_source, topic, lenses, band, band_reason, truncated, audio}`. No per-item special case.
- New generic **PlayerDock** and **ProgressTrack** (see the waveform ruling in Part 3).

---

### TAB 2 - Console

### Reader's first question
"Did today's audio get made, what did it cost against the caps, and what failed?"

### Default view
The console frame (`--frame-console`, 1600px), the inherited run strip newest-first, then a card grid (`auto-fit minmax(220px,1fr)`). Bytes lead, because the benchmark settles that **storage is the binding constraint** - a median day is 40 MB at opus@24k and fills 1 GB in 26 days, while compute only busts at RTF 3.0. So the loudest card is **audio stored vs the 1 GB cap**, drawn as one bar with the cap as a target marker. Owner ruling 1 makes this card the whole point of the page: every item is voiced and the cap is held by an aggressive prune cycle in the Action, so the bar is not a warning that fires once - it is the steady state, and the thing the operator checks is whether the prune is keeping up with the make.

Cards, each the inherited six-part card: newest figure, a markup sparkline over the window, the change painted by declared polarity, the denominator, its sentence:
- Items voiced today (out of items in the day),
- Failures today (ranked list of feeds/items that did not voice),
- Audio bytes today, and days-to-cap at this rate,
- Retention (owner ruling 1): oldest day still carrying audio, clips cleared last run, bytes reclaimed. The prune cycle is what holds the cap, so it is a measured thing on this page and not a silent cron,
- Wall-clock this run vs the 6 h job cap,
- Model used,
- Runner minutes.

Considered and struck:
- A per-item table by default - struck to a "Show item by item" disclosure; the operator's question is "did it get worse", a vertical scan, not 370 rows.
- Cost in currency - struck unless the owner opts in; then it is the Rule #10 counterfactual only, printing its rate, never a bill.
- A live spinner while months load - struck: the console draws reserved boxes at the size the numbers need and shimmers (inherited Waiting).

### Controls (priority order)
1. Window preset (7 / 30 / all) - sets the span every card and the table read - the inherited standing control.
2. Show item by item - reveals the day's per-item table - native disclosure, in the document with no script.
3. Model-change rule - a dashed vertical on every line where the voice model changed - drawn from the run manifests, no arrow across it.

### Labelling rules
- Plain words, no ledger column names on screen (`audio_bytes` -> "Audio stored"). Section 0b.
- A dash where the ledger holds no answer; `<1` where a real measurement rounds away.
- The item count sits beside every share.
- Every number carries hardware, date, spread (Rule #10). Speaking pace is labelled an assumption, per the benchmark.

### Empty / degraded states
- A day the job did not run: the panel stays, the figure reads "Measurement is off" (inherited fixed wording), never a vanished panel.
- Bytes approaching the cap: the target marker and the days-to-cap card carry it as a fact; no red alarm invented without an agreed threshold. With the prune cycle running, the honest reading is "the window is shrinking", so the retention card prints the oldest day still voiced right beside it - the cap is held by throwing away the past, and an operator should be able to see how much past is left.
- A prune run that cleared nothing: it says so in words. A retention card printing a dash on a run that did work is a lie by omission.
- First days with runs but no counters: the inherited "counters but no scores" state.

### The three.js ruling
No. A 3D chart encodes the same 2D series behind a camera and an occlusion problem; depth here carries no variable. An operator reads runs-over-time, a duration distribution, a bytes-to-cap bar and a ranked failure list - all 2D, all already expressible on the inherited ECharts core (selective registration, **197 KB gzipped, already paid** by console and search). three.js is **~200 KB+ gzipped of new payload** that draws nothing a 2D chart does not, and it fails console-design's "a different question deserves a different chart" - 3D is not a different question. Rejected on bytes and on legibility.

### Component impact
- Reuse inherited **Chart.svelte** (ECharts), **Sparkline** (markup), the card grid, the empty-state panel, the run strip, the target-bar. No new chart type.
- New payload only: a generation run manifest extended with `{items_voiced, failures[], audio_bytes, wall_clock_s, model, runner_minutes, pruned_clips, pruned_bytes, oldest_voiced_day}`, read one run / one month at a time (Rule #12 - constant per render, no walk over the archive).

---

### TAB 3 - Read aloud (ad-hoc TTS) - STRUCK BY OWNER RULING 3

Kept as a record, not a plan. The owner's ruling: "Read aloud" means playing the audio *we* generated, not synthesising text a reader pastes. So this tab does not ship, no voice model is downloaded into the browser, and nothing on Listen changes - the dock, the groove and the buffer fill were always about a clip fetched over the network, never about a model on the reader's machine.

What the design said, and why each piece is struck:
- One large text box, one button, voice model downloaded on first use and cached - **struck**: a second large on-device model after the 21.6 MB search encoder, paid by every reader, for a job that was nobody's first question on this site.
- The four-state loader `{idle, getting-voice, ready, failed}` and the copy "Getting the voice ready (one time)" - **struck with the tab**.
- "The voice did not load" + Retry + preserved text - **struck with the tab**. It was the only failure on the whole site that meant "this product does not work on your machine", and it leaves with the surface that needed it.
- The voice/speed "more" disclosure - **struck**: voice and speed are now a build-time choice on the runner, printed on the Console's model card, not a reader control.

The one line that survives, and it is a payload rule: **the full text is read into memory at build time, voiced, and dropped.** The published audio payload carries the title, the clip, its duration and its bytes - not a second copy of the text. The row's expand reads the inherited digest fields it already had; the audio payload adds no text of its own.

---

## PART 2 - SUSAN

### Listen - What this surface is for
A stranger opening the site should feel a made thing that plays today's news, and be able to pick a clip in one glance across the whole day - not scroll a grey ledger.

### Sufficiency
| Check | Verdict | Measurement | What would fix it |
| --- | --- | --- | --- |
| Uses the screen | FAIL | Jony's column sits in 1280px of a 1536px screen and the list itself is one narrow stack; 370-731 rows read as a wall | Keep the reading frame, but give the row real structure: the Topic spine on the left `--zone-rail`, the time-rail grouping already carried, and a leading-edge Topic mark so the eye has landmarks down the scroll. Fill the right `--zone-aside` on wide screens with the docked player expanded (now-playing, waveform, up-next) rather than a thin bar. |
| Figure from ground | PASS | reuses item card: `--color-surface` on `--color-bg`, hairline `--color-rule`, hover `--shadow-md` | Player dock must be `--color-surface-raised` + `--shadow-panel` so it sits in front, not a flat strip glued to the bottom. |
| One thing lands first | FAIL | every row's play control is the same weight; nothing is the day's lead and nothing marks "now playing" | The day's first item gets `--text-lg` title weight; the playing row takes `--tint-accent` and a filled state. One thing, then the rest quieter. |
| Made this year | FAIL | a play triangle plus a grey line is a 2009 podcast list | A real progress/waveform treatment on the dock (Part 3 token), a played-swatch that animates hollow on completion, and topic colour from the categorical ramp. Warmth costs almost no bytes. |

### Keep
The single docked player over N inline ones. Source-as-link. Duration before the tap. Silence on high-confidence rows. The determinate buffer instead of a spinner - that is the correct, honest answer and it must survive the fix.

### The veto that cost the most
Striking the Topic mark and any per-row colour "because a chip on 370 rows is one grey stripe." True of a *chip*; false of a *mark*. What the reader lost was every landmark down a 700-row day - figure and ground on the one surface they scroll most. Put the colour on the leading edge (categorical ramp, carries no verdict), not in a chip, and the objection and the loss both disappear.

### Ruling
SEND BACK - the player and the honesty are right; the list is still one column of quiet rows and needs landmarks, a lead, and a made-this-year dock before it ships.

---

### Console - What this surface is for
An operator glancing to see the pipeline is alive and not about to hit a wall.

### Sufficiency
| Check | Verdict | Measurement | What would fix it |
| --- | --- | --- | --- |
| Uses the screen | PASS | `--frame-console` 1600px, `auto-fit minmax(220px,1fr)` grid | - |
| Figure from ground | PASS | inherited card grid, panel shadow/hairline | - |
| One thing lands first | PASS | bytes-vs-1GB bar is the loudest card, which is the binding constraint the benchmark named | Hold it there; do not let items-voiced steal the lead. |
| Made this year | PASS | ECharts 2D, target marker, sparklines | - |

### Keep
Bytes lead. Cost-in-currency stays a labelled counterfactual or stays off. The empty state is the panel.

### The veto that cost the most
None - this surface was built to the console doctrine already.

### Ruling
SHIPS - reuse the console vocabulary as specified; add no token.

---

### Read aloud - STRUCK BY OWNER RULING 3

The surface is gone, so the verdict is moot. Recorded because of what it shows: the tab scored well on three checks precisely because it did *one* job - and it is struck because that job was not one the reader ever asked for. Doing one thing beautifully is not the same as doing a thing worth doing.

Susan's one FAIL on it - "a bare progress bar for the model download reads like a 2004 installer" - dies with the surface. The fix it pointed at survives as a general rule: **any wait on this site borrows the dock's determinate fill**, never a system-dialog bar and never a spinner.

---

## PART 3 - THE JOINT RULING

### Where they disagreed, and who won

| Question | Jony | Susan | Resolved |
| --- | --- | --- | --- |
| One player or N | one dock | agrees, but must be designed | **Both.** One dock; Susan wins that it is `--color-surface-raised` + `--shadow-panel` with a waveform, not a flat strip. |
| Row colour | strike per-row colour | landmarks or it is a grey wall | **Susan wins.** Topic mark on the leading edge from the categorical chart ramp (carries no verdict - legal). Not a chip. |
| Lead / now-playing weight | uniform rows | one thing lands first | **Susan wins.** Day-lead title at `--text-lg`; playing row at `--tint-accent`. |
| Tags nav | filter chips from today's view | (no objection) | **Jony wins.** Chips populated from the payload, capped + disclosure. Never a 40-link tree. Owner ruling 2 renames Angle -> **Tag**. |
| Confidence on the row | silent unless low/cut | accepts, given the marks now exist | **Jony wins.** Word only when not high or source cut. |
| Wait feedback | determinate buffer, no spinner | keep it | **Jony wins, both agree.** |
| three.js vs ECharts | ECharts 2D | ECharts 2D | **Agreed. No 3D.** |
| Waveform | determinate, real bytes | must look made this year | **Both.** Real progress + optional precomputed waveform; elapsed and buffered both measure real values. |

### Agreed spec - the two tabs

**Listen.** Reading frame (1280px). Topic spine left (`--zone-rail`), each topic with its live count; "All" default. Tag chips above the list, drawn only for Tags present today, capped with "more". Items as inherited item-card rows on the inherited time rail, newest first, grouped by rail marker. Row = play control + title (day-lead at `--text-lg`) + source-name-as-link + duration `m:ss` + played-swatch; a leading-edge Topic mark from the categorical ramp; a confidence/"could not read the whole source" word only when not high or cut; summary/key-points/source in a native expand reading the inherited digest fields. Every item is listed and every item is voiced (owner ruling 1) - a row not yet voiced says "No audio yet", a row the prune cycle has cleared says "Audio cleared to make room", and both still link out. One docked **PlayerDock** (`--color-surface-raised`, `--shadow-panel`): now-playing title, **ProgressTrack**, prev/next, auto-advance toggle **on by default** (owner ruling 5). Tap flips state next frame; the cross-origin wait draws as a determinate buffer fill, one line past `audio.slow_ms`, never a spinner. Failed clip: keep the screen, "This clip did not load", Retry + source link. Empty day: say so, offer the archive.

**Console.** Console frame (1600px). Run strip, then a card grid led by **audio stored vs the 1 GB cap** (a bar with the cap as a target marker - storage is the binding constraint, 26 days to full at 40 MB/day, and under owner ruling 1 the cap is held by an aggressive prune cycle rather than by voicing fewer items). Cards: items voiced / failures (ranked) / bytes-and-days-to-cap / retention (oldest day voiced, clips cleared, bytes reclaimed) / wall-clock vs 6 h / model / runner minutes, each the inherited six-part card with a markup sparkline and polarity-painted change. Per-item table behind "Show item by item". Currency only as the Rule #10 counterfactual, if the owner opts in. All charts ECharts 2D. No 3D.

**Read aloud.** Struck by owner ruling 3. No third tab, no text box, no voice model in the browser. "Read aloud" is what the Listen dock already does: play the clip we generated. The text is read into memory at build time, voiced, and dropped.

### Component list (generic, payload-parameterised - no per-item special case)
- **ListenRow** - extends the inherited item card. Params: `title, source_name, source_url, published_at, time_source, topic, lenses[], band, band_reason, truncated, audio{url,duration,bytes,peaks?}, played`.
- **TimeRail** - inherited, unchanged.
- **TopicSpine** - params: `[{topic, count}]`; drives the filter; counts from the payload.
- **TagChips** - params: `[{tag, count}]` present in the current view; cap + disclosure. (Payload field stays `lens`; the page word is Tag.)
- **PlayerDock** - params: now-playing `ListenRow` slice; prev/next; auto-advance.
- **ProgressTrack** - params: `elapsed, buffered, duration, peaks|null`. `peaks` -> waveform bars; `null` -> plain groove. One component, two renders.
- ~~**ReadAloud**~~ - struck by owner ruling 3. No browser voice model, no loader state, no text param.
- Console reuses inherited **Chart.svelte**, **Sparkline**, card grid, empty-state panel, run strip, target-bar. New data only: the extended run manifest.

### New design tokens (named slots in existing scales; everything else inherited)
The audio player is the only surface with no inherited slot. Colour, so it is declared in **both** theme blocks (a dark groove is not a light groove flipped):

- `--audio-elapsed: var(--color-accent)` - the played portion. Alias, no new hue.
- `--audio-track: var(--color-rule-strong)` - the unplayed groove. Alias.
- `--audio-buffered` - the buffered-ahead portion, the one genuinely new value because it must sit between elapsed and track: light `rgba(79,70,229,0.25)`, dark `rgba(139,139,245,0.30)`. Named by purpose, re-tuned per theme, not one alpha reused.
- Waveform bars reuse the two above: played bars `--audio-elapsed`, unplayed `--audio-track`. Bar gap `--space-1`, bar radius `--radius-sm`, groove ends `--radius-full`. No new space or radius token.
- Now-playing row highlight reuses `--tint-accent`. No new tint.

**The progress/waveform treatment, stated:** a determinate groove that fills left-to-right in `--audio-elapsed` as the clip plays, with a quieter `--audio-buffered` sub-fill showing how much has arrived from the cross-origin fetch - so the fill *measures the network* rather than decorating the wait. Where the payload carries a small precomputed peak array per item (bounded, e.g. ~60 samples, rendered only for the now-playing item, computed at build time - no runtime audio analysis, Rule #1-clean, constant per render under Rule #12), the groove upgrades to a bar waveform using the same two colours. No peaks -> plain groove. Same component either way.

### three.js vs ECharts - the bytes
**ECharts, 2D, 0 marginal bytes** - selective registration is already on the site at 197 KB gzipped (console + search). **three.js rejected: ~200 KB+ gzipped of new payload** for 3D that encodes no extra variable and adds occlusion. Bytes and legibility both say no.

### Owner rulings - 2026-09-11

Five questions went to the owner. Four came back settled; one is still open.

| # | Question | Ruling | What it changes above |
| --- | --- | --- | --- |
| 1 | All items voiced, or only top-N, given 26-days-to-full? | **All items.** The 1 GB cap is held by an aggressive prune cycle in the Action, not by voicing fewer items. | "No audio yet" becomes a *pending* state rather than a class of item. New row state "Audio cleared to make room". New Console retention card - oldest day voiced, clips cleared, bytes reclaimed - plus three new manifest fields. |
| 2 | Topic / Angle / Band - the plain words | **Topic and Tag.** "Angle" is struck. | `lens` -> **Tag** on every surface; `AngleChips` -> `TagChips`. The payload field name does not change. |
| 3 | Does Read aloud ship? | **Not as ad-hoc TTS.** "Read aloud" means playing the clip we generated. No text box, no voice model in the browser. | TAB 3 struck, Susan's verdict on it struck, `ReadAloud` struck. The payload rule that survives: the full text is read into memory at build time, voiced, and dropped. |
| 4 | Waveform peaks in the payload | **Open.** | `ProgressTrack` ships as the plain determinate groove until answered. `peaks` stays an optional param, so the answer moves a payload line and no component boundary. |
| 5 | Auto-advance default | **On.** | The dock toggle starts on; the page is a station first, a list second, and the toggle is sticky once a reader turns it off. |

### What ruling 3 costs, and what it buys

It removes the second large on-device model, which was the one genuinely unbounded byte risk in the design - the search encoder is 21.6 MB and a voice model is the same order again, paid by every reader on first use. It also removes the only surface whose failure mode read as "this product does not work on your machine": no WebGPU, blocked hub, storage quota. Nothing on Listen leaned on it. The dock, the groove and the buffer fill were always about a clip arriving over the network.

What it costs is the paste-some-text use, which was not the reader's first question on any check. The ruling also tightens the payload: the audio side carries a title, a clip, a duration and a byte count - not a second copy of the text the digest already publishes.

### Two models, not one - and now only one

The owner's note that the Action runner and the browser need not run the same voice model was right, and ruling 3 resolves it in the useful direction: **there is no browser model at all.** So the runner model is chosen on three things only - speech quality, real-time factor against the 6 h job cap, and output bytes against the 1 GB cap - and carries **zero** browser payload budget. That frees the runner to use a model far too large to ever ship to a page, which is the correct trade when the reader only ever receives the finished bytes.

If a browser voice is revisited later, it returns as a separate removable surface under the search-encoder precedent, and it is a *different* model from the runner's by default. Nothing in this spec assumes they are the same.

### Still open - ruling 4, stated plainly

**The question:** should every voiced item carry a small precomputed array of loudness samples - roughly 60 numbers - in the daily payload, so the player's groove draws as a bar waveform instead of a plain filling bar?

- **For it:** this is the "made this year" difference Susan asked for. It is computed at build time, so Rule #1 is clean and there is no runtime audio analysis, and it is bounded and constant per render under Rule #12.
- **Against it:** it is new bytes per item, per day, forever - on a project where ruling 1 has just put *every* item into the audio budget and storage is already the binding constraint. It encodes no variable the plain groove lacks: elapsed and buffered are already real measurements. And a waveform of a 36-second news read is close to a flat rectangle, so the decoration may not even look like much.
- **Either way it is one component:** `ProgressTrack(elapsed, buffered, duration, peaks|null)`. `null` draws the groove, an array draws bars.

### The questions as asked - answered above, kept for provenance

1. **Does "all items eventually" get audio, or only top-N, given 26-days-to-full?** The benchmark says voicing every item fills 1 GB in 26 days; storage, not compute, is the wall. The Listen design already survives this by listing *all* items and voicing *some* ("No audio yet" on the rest). But whether the archive keeps every clip, or ages clips out, is a retention decision (Carmack's byte call, not ours). -> **Answered: all items, held by an aggressive prune cycle.**
2. **The plain words.** We chose **Topic** (`vertical`), **Angle** (`lens`), and "we could not fully check this one" (`band`). If "Angle" still reads as jargon, the fallback is **Tag**. Owner confirms the vocabulary. -> **Answered: Topic and Tag.**
3. **Does Read aloud ship at all?** It is a second large on-device model after the 21.6 MB search encoder. The model choice and its bytes are Andre/Carmack territory; the *design* is ready either way. -> **Answered: not as ad-hoc TTS. No browser model.**
4. **Waveform peaks in the payload.** Bounded per item, but it is new bytes per item every day - a person should agree the per-item cost under Rule #12 before it goes in. Until then, ProgressTrack ships as the plain determinate groove. -> **Still open.**
5. **Auto-advance default on or off** - a station that plays the day, or one clip at a time. A small taste call we leave to the owner. -> **Answered: on.**

## See also

- [`../concepts/vision.md`](../concepts/vision.md) - what the project is for, and what it refuses to be.
- [`../concepts/pipeline-loop.md`](../concepts/pipeline-loop.md) - the daily loop, and the Prune stage that holds the cap.
- [`../concepts/ui-shell.md`](../concepts/ui-shell.md) - the two surfaces, the components and the row states this ruling designed.
- [`../concepts/design-system.md`](../concepts/design-system.md) - the frames, the audio tokens and the ECharts ruling.
- [`../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md`](../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - the run that priced the audio.
- [`../reference/measurements.md`](../reference/measurements.md) - the figure now in force for each quantity.
- [`../reference/documentation-structure.md`](../reference/documentation-structure.md) - the doc classes, and why this page sits in the archive tier.
