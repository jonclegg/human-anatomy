# How Human Anatomy is made

The technical side of [Human Anatomy](../README.md): where each shape comes from, how the female body is built from the male one, how it is checked, and how to rebuild the data.

## How accurate is it?

This is a first draft of an open-source anatomy model, built largely with AI models. It will have mistakes: shapes, positions, names and the written notes can all be wrong. It is not medical advice, and it should not be used to study for an exam or to make a decision about a body.

What is checked:

- **Shapes** come from published 3D data (BodyParts3D, Z-Anatomy, the NIH Visible Human scans, MakeHuman), listed under [Where the shapes come from](#where-the-shapes-come-from). The female body is mostly the male body reshaped, and each such part says *Fitted* in the app. Parts built in code say *Modelled*.
- **Sizes**: the tests measure each body's height, femur, humerus, tibia, kidney, heart, spleen, trachea, spinal cord, pelvic width and uterus against published adult ranges.
- **Collisions**: the tests check that no major organ passes through bone, and that bone and muscle stay inside the skin.
- **An audit script** lists structures with no twin on the other side, twins that differ, muscles that touch no bone, and structures drawn twice.

Passing the tests means numbers fall in published ranges, not that the anatomy is right. Nobody with medical training has reviewed the model or its text.

## Where the shapes come from

- **Male:** one adult man from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) (2,234 structures, built from CT and MRI). BodyParts3D has no lungs and no spinal cord, so those come from the NIH Visible Human Male, carried into the BodyParts3D body by the fit described below.
- **Added from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy):** about 750 structures BodyParts3D lacks: the muscles of the face, jaw, back and abdominal wall (latissimus dorsi, rectus abdominis, masseter, temporalis and others), the tendon sheets of the scalp and palm, the middle and lower pharynx, the parathyroid glands, ligaments and joint capsules, the peripheral and cranial nerves, lymph nodes, the thyroid gland, and many vessels. Z-Anatomy is built on BodyParts3D but remodelled, so it is aligned to the BodyParts3D bones: every bone the two have in common (about 180, down to the bones of the face, fingers and toes) pins the fit, so the face muscles follow the facial bones and the toe ligaments the toes. A Z-Anatomy structure is kept only where BodyParts3D has nothing of the same name or in the same place, a structure kept on one side only gets its twin by mirroring (Z-Anatomy's left side is its right side mirrored; not the organs of the chest and belly, which are one-sided by nature), its orbicularis oris, modelled as a ring around an open mouth, has its lips closed, and whatever still lies a little outside his skin is brought under it with the layers beneath ([`scripts/body/zanatomy.mjs`](../scripts/body/zanatomy.mjs), [`scripts/body/build-male.mjs`](../scripts/body/build-male.mjs)). Its non-commercial parts (the inner ear, a kidney) and its brain models with no stated licence are never exported.
- **Female, fitted:** no free model of a whole female body exists; scans of women give organs, but no skeleton or muscles that belong with them. So her body is the male body, reshaped as a whole onto a slim young woman's skin (below). In the app, each part that came this way says *Fitted* in its details.
- **Female, modelled:** her skin is [MakeHuman](https://github.com/makehumancommunity/makehuman)'s base mesh with its young Caucasian female and low-weight shape targets (CC0).
- **Male, his lips:** BodyParts3D's skin is blank at the mouth, and its lips are a rough scrap of the scan laid over it. His skin is shaped there to MakeHuman's lips ([`scripts/body/lips.mjs`](../scripts/body/lips.mjs)); the rest of his skin is the scan's, untouched. Her teeth are his, each kept whole: turned, sized and placed with her jaw, never bent.
- **Female, modelled in code:** her vulva (mons, outer and inner lips, hood, vestibule and its openings), her clitoris (glans, body, crura and bulbs), her urethra, the glands beside it and the muscles over the bulbs and crura are built in code from published measurements ([`site/index.html`](../site/index.html) generates them). That model is built around the Visible Human Female's pelvis, the same scan whose organs are fitted into her, so the map that carries the scan's pelvis onto hers carries these too ([`scripts/body/pelvic-detail.mjs`](../scripts/body/pelvic-detail.mjs)). Placed by the bones alone, they land within about half a centimetre of her skin.
- **Female, scanned:** what is hers alone: her uterus, vagina, ovaries, tubes and their ligaments, and her breasts, from the NIH Visible Human Female ([Human Reference Atlas](https://humanatlas.io/3d-reference-library)), fitted into her pelvis and under her skin. The man's own reproductive organs are left out.

How the male's lungs and spinal cord are carried in ([`scripts/body/register.mjs`](../scripts/body/register.mjs)): matching structures of the Visible Human Male and the BodyParts3D man (hip bones, femurs, tibias, kneecaps, heart, liver, kidneys, trachea, larynx) are aligned one by one with affine ICP, and the spine disc by disc. A thin-plate spline through all of those points carries the rest across; near a matched structure, soft tissue moves with that structure's own fit.

How the female body is made ([`scripts/body/transfer.mjs`](../scripts/body/transfer.mjs), [`scripts/body/makehuman.mjs`](../scripts/body/makehuman.mjs)). The male body is one man, so his skin, bones, muscles and organs fit each other. The method keeps that fit by never moving one part against another:

1. MakeHuman, in a male shape, is posed to his skeleton with its own skin weights, then drawn onto his skin: each vertex moves to the nearest skin point that faces the same way, as a sheet that resists stretching, so it keeps its layout. Every MakeHuman vertex now marks a known spot on him.
2. The same mesh in its female shape is put through the same pose, each limb hinged at its own joints. Her skin is his skin plus the difference between the two posed shapes, so flaws of the pose, which both share, cancel. Her head, hands and feet are MakeHuman's own, and her lips are closed.
3. One smooth thin-plate spline takes each marked spot on his skin to the same vertex of hers (the breasts are left out, so the chest wall does not swell into them), his eyes to her eyes, and his hand and foot joints to hers. Everything inside him follows it. The pose does not change, so nothing has to turn or tear.
4. Each hand and foot then gets its own exact fit, bone end onto joint. The joints of a hand lie nearly in one plane, so each is also paired a little above and below that plane, which keeps the bones their thickness. Her finger and toe skin rises over the bones where MakeHuman's slender digits would not hold them. Each eyeball is set in her eyelids, and the muscles and nerve fixed to it go with it.
5. Whatever still lies outside the skin or just under it is brought under: the layers there are pressed inward together, so a sheet of muscle stays over its bone. The man's own data has some of this (a vein, a band of fascia and some toe ligaments from Z-Anatomy run over his skin).
6. The body is scaled to 163 cm. Her scanned pelvic organs are fitted by matching the scan's hip bones, sacrum, bladder and rectum to hers; each scanned breast is fitted into the breast of her skin, nipple under nipple and back on the chest wall.
7. The parts modelled in code are placed by the same map as the scanned pelvis. The scanned vagina, fitted between a bladder and rectum that are the man's, came out about 4 cm in front of the opening her bones give her: its middle line is moved onto the model's, and the cervix and uterus with it. The scanned vagina itself is then not drawn: the scan took in the tissue round it and gives a slab 6 cm wide, so the model's vagina, a flattened tube, is drawn in its place. The model's skin sheet (mons and outer lips, open at the vestibule) replaces her smooth MakeHuman skin there: on each spoke of the sheet it ends where it comes nearest her skin, its last stretch is drawn onto her skin and shaded as her skin, and her own skin inside that rim, divided finer first, is cut away.

## Checking the anatomy

BodyParts3D itself has a few structures twice under two names (the celiac trunk as "Celiac artery", the pancreas as its "Parenchyma", the anal sphincter as a perineal muscle): the copies are left out ([`scripts/body/build-male.mjs`](../scripts/body/build-male.mjs)).

`node scripts/body/audit.mjs <female|male> [layer]` audits a built body: structures with no twin on the other side, left and right twins that differ in size or place, muscles that float clear of every bone, and structures drawn twice in the same place. The platysma, a paper-thin sheet in the skin of the neck, is drawn only when chosen, so the sternocleidomastoid and the throat muscles under it show, as atlases draw the neck.

## Close-ups

The close-ups are in [`site/body/closeups/`](../site/body/closeups/) (the format is described in [`site/body/closeups.mjs`](../site/body/closeups.mjs)): each lists its parts in order, and each part has the same notes as a main part. Inside a close-up a structure belongs to the close-up's own, finer entries first. `node scripts/body/check-closeups.mjs` checks every part against both built bodies, and `node scripts/body/closeups-review.mjs` screenshots each close-up as a visitor sees it (with the site served).

## What is missing

In the male pelvis: the scrotum as a part of its own, the muscles over the bulb and crura of the penis, the bulbourethral glands and the spermatic cord (none of the free models has them). The inner ear (the only free model is non-commercial), the pericardium and the other membranes that line the body's cavities, and the smallest vessels and nerves. The caecum and the sigmoid colon are not parts of their own (the ascending and descending colon run on through them). The middle cardiac vein and the artery beside it share one shape in the source, and so do the superficial and superior epigastric veins. No one has checked each muscle's attachments against a reference: the audit checks that muscles are present, paired, on bone and not doubled. The female body is the male one reshaped, apart from her scanned reproductive organs and breasts, and it has no hair (MakeHuman's hair is not in its public repository).

## Checks

`npm run test:body` runs Playwright on desktop Safari, desktop Chrome and an iPhone. It covers loading, every view, both bodies, picking, isolation, stepping, X-ray, the layout on desktop and phone, navigation (the title, Escape, Contents), stories, sound, every region's motion, and anatomy. The anatomy tests measure each body's bones and organs (height, femur, humerus, tibia, kidney, heart, spleen, trachea, spinal cord, pelvic width, uterus) against published adult ranges, check that no major organ passes through bone and that bone and muscle stay inside the skin, and that the female waist is a slim one. The clothing tests check both bodies open clothed and solid.

## Run it locally

```bash
npm install
npx playwright install webkit chromium
npm run serve:body   # http://127.0.0.1:4174
npm run test:body    # Playwright: desktop Safari, desktop Chrome and iPhone
```

## Rebuilding the data

```bash
node scripts/body/build-male.mjs "<Human Anatomy 3D Models folder>"
```

```bash
node scripts/body/build-female.mjs "<Human Anatomy 3D Models folder>" "<female-reproductive-3d-models folder>"
```

The female build reads the built male body (`site/body/data/male/`), so the male comes first, and the shapes modelled in code, which `node scripts/body/export-pelvic-detail.mjs` writes to `build/pelvic-detail.json` (it opens `site/index.html` in a headless browser, where those shapes are generated). It takes about a minute and writes `site/body/data/female/`. `node scripts/body/review.mjs <female|male>` then writes contact sheets of every view to `build/review/<sex>/`, and `node scripts/body/shots.mjs` close-ups from any angle (both with the site served).

The MakeHuman files are read from `MakeHuman (CC0)` inside the models folder. They come from [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data): `3dobjs/base.obj`, `rigs/default.mhskel`, `rigs/default_weights.mhw`, and from `targets/macrodetails/` the targets named in [`scripts/body/build-female.mjs`](../scripts/body/build-female.mjs), all in one folder.

Both are dressed in MakeHuman's clothing (CC0), read from `MakeHuman clothes (CC0)/clothes` inside the models folder (the `makehuman_system_assets_cc0` pack from [files.makehumancommunity.org](https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/)). A MakeHuman garment is tied vertex by vertex to the MakeHuman body mesh, so it follows the body's shape ([`scripts/body/garments.mjs`](../scripts/body/garments.mjs)). She wears the top of its `female_sportsuit01` and the shorts of its `female_casualsuit02`, put on by her own build, since her skin is that mesh. His skin is not, so the mesh is first laid onto it; MakeHuman has no men's shorts, so he wears the jeans of its `male_casualsuit04` cut off at mid-thigh, with the front let out over him (MakeHuman's mesh has no genitals):

```bash
node scripts/body/clothing.mjs male "<Human Anatomy 3D Models folder>"
```

First export Z-Anatomy with Blender (the scripts in [`scripts/body/blender/`](../scripts/body/blender/) write to the folder the builds read):

```bash
blender -b --disable-autoexec "<Z-Anatomy folder>/Startup.blend" --python scripts/body/blender/export-zanatomy.py -- "<Human Anatomy 3D Models folder>/Whole Body - Z-Anatomy (Blender)/export/zanatomy.glb"
```

```bash
blender -b --disable-autoexec "<Z-Anatomy folder>/Startup.blend" --python scripts/body/blender/export-zanatomy-bones.py -- "<Human Anatomy 3D Models folder>/Whole Body - Z-Anatomy (Blender)/export/zanatomy-bones.glb"
```

The male build takes a few minutes. The builds write `site/body/data/<sex>/` (one GLB per layer, `parts.json`, and `clothing.glb`). The text for each main part is in [`site/body/parts.mjs`](../site/body/parts.mjs). Serve the site with `npm run serve:body` (http://127.0.0.1:4174).

The licences are in the [README](../README.md#licence).
