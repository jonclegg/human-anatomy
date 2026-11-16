# Release log

Newest first. Each entry: date, PR, what changed for people using the site, and what an operator must do and what it costs.

## 2026-11-16 · The page fits an iPhone's width

- **For users on iPhones:** the page can no longer be laid out wider than the screen, which made the bar run off the right edge and the page scroll sideways (seen on a real iPhone, not in the simulators). The search box's prompt is no longer cut short by Safari's own inset.
- **On phones:** tapping a part's label on the model opens it again. A finger that landed on a label never reached the model, so the tap did nothing (most visible after closing the panel), and the model then behaved as if a finger were still down. On the layers at home, a label no longer covers a region's glowing point.
- **Back button:** the browser's or phone's Back now goes up one level (from a part to its region, from a region, a guide or Contents to where you were, then home) instead of leaving the site. Back leaves only from the whole body.
- **For operators:** deploy `site/body/index.html` and `site/body/app.mjs`; no cost change. New `tests/body/workflows.spec.mjs` walks the main paths on phone and desktop. `index.html` and `app.mjs` are now served with `Cache-Control: no-cache`, so a phone checks for a new version on every load.

## 2026-11-15 · A calmer phone layout

- **For users on phones:** the panel along the bottom is gone from the opening screen, so the body has the whole screen. It comes up when you open a region or a part, has an X that puts it away, and stays at whatever height you drag it to; dragging it right down closes it. Tapping the search box no longer zooms the page in on an iPhone (which left the panel off-centre and its text cut off), and the box shows its prompt only when the whole word fits. The gesture hint over the model sits centred inside the screen's margins.
- **For everyone with sound on:** the music is quieter under the voice, and on an iPhone it now actually drops: Safari ignored the old volume setting, so the music played as loud as the narration.
- **On Android:** the same phone layout, and a swipe down on the panel or the bar no longer reloads the page (Chrome's pull-to-refresh).
- **For operators:** deploy `site/body/` as usual; no data or cost change. The test config has an `android` project (Pixel 7, Chrome) that runs the phone-layout tests.

## 2026-11-14 · Link previews

- **For users:** a link to the site shared in Slack, iMessage, X or LinkedIn now shows a title, a line about it and a picture of the heart close-up, instead of a bare address.
- **For operators:** deploy `site/body/index.html` and the new `site/body/img/share.png` (as `image/png`); no cost change. `node scripts/body/readme-shots.mjs stills` retakes the picture.

## 2026-11-14 · A GitHub button in the bar, in place of the line under it ([#2](https://github.com/jonclegg/human-anatomy/pull/2))

- **For users:** the line of small print under the title is gone, so the model gets that height. The bar has a GitHub button, and a gold star beside it opens a note saying the models are a first draft, built with AI, and not perfect. On a phone both sit at the end of the title's line.
- **For operators:** deploy `site/body/` as usual; no data or cost change. `node scripts/body/readme-shots.mjs` retakes the README's pictures and walkthrough from the served site.

## 2026-11-14 · Tidy for publishing ([#1](https://github.com/jonclegg/human-anatomy/pull/1))

- **For users:** nothing changes on the site. The README now says what each folder holds and credits the narration and music.
- **For operators:** nothing to do, no cost. A stray temporary script was removed, `.claude/` is ignored, and the pelvis page's `scripts/build-body.mjs` is now `scripts/build-body-outline.mjs`, so it is not mistaken for the whole-body build.
