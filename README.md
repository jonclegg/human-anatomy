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

## Human Anatomy: the whole body

[`site/body/`](site/body/) is a second, larger model: the whole human body, male and female, at the same standard. It has the skeleton, the muscles, the organs, the vessels, the nervous system and the skin, about 3,000 named structures in each body. The model above stays as the detailed close-up of the female pelvis.

| | |
|---|---|
| **Male and female** | Switch bodies at the top right. A selected part carries over, or jumps to its equivalent (testes and ovaries). |
| **Views per system** | Body, Skeleton, Muscles, Organs, Vessels and Nerves, each with the rest as faint context. |
| **Every structure** | Every structure can be picked on the model, found by name in the parts list, and isolated. 188 main parts have a description, a common misconception, published measurements and the other sex's equivalent. Step through them with ‹ › or the arrow keys. |
| **Clothed by default** | Both bodies open with the skin solid and plain underwear on (a crop top and shorts, boxer briefs), as a safe-for-work first view. The Clothing switch takes it off; in the system views it fades with the skin but still covers. |
| **X-ray and skin** | Fade a view's outer layer to outlines, and fade the skin. |
| **Loads fast** | Each system is its own compressed GLB (meshopt), fetched only when a view needs it. The opening view loads 2–3 MB. |

### Where the shapes come from

