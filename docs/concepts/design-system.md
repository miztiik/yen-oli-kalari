# Design System

**Last Updated**: 2026-09-11

The visual and token vocabulary the two surfaces speak. yen-oli-kalari inherits the yen-idhazh design system whole - its type, space, radius, colour and elevation scales - and adds exactly what an audio player needs and nothing else. This page fixes that vocabulary; the surfaces that use it are in [ui-shell.md](ui-shell.md).

**A rule is here if it binds a token or a bound the whole site resolves.** How a named surface renders a state is in [ui-shell.md](ui-shell.md).

## Frames

Two frame widths bound the two surfaces:

- `--frame-reading` - **1280px**, the reading frame Listen renders in.
- `--frame-console` - **1600px**, the operator frame Console renders in.

Both are named slots in the inherited frame scale, not new tokens. The surfaces that sit in them are in [ui-shell.md](ui-shell.md).

## The audio tokens

The audio player is the only surface with no inherited slot, so it is the only thing this project adds to the token file. All three tokens are colour, and colour is re-tuned per theme (see below), so each is declared in **both** theme blocks.

- `--audio-elapsed: var(--color-accent)` - the played portion of the track. An alias of the accent colour; no new hue.
- `--audio-track: var(--color-rule-strong)` - the unplayed groove. An alias of the strong rule colour.
- `--audio-buffered` - the portion that has arrived from the network but is not played yet. This is the one genuinely new value, because it must sit **between** elapsed and track: light `rgba(79,70,229,0.25)`, dark `rgba(139,139,245,0.30)`. It is named by purpose and re-tuned per theme, never one alpha reused across both.

No new space, radius, or tint token is minted. The waveform bars reuse the two aliases - played bars `--audio-elapsed`, unplayed bars `--audio-track` - with bar gap `--space-1`, bar radius `--radius-sm`, and groove ends `--radius-full`. The now-playing row highlight reuses `--tint-accent`. Whether bars are drawn at all is a payload question owned by [ui-shell.md](ui-shell.md); when they are not, the track is a plain groove in the same two colours.

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

## See also

- [ui-shell.md](ui-shell.md) - the surfaces and components that use these tokens.
- [vision.md](vision.md) - what the surfaces are for.
- [pipeline-loop.md](pipeline-loop.md) - where the payload these surfaces render comes from.
- [../reference/measurements.md](../reference/measurements.md) - the measured figures a surface cites.
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md) - how a surface ships to the published site.
- [../../CLAUDE.md](../../CLAUDE.md) - the engineering contract, section 9 (Definition of Done).
