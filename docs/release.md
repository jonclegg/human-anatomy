# Release log

Newest first. Each entry: date, PR, what changed for people using the site, and what an operator must do and what it costs.

## 2026-11-14 · A GitHub button in the bar, in place of the line under it ([#2](https://github.com/jonclegg/human-anatomy/pull/2))

- **For users:** the line of small print under the title is gone, so the model gets that height. The bar has a GitHub button, and a gold star beside it opens a note saying the models are a first draft, built with AI, and not perfect. On a phone both sit at the end of the title's line.
- **For operators:** deploy `site/body/` as usual; no data or cost change. `node scripts/body/readme-shots.mjs` retakes the README's pictures and walkthrough from the served site.

## 2026-11-14 · Tidy for publishing ([#1](https://github.com/jonclegg/human-anatomy/pull/1))

- **For users:** nothing changes on the site. The README now says what each folder holds and credits the narration and music.
- **For operators:** nothing to do, no cost. A stray temporary script was removed, `.claude/` is ignored, and the pelvis page's `scripts/build-body.mjs` is now `scripts/build-body-outline.mjs`, so it is not mistaken for the whole-body build.
