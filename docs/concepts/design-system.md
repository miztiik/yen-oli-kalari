# Design System

**Last Updated**: 2026-09-14

The visual and token vocabulary the two surfaces speak. yen-oli-kalari inherits the yen-idhazh design system whole - its type, space, radius, colour and elevation scales - and adds exactly what an audio player needs and nothing else. This page fixes that vocabulary; the surfaces that use it are in [ui-shell.md](ui-shell.md).

**A rule is here if it binds a token or a bound the whole site resolves.** How a named surface renders a state is in [ui-shell.md](ui-shell.md).

## Frames

Two frame widths bound the two surfaces:

- `--frame-reading` - **1280px**, the reading frame Listen renders in, and the frame the docked player is bounded by.
- `--frame-console` - **1600px**, the operator frame Console renders in.

Both are named slots in the inherited frame scale, not new tokens. The surfaces that sit in them are in [ui-shell.md](ui-shell.md).

**Both are declared, and that is a correction rather than a restatement.** Until 2026-09-14 only `--frame-console` existed in the token file, so every surface that wanted the reading frame silently got the console frame - the voice-evaluation player was drawn 320px wider than its own specification and nobody could see the difference, because there was nothing narrower on the page to compare it against. A frame named in this document and absent from the token file is a frame that does not exist.

## The audio tokens

The audio player is the only surface with no inherited slot, so it is the only thing this project adds to the token file. All three tokens are colour, and colour is re-tuned per theme (see below), so each is declared in **both** theme blocks.

- `--audio-elapsed: var(--color-accent)` - the played portion of the track. An alias of the accent colour; no new hue.
- `--audio-track: var(--color-rule-strong)` - the unplayed groove. An alias of the strong rule colour.
- `--audio-buffered` - the portion that has arrived from the network but is not played yet. This is the one genuinely new value, because it must sit **between** elapsed and track: light `rgba(79,70,229,0.25)`, dark `rgba(139,139,245,0.30)`. It is named by purpose and re-tuned per theme, never one alpha reused across both.

No new space, radius, or tint token is minted. The waveform bars reuse the two aliases - played bars `--audio-elapsed`, unplayed bars `--audio-track` - with bar gap `--space-1`, bar radius `--radius-sm`, and groove ends `--radius-full`. The now-playing row highlight reuses `--tint-accent`. Whether bars are drawn at all is a payload question owned by [ui-shell.md](ui-shell.md); when they are not, the track is a plain groove in the same two colours.

## An ordered judgement is the one thing the confidence ramp is for

A score out of five is ordered, so its colour walks the inherited confidence ramp - `--band-low` at 1 and 2, `--band-medium` at 3, `--band-high` at 4 and 5. This is the ramp used for the thing it exists for, and it does not weaken the colour law: **the numeral and the word are always on screen beside the fill** (`5 - excellent`), which is the required second signal. A fill with no numeral would be semantic colour standing alone and is not allowed.

The fourth state is the one that has to be designed rather than derived. **Unrated is not a low score**: it draws no fill, no handle, and the word "unrated" in `--color-text-tertiary`. A rail resting at its left stop with a handle on it reads as a one, which is a value somebody chose.

## Both themes are designed, not derived

A dark groove is not a light groove flipped. `--audio-buffered` carries a different value in the light block and the dark block because the same alpha over a dark ground is not the same colour a reader sees - it reads as almost nothing. That is why the token is declared per theme rather than one value and a filter. The two aliases inherit this for free, because `--color-accent` and `--color-rule-strong` are already designed per theme.

## Colour on a row is a landmark, not a verdict

A row's leading edge carries a Topic mark ([ui-shell.md](ui-shell.md)) coloured from the inherited **categorical chart ramp**. It is a landmark down a long day - a median day is 370 rows and a max day 731 - so the eye has something to navigate by. It carries **no verdict**: the ramp is categorical and holds none of the confidence-ramp hues, so a colour on a row says only which Topic the row belongs to, never whether the item is good or bad.

**Semantic colour never goes on a surface without a second signal, and the confidence ramp's hues are never borrowed for anything categorical.** Both are the inherited colour law and they bind here unchanged.

## Sufficiency is a gate

Every surface passes four checks before it merges. They are doctrine here because craft-restraint on this project is a choice made on purpose, not a constraint the architecture forces - the architecture fixes how much surface there is, never how good that surface is:

1. **Does it use the screen it is on**, at every width?
2. **Does it separate figure from ground?**
3. **Is there one thing the eye lands on first?**
4. **Does it look like it was made this year?**

A surface that fails one ships only with a `## Design rationale` entry that names the failure and the reason; it is neither waved through nor blocked silently. The checks are owned by Susan ([../../.github/agents/susan.agent.md](../../.github/agents/susan.agent.md)); `CLAUDE.md` section 9 carries the Definition-of-Done line.

## Rejected alternatives

- **three.js for the Console charts.** Rejected: the inherited ECharts core (197 KB gzipped, selective registration) is already the site's charting engine, so a 2D chart costs no new bytes; three.js is about 200 KB gzipped of new payload for 3D that draws nothing a 2D chart does not, encodes no extra variable, and adds an occlusion problem. The Console reads runs over time, a duration spread, a bytes-to-cap bar, and a ranked failure list - all 2D. Rejected on bytes and on legibility, panel ruling 2026-09-11.
- **ECharts on the voice-evaluation page.** Rejected there and only there: that page has to open from a file path with no bundler, which is what ruled the inherited engine out and left it concatenating SVG strings by hand. It draws with **d3 instead, trimmed to the nine modules it uses and committed rather than fetched** - measured 2026-09-14 at 69.1 KB raw and 23.9 KB gzipped, against about 280 KB for the full distribution. This does not make the site two-engined: ECharts is not on that page and cannot be, so d3 is the only engine it has. Nothing here changes what the Console will use. Owner instruction, 2026-09-14; cost recorded per Guardrail #8, and the figure is written by the script that builds the bundle rather than quoted from memory.

## Design rationale

**A score is drawn as a rail with five stops, not as five boxes and not as a free-moving handle.** Five numbered boxes said what was chosen and nothing about what it meant, so a listener scanning a judged clip read four numerals and did the comparison in their head. A fill is read at a glance. But a continuous handle cannot be set to an exact value in one action, and this instrument is twenty-four clips on four axes, so a free rail turns a tap loop into ninety-six drag-and-corrects. The rail keeps five stops and snaps to the nearest one from a click anywhere along it - the input model of the boxes, with the readability of a fill. Authority: owner asked for the rail and the fill, Susan ruled the stops load-bearing, 2026-09-14.

## See also

- [ui-shell.md](ui-shell.md) - the surfaces and components that use these tokens.
- [vision.md](vision.md) - what the surfaces are for.
- [pipeline-loop.md](pipeline-loop.md) - where the payload these surfaces render comes from.
- [../reference/measurements.md](../reference/measurements.md) - the measured figures a surface cites.
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md) - how a surface ships to the published site.
- [../../CLAUDE.md](../../CLAUDE.md) - the engineering contract, section 9 (Definition of Done).
