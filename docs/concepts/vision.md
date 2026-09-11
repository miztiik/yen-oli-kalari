# Vision

**Last Updated**: 2026-09-11

What yen-oli-kalari is for, what it refuses to be, and the one product idea the other concept docs serve. This is the top of the concept tier; if a later doc contradicts this page, this page is wrong and gets fixed.

## The idea in one sentence

yen-oli-kalari turns the daily digest published by yen-idhazh into **audio**: a build-time job reads the day's items, synthesises a speech clip for each one on the runner, commits the clips, and a static GitHub Pages site publishes them so a listener can play the day.

It adds one thing to the digest - a voice. It does not fetch articles, write summaries, or score them; yen-idhazh already did that.

## Who it is for

Two audiences, one per surface, and they are held to different standards on purpose ([ui-shell.md](ui-shell.md)):

- **A general listener** opens **Listen** with one question: "what can I put in my ears right now, and how long is it?" No account, no assumed background. The listener came for the day's news as speech, and wants the length of each clip before the tap.
- **The operator** opens **Console** to see the pipeline is alive and not about to hit a wall.

## The shape

yen-idhazh publishes the digest; yen-oli-kalari voices it. A GitHub Actions job reads the day's items, synthesises a clip per item, commits the clips, and a static site publishes them. Nothing computes when a listener opens the page: a clip is a committed file fetched over the network, so there is no server to run and nothing that can be down. The whole loop is in [pipeline-loop.md](pipeline-loop.md).

## What it refuses to be

- **Not a service.** Nothing runs on a server we own - no runtime synthesis, no accounts, no personalisation, no notifications, no telemetry. Every clip is made in CI and committed (Guardrail #1, [../../CLAUDE.md](../../CLAUDE.md)).
- **Not a republisher.** It plays our own summary and links to the source. The article body is never committed and never served, and the audio payload carries no second copy of the text either ([pipeline-loop.md](pipeline-loop.md)).
- **Not a paste-your-text speech toy.** "Read aloud" means playing the clip the runner already made, not synthesising text a listener types. No speech model ships to the browser; why, and the rejected alternative, are in [pipeline-loop.md](pipeline-loop.md).
- **Not a music or high-fidelity audio product.** It is speech at a news-read pace, priced against the runner and the 1 GB Pages cap, not sound quality for its own sake.
- **Not an archive of every clip forever.** Every item is listed forever, but its audio is not kept forever. The audio ages out under a prune while the item and its source link stay ([pipeline-loop.md](pipeline-loop.md)).

The full non-goal list is [../../CLAUDE.md](../../CLAUDE.md) section 0a.

## Why it is static-first

What reaches a listener is a committed bundle on GitHub Pages: the page, the payload, and the audio clips. This is not a deployment choice, it is the product boundary. It removes an entire category of design - runtime synthesis, a streaming server, accounts, telemetry - and it is why the project can run for years at no cost. The consequence that shapes everything else: the work happens on the runner, once, at build time, and the listener only ever receives finished bytes ([pipeline-loop.md](pipeline-loop.md)).

Two ceilings are the platform, not a preference (Guardrail #2): a 6 h job and a **1 GB published site**. A measured day - a median 370 items, about 222 minutes of speech, 40 MB at opus@24k - fills the 1 GB cap in 26 days, so the archive cannot keep every clip ([benchmark](../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md)). How the loop holds the cap is [pipeline-loop.md](pipeline-loop.md).

## See also

- [pipeline-loop.md](pipeline-loop.md) - the daily loop that reads the digest, voices it, publishes, and prunes.
- [ui-shell.md](ui-shell.md) - the two surfaces a listener and an operator meet.
- [design-system.md](design-system.md) - the visual language those surfaces speak.
- [../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md](../reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - what one day costs to voice, measured.
- [../how-to/ship-to-github-pages.md](../how-to/ship-to-github-pages.md) - how the static bundle reaches a reader.
- [../../CLAUDE.md](../../CLAUDE.md) - the engineering contract, including the full non-goals.