- **Male:** one adult man from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) (2,234 structures, built from CT and MRI). BodyParts3D has no lungs and no spinal cord, so those come from the NIH Visible Human Male, carried into the BodyParts3D body by the fit described below.
- **Added from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy):** about 750 structures BodyParts3D lacks: the muscles of the face, jaw, back and abdominal wall (latissimus dorsi, rectus abdominis, masseter, temporalis and others), ligaments and joint capsules, the peripheral and cranial nerves, lymph nodes, the thyroid gland, and many vessels. Z-Anatomy is built on BodyParts3D but remodelled, so it is aligned to the BodyParts3D bones by the same fit, and a Z-Anatomy structure is kept only where BodyParts3D has nothing of the same name or in the same place ([`scripts/body/zanatomy.mjs`](scripts/body/zanatomy.mjs)). Its non-commercial parts (the inner ear, a kidney) and its brain models with no stated licence are never exported.
- **Female, scanned:** her organs, brain, spinal cord, the vessels of her trunk and head, her bony pelvis, thigh and leg bones, kneecaps, breastbone and intervertebral discs come from the NIH Visible Human Female ([Human Reference Atlas](https://humanatlas.io/3d-reference-library)).
- **Female, fitted:** no free model of a female skeleton or muscles exists. Her other bones (skull, spine, ribs, arms, hands, feet), all her muscles, and the few organs the NIH set lacks (oesophagus, stomach, gallbladder and bile ducts, adrenal glands, pituitary, tear glands, eyelid plates and outer ears) are the BodyParts3D male ones, **fitted** to her. In the app, each fitted part says *Fitted* in its details.

- **Female, slimmed:** the Visible Human Female was a heavier woman in her late fifties. Her skin is replaced by a slim young woman's from [MakeHuman](https://github.com/makehumancommunity/makehuman) (its base mesh with the young-female and low-weight shape targets, CC0, as the Vagina Anatomy body uses), and everything inside is drawn in to fit it ([`scripts/body/slim.mjs`](scripts/body/slim.mjs)). Her scanned organs keep their shapes but not their exact places.

How the fit works ([`scripts/body/register.mjs`](scripts/body/register.mjs)): matching structures (hip bones, femurs, tibias, kneecaps, sternum, heart, liver, kidneys, spleen, bladder, rectum, brain, eyes, trachea, larynx) are aligned one by one with affine ICP. The spine is matched disc by disc along its length, and each hand and foot is turned as a whole to match hers (she was scanned lying down with her feet pointed). A thin-plate spline through all of those points carries the rest of his body across. Near a matched structure, soft tissue moves with that structure's own fit, as skin follows a bone, so muscles are not stretched out into her thicker body fat. Finally, any fitted bone or muscle that would pass into one of her scanned organs is pushed clear of it ([`scripts/body/clearance.mjs`](scripts/body/clearance.mjs)).

How the slimming works ([`scripts/body/slim.mjs`](scripts/body/slim.mjs), [`scripts/body/makehuman.mjs`](scripts/body/makehuman.mjs)):

1. Her arms, pressed to her sides in the scan, are turned out at the shoulder to MakeHuman's A-pose, with what belongs to each arm; muscles that run from the ribcage to the arm turn by degrees between the two.
2. Her trunk is brought forward, height by height, so her spine follows a standing back (she was scanned lying down, which pressed her upper spine flat).
3. MakeHuman is posed to her skeleton with its own skin weights: the trunk is scaled to her shoulders and hips and bent to follow her spine, each limb segment is turned and stretched onto her bones, and the head, hands and feet are fitted as wholes.
4. One smooth thin-plate spline takes her old skin to the new one (arm to arm, trunk to trunk), her nipples and eyes to MakeHuman's, and her hand and foot joints to its joints. Everything inside her follows it, bones included, so nothing tears. Each hand and foot then gets its own exact fit, bone end onto joint.
5. A second smooth spline draws the outer layer in where it still reaches past the new skin (at most 2 cm, holding everything deeper than 3 cm and the hands still); the skin is raised a little over anything still showing through (not on the feet or the middle of the face, and only just on the hands). A stray piece more than 4 cm outside the body is dropped and named in the build log.

### What is missing

The inner ear (the only free model is non-commercial), and the smallest vessels and nerves. The female skeleton and muscles are fitted, not scanned, and the female body has no hair (MakeHuman's hair is not in its public repository).

### Checks

`npm run test:body` runs Playwright on desktop Safari, desktop Chrome and an iPhone. It covers loading, every view, both bodies, picking, isolation, stepping, X-ray, the phone layout, and anatomy. The anatomy tests measure each body's bones and organs (height, femur, humerus, tibia, kidney, heart, spleen, trachea, spinal cord, pelvic width, uterus) against published adult ranges, check that no major organ passes through bone and that bone and muscle stay inside the skin, and that the female waist is a slim one. The clothing tests check both bodies open clothed and solid.

### Rebuilding the data

```bash
node scripts/body/build-male.mjs "<Human Anatomy 3D Models folder>"
```

```bash
node scripts/body/build-female.mjs "<Human Anatomy 3D Models folder>" "<female-reproductive-3d-models folder>"
node scripts/body/slim-female.mjs "<MakeHuman folder>"
```

The first writes her fitted (unslimmed) body to `build/female-fitted/`; the second reshapes it onto MakeHuman's slim young woman and writes `site/body/data/female/`, so the reshaping can be rerun on its own (a few minutes). `node scripts/body/review.mjs <female|male>` then writes contact sheets of every view to `build/review/<sex>/` (with the site served).

The MakeHuman folder holds, from [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data): `3dobjs/base.obj`, `rigs/default.mhskel`, `rigs/default_weights.mhw`, and from `targets/macrodetails/` the four targets named in [`scripts/body/slim.mjs`](scripts/body/slim.mjs), all in one folder.

Then the clothing, shaped from each body's skin:

```bash
node scripts/body/clothing.mjs male && node scripts/body/clothing.mjs female
```

First export Z-Anatomy with Blender (the scripts in [`scripts/body/blender/`](scripts/body/blender/) write to the folder the builds read):

```bash
blender -b --disable-autoexec "<Z-Anatomy folder>/Startup.blend" --python scripts/body/blender/export-zanatomy.py -- "<Human Anatomy 3D Models folder>/Whole Body - Z-Anatomy (Blender)/export/zanatomy.glb"
```

```bash
blender -b --disable-autoexec "<Z-Anatomy folder>/Startup.blend" --python scripts/body/blender/export-zanatomy-bones.py -- "<Human Anatomy 3D Models folder>/Whole Body - Z-Anatomy (Blender)/export/zanatomy-bones.glb"
```

The male build takes a few minutes; the female build about 20 minutes, most of it the fit and the slimming. They write `site/body/data/<sex>/` (one GLB per layer, `parts.json`, and `clothing.glb`). The text for each main part is in [`site/body/parts.mjs`](site/body/parts.mjs). Serve the site with `npm run serve:body` (http://127.0.0.1:4174).

## Licence

Code and text are [MIT](LICENSE). Embedded data keeps its own licence: the pelvis is from the NIH Human Reference Atlas (CC BY 4.0), and the body outline is from MakeHuman (CC0).

The whole-body data in `site/body/data/` is derived from:

- **BodyParts3D**, © The Database Center for Life Science, licensed under CC Attribution 4.0 International ([licence page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)). The OBJ files' headers still carry an older CC BY-SA 2.1 Japan notice; the licence page, updated 27 February 2025, gives CC BY 4.0. Simplified, re-coloured and, for the female body, warped.
- **Human Reference Atlas 3D reference organs** (HuBMAP, NIH; Visible Human Project, U.S. National Library of Medicine; brain from the Allen Institute), CC BY 4.0. Simplified, renamed and aligned.
- **MakeHuman** base mesh, skeleton, skin weights and shape targets (the female skin), CC0.
- **Z-Anatomy**, the libre 3D atlas of anatomy, CC BY-SA 4.0 (built on BodyParts3D); cranial nerves after Cranial Nerves and Foramina, University of Dundee CAHID, CC BY 4.0. Aligned, simplified and, for the female body, warped.

Because it includes Z-Anatomy, the whole-body 3D data (`site/body/data/`) is shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The code and the text in `site/body/parts.mjs` stay MIT.

<div align="center"><sub>A <a href="https://wooten-labs.com">Wooten Labs</a> project.</sub></div>
