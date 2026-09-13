# UI Shell

**Last Updated**: 2026-09-14

The shell around the audio: the two surfaces, the frames they sit in, the one docked player, the component vocabulary, and the states every row must handle. The visual language lives in [design-system.md](design-system.md); where the payload comes from is [pipeline-loop.md](pipeline-loop.md). This page is the structure.

**The shell is designed, not built.** It states what the surfaces are and the states they must render; almost none of it exists in code yet. A page that white-screens on a missing payload is a failure, so the states below are designed, not discovered.

## The two surfaces

| Surface | Owns | Reads |
| --- | --- | --- |
| **Listen** | The day's items as a list a listener can play - one row per item, newest first, with a single player docked at the bottom. | The published day payload and its audio clips. |
| **Console** | Whether today's audio got made, what it cost against the caps, and what failed. An operator surface, not a listening one. | The run manifest and retention figures the pipeline wrote ([pipeline-loop.md](pipeline-loop.md)). |

Listen renders in the reading frame, Console in the operator frame; both widths are in [design-system.md](design-system.md). An operator is a reader too, so the Console names things in plain words: no ledger column on screen, and a figure that says what it counts.

## Topic and Tag are the reader's words

Two words name how the day is cut, and a listener never sees the payload word behind either:

- **Topic** - the broad subject of an item. The payload field is `vertical`. The Topic spine down the left of Listen filters the day to one Topic, and a Topic mark on each row's leading edge is the landmark down the scroll ([design-system.md](design-system.md) owns its colour).
- **Tag** - a narrower label within the day. The payload field is `lens`. Tags show as chips above the list, drawn only for the Tags present today.

"Angle" was an earlier word for Tag and is struck (owner ruling, 2026-09-11). The payload field names do not change; only the word on the page does.

## The components

One row component, one player, drawn from the payload with no per-item special case:

- **ListenRow** - one item at rest: a play control on the leading edge, the title, the source name as the link out, the duration as `m:ss` shown before the tap, and the Topic mark. It extends the inherited item card.
- **TimeRail** - the inherited rail that prints the time once per group, newest first. Unchanged.
- **TopicSpine** - the Topic filter down the left, each Topic carrying its live count from the payload.
- **TagChips** - the Tag filter above the list, drawn only for Tags present today, capped with a "more" disclosure.
- **PlayerDock** - the one docked player: now-playing title, the track, previous and next, and the auto-advance toggle. It sits on a raised surface with a panel shadow, in front of the list, not a flat strip glued to the bottom. It is bounded by `--frame-reading`, not the console frame ([design-system.md](design-system.md)).
- **ProgressTrack** - the player's track. Its signature is **`ProgressTrack(elapsed, buffered, duration, peaks|null)`**: `elapsed` fills the played portion, `buffered` shows how much has arrived from the network, `duration` sets the scale, and `peaks` - a per-item loudness array when the payload carries one - draws the track as a waveform. When `peaks` is `null` it draws a plain groove. One component, two renders; the colours are in [design-system.md](design-system.md).

## One component, two renders, and never both at once

**`ProgressTrack` has two renders and exactly one is on screen.** The waveform where the payload carries a peak array, the plain groove where it does not - and `buffered` layers inside whichever render is live, rather than having a surface of its own.

This has to be stated because it was got wrong. The voice-evaluation player stacked a waveform canvas **above** a groove and drew both, which is the same component drawn twice: two seek surfaces for one job, and a listener with two places to click to do one thing. With `peaks` null under owner ruling 4 the canvas was permanently hidden, so what was actually on screen was a hidden element sitting above the only live one - a bug that could not be seen, which is the kind that survives. Corrected 2026-09-14.

## The player's own controls

The dock is the one place a listener changes how they are hearing, so two controls live there and nowhere else:

- **Volume**, on the leading edge beside a mute toggle. A defect at the bottom of the mix is easier to hear loud. It is removed below 640px, where the device has volume keys.
- **Playback speed**, a pill cycling 0.75x, 1x, 1.25x, 1.5x, 2x. A suspected mispronunciation is easier to resolve slow. **It announces itself at any rate other than 1x** - `--band-medium`, 600 weight - because prosody at 1.5x is not the prosody that will ship, and a listener scoring an axis has to know the playback is not the product.

