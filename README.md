<div align="center">

# Vagina Anatomy

**An interactive 3D model of the vulva, clitoris and pelvic organs.**

[**Open the model →**](https://vagina.wooten-labs.com) &nbsp;·&nbsp; made by [Wooten Labs](https://wooten-labs.com)

[![Live](https://img.shields.io/badge/live-vagina.wooten--labs.com-111416)](https://vagina.wooten-labs.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-ffd400)](LICENSE)
[![three.js](https://img.shields.io/badge/three.js-0.160-555d63)](https://threejs.org)

<a href="https://vagina.wooten-labs.com"><img src="docs/demo.gif" alt="Turning the model, switching to the clitoris and side-cut views, raising arousal, and stepping through the parts" width="680"></a>

</div>

## What you can do

| | |
|---|---|
| **See it in a body** | Opens on a see-through body with the pelvis inside, so you know where everything sits. Fade the body in or out. |
| **Switch views** | Body, Outside (the vulva), Clitoris (the whole organ, mostly internal), Side cut (a midline section) and All organs. |
| **Explore 33 parts** | Click any numbered callout, or step through them with ‹ › or the arrow keys. Each part has a description, a common misconception, published measurements and its male equivalent. |
| **Slice across** | Cut across the vagina at any depth to see its H-shaped, front-to-back flattened cross-section. |
| **Arousal** | Drag the slider to watch the clitoris and bulbs swell, the inner vagina lengthen and balloon, and the uterus lift, following Masters & Johnson. |
| **Guided tour** | An automatic walk through every part, outside in, with Back, Pause and Next. |

It works on phones too: the tools move to a bottom bar, details open in a sheet, and you turn the model with one finger and pinch to zoom.

<div align="center">
<img src="docs/phone.png" alt="The model on an iPhone: the body view, the clitoris view, and a selected part with its details sheet" width="760">
</div>

## How accurate is it?

Sizes and angles are checked by automated tests against published ranges (the `anatomy` tests in [`tests/manual.spec.mjs`](tests/manual.spec.mjs)). Main sources:

- **Longhurst et al., *Clinical Anatomy* 2023:** clitoris meta-analysis of 21 studies.
- **Lloyd et al., *BJOG* 2005:** vulval and vaginal ranges.
- **MRI studies** of vaginal and uterine angles.
- **NIH Human Reference Atlas** (Visible Human Female): the bony pelvis is used directly. The ovaries, fallopian tubes, rectum and uterine ligaments were positioned and checked against it, and tests confirm no organ passes through bone.

It's an educational model, simplified for clarity. Bodies vary widely, and it isn't medical advice. Spotted something wrong? Please [open an issue](https://github.com/jonclegg/vagina-anatomy/issues).

## How it's built

The whole app is one static page, [`site/index.html`](site/index.html), using [three.js](https://threejs.org) with no build step.

- **Built in code:** most of the anatomy (vulva, clitoris, vagina, uterus, bladder and so on) is generated from measured dimensions, so arousal can reshape it live.
- **Embedded meshes:** the pelvis comes from the NIH Human Reference Atlas, and the body outline is a slim young adult woman built from [MakeHuman](https://github.com/makehumancommunity/makehuman). Both are simplified, compressed and embedded in the page.
- **Rendering:** ink outlines like a technical drawing, an X-ray mode that fades parts to their silhouettes, and isolation that keeps a chosen part solid with everything else as context.

## Run it locally

```bash
npm install
npx playwright install webkit chromium
npm run serve        # http://127.0.0.1:4173
npm test             # Playwright: desktop Safari, desktop Chrome and iPhone
```

### Scripts

| Script | What it does |
|---|---|
| `scripts/build-pelvis.mjs <HRA_bony_pelvis_female_VHF.glb>` | Rebuilds the embedded pelvis from the [Human Reference Atlas](https://humanatlas.io) female bony pelvis, aligned to the model in [`hra-frame.mjs`](scripts/hra-frame.mjs). |
| `scripts/build-body.mjs <folder>` | Rebuilds the body outline from the MakeHuman base mesh and morph targets (the folder needs `base.obj` and the targets listed in the script). |
| `scripts/export-standalone.mjs <out.html>` | Writes the page as deployed on [wooten-labs.com](https://wooten-labs.com). |
| `scripts/ui-review.mjs <round>` | Screenshots the page and asks several AI models to score the design against benchmark sites (needs `OPENROUTER_API_KEY`). Each round's scores and comments are in [`design-review/`](design-review/). |

## Licence

Code and text are [MIT](LICENSE). Embedded data keeps its own licence: the pelvis is from the NIH Human Reference Atlas (CC BY 4.0), and the body outline is from MakeHuman (CC0).

<div align="center"><sub>A <a href="https://wooten-labs.com">Wooten Labs</a> project.</sub></div>