Both persist to the reader's own browser storage, because they are set once a session and not once a clip. Neither reports anywhere (Guardrail #1).

## One docked player, not one per row

There is exactly one player on Listen, docked at the bottom, and playing a row loads that clip into it. See [Rejected alternatives](#rejected-alternatives) for why there is not one player per row.

Auto-advance **defaults to on** (owner ruling 5, 2026-09-11): Listen is a station first and a list second, so when a clip ends the dock steps to the next row. The toggle is sticky once a listener turns it off.

## The wait is measured, never a spinner

Audio genuinely waits on the network, and this shell draws no spinner for it. A spinner spins at the same rate on a 200 ms wait and a dead socket, so it measures nothing a listener cannot already see. Instead:

- The tap gets an immediate result: the play control flips to its active state on the next frame.
- The wait is drawn as a **determinate buffer fill** on the track - the real buffered bytes from the native audio element - so the fill measures the network rather than decorating the wait.
- Past an `audio.slow_ms` threshold the dock adds one line, "Fetching audio...", and never a dot. A clip so big the wait needs more than that is a build-time problem, not a shell one.

## Every row handles its state

A row is never hidden, because hiding an item makes the day's list lie about the day. Each state has its own words, because they are different facts:

- **Playing** - the row the dock is playing, marked with the now-playing highlight ([design-system.md](design-system.md)).
- **Played** - a row whose clip has finished, marked as played.
- **Not voiced yet** - the clip is not made. The play control is replaced by the quiet words "No audio yet". Under [pipeline-loop.md](pipeline-loop.md) every item is voiced, so this is a pending state, not a class of item.
- **Cleared by the prune** - an older day the prune has aged out. The row keeps its title, source, and time and says "Audio cleared to make room", with the source link. The clip is gone; the item is not. An aged-out day must never wear the words of a day that failed.
- **Failed clip** - the fetch failed. Whatever is on screen stays, and the row and the dock say "This clip did not load" and offer Retry and the source link. No white screen.

A day with nothing voiced says so and offers the archive of days that do.

## Peaks are undecided

Whether the audio payload carries a per-item peak array is the one open question from 2026-09-11 ([pipeline-loop.md](pipeline-loop.md)). Until it is answered, `peaks` is `null` and **ProgressTrack ships as the plain groove**. Because it is one payload line and one component parameter, answering it moves a payload field and no component boundary. A waveform of a 36-second news read is close to a flat rectangle, so the plain groove loses little while the question stays open.

## The Console shows the cap being held

The Console's loudest card is **audio stored against the 1 GB cap**, drawn as one bar with the cap as a target marker, because storage is the binding constraint ([pipeline-loop.md](pipeline-loop.md)). Beside it a retention card prints the oldest day still voiced, the clips the last prune cleared, and the bytes it reclaimed - so an operator can see the prune keeping up and how much past is left. The Console draws no reader ornament, and its charts are 2D ([design-system.md](design-system.md) records why there is no 3D).

## Rejected alternatives

- **One `<audio>` player per row.** Rejected: one player is docked and shared. A median day is 370 rows and a max day 731, so a player per row is 370 to 731 media elements on one page - a wall the listener cannot use and a memory bill for elements nobody plays. Playing a row loads its clip into the single dock instead. Panel ruling, 2026-09-11.

## See also

- [design-system.md](design-system.md) - the tokens, frames, and colours these surfaces use.
- [pipeline-loop.md](pipeline-loop.md) - the loop that writes the payload and clips these surfaces render.
- [vision.md](vision.md) - who the two surfaces are for.
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md) - how these surfaces reach the published site, and the states to smoke-test.
- [../reference/measurements.md](../reference/measurements.md) - the measured figures a surface cites.
- [../../CLAUDE.md](../../CLAUDE.md) - the engineering contract, section 12 (published-surface verification).
