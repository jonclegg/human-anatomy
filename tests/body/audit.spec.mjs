// An audit of every feature, through the page as a visitor uses it: every story step by step, every row of Contents,
// every control in the bar, the sheet and the strip, the search, the keyboard, and the phone layout.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { ENTRIES, TOUR } from '../../site/body/parts.mjs';
import { REGIONS } from '../../site/body/closeups.mjs';
import { STORIES } from '../../site/body/stories.mjs';
import { MOTIONS } from '../../site/body/motions.mjs';

/* the tests turn the sound on: it plays, but silently, so a test run is never heard on the machine it runs on */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { this.muted = true; return play.call(this); };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (to, ...rest) { return to instanceof AudioDestinationNode ? to : connect.call(this, to, ...rest); };
  });
});
const settle = page => page.waitForFunction(() => !window.bodyModel.busy(), null, { timeout: 30_000 });
const model = (page, script, arg) => page.evaluate(script, arg);
const isPhone = page => page.viewportSize().width <= 820;
const chromiumOnly = testInfo => test.skip(testInfo.project.name !== 'chromium', 'one desktop browser is enough for this sweep');
const desktopOnly = testInfo => test.skip(testInfo.project.name === 'iphone', 'desktop interaction');
function watch(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}
async function open(page, query = 'sex=female') {
  const errors = watch(page);
  await page.goto(`/?${query}`);
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
  await model(page, () => window.bodyModel.ready());
  await settle(page);
  return errors;
}
const sexOf = id => REGIONS[id].sex || 'female';
const place = page => model(page, () => { const { region, view, selection, story, contents } = window.bodyModel.state; return { region, view, entry: selection?.entry ?? null, story: story ? story.kind : null, contents }; });
const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);
const manifest = JSON.parse(readFileSync(new URL('../../site/body/audio/manifest.json', import.meta.url), 'utf8'));

test.describe('what the stories are made of', () => {
  test('every region that moves has a story of at least three steps, each with a title, words and parts of its own region', () => {
    for (const id of Object.keys(MOTIONS)) {
      const steps = STORIES[id];
      expect(steps?.length, `${id} has a story`).toBeGreaterThanOrEqual(3);
      const own = new Set(REGIONS[id].parts), titles = new Set();
      for (const [k, step] of steps.entries()) {
        const at = `${id} step ${k + 1}`;
        expect(step.title?.length, `${at} has a title`).toBeGreaterThan(3);
        expect(titles.has(step.title), `${at}: a title of its own`).toBe(false); titles.add(step.title);
        expect(step.say, `${at} has words`).toMatch(/^[A-Z].*[.]$/);
        expect(step.say.length, `${at}: short enough to be said in a breath or two`).toBeLessThan(320);
        for (const part of [step.entry, ...(step.frame || []), ...(step.labels || [])]) expect(own.has(part), `${at}: ${part} is a part of the region`).toBe(true);
        if (step.span) { expect(step.span[0], at).toBeGreaterThanOrEqual(0); expect(step.span[1], at).toBeLessThanOrEqual(1.2); expect(step.span[1], at).toBeGreaterThan(step.span[0]); expect(step.seconds, `${at} says how long its stretch takes`).toBeGreaterThan(1); }
      }
    }
  });
  test('every line the voice says has a clip: recorded, on disk, and with its length', () => {
    const keys = [...Object.entries(STORIES).flatMap(([id, steps]) => steps.map((_, k) => `story:${id}:${k}`)), ...TOUR.map(([entry]) => `entry:${entry}`)];
    for (const key of keys) {
      const clip = manifest.narration[key];
      expect(clip, `${key} has a clip`).toBeTruthy();
      expect(clip.seconds, `${key} says how long it runs`).toBeGreaterThan(1);
      expect(existsSync(new URL(`../../site/body/audio/${clip.file}`, import.meta.url)), `${clip.file} is on disk`).toBe(true);
    }
  });
  test('no region shows part of a hand or a foot: all of it, or none', async ({ page }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(300_000);
    const HAND = /scaphoid|lunate|triquetr|pisiform|trapezi|trapezoid|capitate|hamate|metacarpal bone|phalanx of .*(finger|thumb)/i, FOOT = /talus|calcaneus|navicular bone|cuboid bone|cuneiform bone|metatarsal bone|phalanx of .*toe|sesamoid bone of .*foot/i;
    for (const sex of ['female', 'male']) for (const id of Object.keys(REGIONS).filter(id => !REGIONS[id].sex || REGIONS[id].sex === sex)) {
      await open(page, `sex=${sex}&closeup=${id}`);
      const shown = await model(page, () => { const body = window.bodyModel.body(), bones = at => body.parts[at].layer === 'skeleton'; return { all: body.parts.filter(part => part.layer === 'skeleton').map(part => [part.name, Math.sign(part.centre[0])]), seen: [...body.around.own, ...body.around.context].filter(bones).map(at => [body.parts[at].name, Math.sign(body.parts[at].centre[0])]) }; });
      for (const [what, bones] of [['hand', HAND], ['foot', FOOT]]) for (const side of [-1, 1]) {
        const whole = shown.all.filter(([name, at]) => at === side && bones.test(name)).length, seen = shown.seen.filter(([name, at]) => at === side && bones.test(name)).length;
        expect([0, whole], `${sex} ${id}: ${seen} of the ${whole} bones of a ${what}`).toContain(seen);
      }
    }
  });
  test('no words on the page promise what is not there', () => {
    const page = readFileSync(new URL('../../site/body/index.html', import.meta.url), 'utf8');
    expect(page).not.toMatch(/manual|Guided tour|Close-ups<\/|Callouts/);
  });
});

/* Every story, step by step, through the sheet's list: the step is the one asked for, its words are its own, the
   model moves, and nothing that flows is seen anywhere but in or beside a part that is shown solid. */
test.describe('every story, step by step', () => {
  /* what flows through open air or along vessels the model does not have, and so cannot lie in a solid part: named, with the reason */
  const IN_THE_OPEN = {
    eye: 'light comes in through the air in front of the eye',
    lymphatic: 'the model has lymph nodes but no lymph vessels: the drops run from node to node',
    breast: 'the model has no lymph vessels: the drops run from the breast to the nodes of the armpit',
    heart: 'blood is shown arriving by the great veins and leaving by the great arteries, beyond the cut heart',
    brain: 'the signal starts at the eye, in front of the brain',
  };
  for (const id of Object.keys(STORIES)) {
    test(`${id}: every step is reached, told and shown`, async ({ page }, testInfo) => {
      chromiumOnly(testInfo);
      test.setTimeout(180_000);
      const errors = await open(page, `sex=${sexOf(id)}&closeup=${id}`);
      const steps = STORIES[id];
      await expect(page.locator('#sheet [data-watch]')).toHaveText('Watch guide');
      await page.locator('#sheet [data-watch]').click();
      await expect(page.locator('#sheet [data-go]')).toHaveText(steps.map((step, k) => `${k + 1}${step.title}`));
      await expect(page.locator('#crumbs')).toContainText(sentence(MOTIONS[id].watch));
      let last = null;
      for (const [k, step] of steps.entries()) {
        const at = `${id} step ${k + 1} (${step.title})`;
        await page.locator(`#sheet [data-go="${k}"]`).click();
        await expect(page.locator('#storyCount'), at).toHaveText(`${k + 1} / ${steps.length}`);
        await expect(page.locator('#sheet [aria-current="true"]'), at).toHaveText(`${k + 1}${step.title}`);
        await expect(page.locator('#say'), at).toHaveAttribute('data-words', step.say);
        await settle(page);
        await page.waitForTimeout(900);   // the drops fade in at the start of a step, and the rest of the region stands back
        const seen = await model(page, () => {
          const m = window.bodyModel, parts = m.body().parts, solid = parts.filter(part => part.layer !== 'skin' && m.opacityOf(part.index) >= 0.45);
          const near = (x, y, z, by) => solid.some(part => x > part.min[0] - by && x < part.max[0] + by && y > part.min[1] - by && y < part.max[1] + by && z > part.min[2] - by && z < part.max[2] + by);
          const drops = m.dropsShown();
          return {
            moving: m.motion().moving, caption: document.querySelector('#say').textContent, camera: [...m.camera.position.toArray(), ...m.controls.target.toArray()],
            drops: drops.length, wild: drops.filter(drop => !drop.slice(1).every(Number.isFinite)).length, astray: drops.filter(([, x, y, z]) => !near(x, y, z, 2.5)).length,
            time: document.querySelector('#storyTime').textContent, bar: Number(document.querySelector('#storyBar').getAttribute('aria-valuenow')),
            tags: [...document.querySelectorAll('#labels .tag')].filter(tag => !tag.hidden).map(tag => { const box = tag.getBoundingClientRect(), stage = document.querySelector('#stage').getBoundingClientRect(); return box.left >= stage.left - 1 && box.right <= stage.right + 1 && box.top >= stage.top - 1 && box.bottom <= stage.bottom + 1; }),
            say: (() => { const box = document.querySelector('#say').getBoundingClientRect(), strip = document.querySelector('#transport').getBoundingClientRect(); return box.bottom <= strip.top + 1 && box.height < 140; })(),
          };
        });
        expect(seen.moving, `${at}: the model moves`).toBe(true);
        expect(seen.caption.length, `${at}: a caption shows`).toBeGreaterThan(8);
        expect(step.say, `${at}: the caption is part of the step's own words`).toContain(seen.caption);
        expect(seen.camera.every(Number.isFinite), `${at}: the view is somewhere`).toBe(true);
        if (last && JSON.stringify([step.frame, step.from, step.fill]) !== JSON.stringify([steps[k - 1].frame, steps[k - 1].from, steps[k - 1].fill])) expect(Math.hypot(...seen.camera.map((value, axis) => value - last[axis])), `${at}: the view changes from the step before`).toBeGreaterThan(0.5);
        last = seen.camera;
        expect(seen.wild, `${at}: no drop is nowhere`).toBe(0);
        if (!IN_THE_OPEN[id]) expect(seen.astray / Math.max(1, seen.drops), `${at}: ${seen.astray} of ${seen.drops} drops are away from every solid part`).toBeLessThan(0.04);
        expect(seen.time, at).toMatch(/^\d+:\d\d \/ \d+:\d\d$/);
        expect(seen.bar, `${at}: the bar is where the step is`).toBeGreaterThanOrEqual(0);
        expect(seen.tags.every(Boolean), `${at}: every label is inside the stage`).toBe(true);
        expect(seen.say, `${at}: the caption sits above the strip and is no taller than a few lines`).toBe(true);
      }
      await page.locator('#transport [data-story="exit"]').click();
      await settle(page);
      expect(await place(page)).toMatchObject({ region: id, story: null, entry: null });
      expect(await model(page, () => ({ moving: window.bodyModel.motion().moving, voice: window.bodyModel.sound().key }))).toEqual({ moving: false, voice: null });   // at rest, and nothing more is said
      await expect(page.locator('#sheetTitle')).toHaveText(REGIONS[id].title);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('playing a story', () => {
  test('the bar and the clock run with the story, hold when it is paused, and jump with a step', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page, 'sex=female&closeup=heart');
    await page.locator('#sheet [data-watch]').click();
    const clock = async () => { const [played, total] = (await page.locator('#storyTime').textContent()).split(' / ').map(text => { const [minutes, seconds] = text.split(':').map(Number); return minutes * 60 + seconds; }); return { played, total }; };
    const first = await clock();
    expect(first.total).toBeGreaterThan(60);   // the heart's nine steps take well over a minute
    await page.waitForTimeout(2500);
    const later = await clock();
    expect(later.played).toBeGreaterThan(first.played);
    expect(later.total).toBe(first.total);
    await page.locator('#transport [data-story="play"]').click();
    await expect(page.locator('#transport [data-story="play"]')).toHaveText('Play');
    const held = await clock();
    await page.waitForTimeout(1500);
    expect((await clock()).played).toBe(held.played);
    expect(await model(page, () => window.bodyModel.sound())).toMatchObject({ voicePaused: true, musicPlaying: false });
    await page.locator('#transport [data-story="play"]').click();
    await expect(page.locator('#transport [data-story="play"]')).toHaveText('Pause');
    await page.locator('#sheet [data-go="5"]').click();
    const jumped = await clock();
    expect(jumped.played).toBeGreaterThan(later.played + 15);   // five steps on
    expect(Number(await page.locator('#storyBar').getAttribute('aria-valuenow'))).toBeGreaterThan(30);
    /* the ends: no step before the first, none after the last */
    await page.locator('#sheet [data-go="0"]').click();
    await expect(page.locator('#transport [data-story="prev"]')).toBeDisabled();
    await page.locator(`#sheet [data-go="${STORIES.heart.length - 1}"]`).click();
    await expect(page.locator('#transport [data-story="next"]')).toBeDisabled();
    await page.locator('#transport [data-story="prev"]').click();
    await expect(page.locator('#storyCount')).toHaveText(`${STORIES.heart.length - 1} / ${STORIES.heart.length}`);
    /* the keyboard: the arrows step, and the space bar pauses, though the last thing clicked was the strip's own button */
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#storyCount')).toHaveText(`${STORIES.heart.length - 2} / ${STORIES.heart.length}`);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#storyCount')).toHaveText(`${STORIES.heart.length - 1} / ${STORIES.heart.length}`);
    await page.keyboard.press(' ');
    await expect(page.locator('#transport [data-story="play"]')).toHaveText('Play');
    await page.keyboard.press(' ');
    await expect(page.locator('#transport [data-story="play"]')).toHaveText('Pause');
    expect(errors).toEqual([]);
  });
  test('a story told to its end goes back to where it was started: a region, or home', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    test.setTimeout(150_000);
    const errors = await open(page, 'sex=female&closeup=teeth');
    await page.locator('#sheet [data-watch]').click();
    await page.locator(`#sheet [data-go="${STORIES.teeth.length - 1}"]`).click();
    await expect.poll(() => place(page), { timeout: 40_000 }).toMatchObject({ region: 'teeth', story: null });
    await expect(page.locator('#sheetTitle')).toHaveText(REGIONS.teeth.title);
    await expect(page.locator('#transport')).toBeHidden();
    expect(await model(page, () => ({ moving: window.bodyModel.motion().moving, voice: window.bodyModel.sound().key }))).toEqual({ moving: false, voice: null });
    /* from home */
    await page.locator('#homeBtn').click();
    await settle(page);
    await page.locator('#sheet [data-watch="eye"]').click();
    await page.locator(`#sheet [data-go="${STORIES.eye.length - 1}"]`).click();
    await expect.poll(() => place(page), { timeout: 40_000 }).toMatchObject({ region: null, story: null, view: 'body' });
    await expect(page.locator('#layerStrip')).toBeVisible();
    expect(errors).toEqual([]);
  });
  test('the captions under the model are the step\'s own sentences, one after another', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    test.setTimeout(120_000);
    const errors = await open(page);
    await page.locator('#sheet [data-watch=""]').click();   // the tour
    const stop = ENTRIES[TOUR.map(([entry]) => entry)[0]], whole = `${stop.name}. ${stop.what} ${stop.does}`;
    await expect(page.locator('#say')).toHaveAttribute('data-words', whole);
    const seen = new Set();
    for (let k = 0; k < 40 && seen.size < 2; k++) { seen.add(await page.locator('#say').textContent()); await page.waitForTimeout(500); }
    expect(seen.size, 'the caption moves on with the voice').toBeGreaterThanOrEqual(2);
    for (const caption of seen) { expect(whole).toContain(caption); expect(caption.length).toBeLessThan(whole.length); }
    expect([...seen][0].startsWith(`${stop.name}.`)).toBe(true);
    await expect(page.locator('#say b')).toHaveCount(await page.locator('#say').textContent().then(text => (text.startsWith(`${stop.name}.`) ? 1 : 0)));
    expect(errors).toEqual([]);
  });
  test('the tour lists its stops, goes to the one clicked, and steps on from it', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    await page.locator('#sheet [data-watch=""]').click();
    const stops = await model(page, () => window.bodyModel.state.story.steps.map(step => step.entry));
    await expect(page.locator('#sheet [data-go]')).toHaveCount(stops.length);
    await page.locator('#sheet [data-go="6"]').click();
    await settle(page);
    await expect(page.locator('#storyCount')).toHaveText(`7 / ${stops.length}`);
    expect(await place(page)).toMatchObject({ entry: stops[6], story: 'tour' });
    await page.locator('#transport [data-story="next"]').click();
    await settle(page);
    expect(await place(page)).toMatchObject({ entry: stops[7] });
    await expect(page.locator('#sheet [aria-current="true"]')).toBeInViewport();   // the list keeps the stop being told in sight
    await page.keyboard.press('Escape');
    await settle(page);
    expect(await place(page)).toEqual({ region: null, view: 'body', entry: null, story: null, contents: false });
    expect(errors).toEqual([]);
  });
});

test.describe('the bar', () => {
  test('Labels turns every label off and on: the glowing points, a layer\'s callouts, a region\'s, and a story\'s', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    const shown = () => model(page, () => { window.bodyModel.frame(performance.now()); return { points: window.bodyModel.spots().length, tags: [...document.querySelectorAll('#labels .tag')].filter(tag => !tag.hidden).length }; });
    expect((await shown()).points).toBeGreaterThanOrEqual(6);
    await page.locator('#labelsBtn').click();
    await expect(page.locator('#labelsBtn')).toHaveAttribute('aria-pressed', 'false');
    expect(await shown()).toEqual({ points: 0, tags: 0 });
    await page.locator('#labelsBtn').click();
    expect((await shown()).points).toBeGreaterThanOrEqual(6);
    /* a layer */
    await page.locator('#views [data-view="skeleton"]').click();
    await settle(page);
    await expect.poll(async () => (await shown()).tags).toBeGreaterThan(3);
    await page.locator('#labelsBtn').click();
    expect((await shown()).tags).toBe(0);
    /* it stays off through a region, a part and a story, and Contents shows the same switch */
    await page.goto('/?sex=female&closeup=heart');
    await page.waitForSelector('html[data-model-ready="true"]');
    await settle(page);
    await expect.poll(async () => (await shown()).tags).toBeGreaterThan(3);
    await page.locator('#labelsBtn').click();
    expect((await shown()).tags).toBe(0);
    await page.locator('#sheet .parts button').first().click();
    await settle(page);
    expect((await shown()).tags).toBe(0);
    await page.locator('#sheet .back').click();
    await page.locator('#sheet [data-watch]').click();
    await page.locator('#sheet [data-go="2"]').click();
    await settle(page);
    expect((await shown()).tags).toBe(0);
    await page.locator('#labelsBtn').click();
    await expect.poll(async () => (await shown()).tags).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.locator('#contentsBtn').click();
    await expect(page.locator('#contents [data-toggle="labels"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#contents [data-toggle="labels"]').click();
    await expect(page.locator('#labelsBtn')).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });
  test('the search finds parts, regions and stories, by keyboard or by click, and says so when it finds nothing', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    const find = page.locator('#find'), rows = page.locator('#found [data-found]');
    await find.fill('femur');
    await expect(rows.first()).toContainText('Femur');
    await page.keyboard.press('Enter');
    await settle(page);
    expect(await place(page)).toMatchObject({ entry: 'femur', view: 'skeleton' });
    await expect(find).toHaveValue('');
    /* a region, by the second row and the arrow keys */
    await find.fill('knee');
    await expect(rows.first()).toBeVisible();
    const names = await rows.allTextContents();
    const region = names.findIndex(name => /^Knee/.test(name) && /Region/.test(name));
    expect(region, `a row for the knee as a region, among ${names.join(' | ')}`).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < region; k++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await settle(page);
    expect(await place(page)).toMatchObject({ region: 'knee', entry: null });
    /* a story, by a click */
    await find.fill('how the heart');
    await rows.filter({ hasText: 'How the heart beats' }).first().dispatchEvent('pointerdown');
    await settle(page);
    expect(await place(page)).toMatchObject({ region: 'heart', story: 'steps' });
    await page.locator('#transport [data-story="exit"]').click();
    /* nothing found: the list says so, and Escape clears it */
    await find.fill('zzzqqq');
    await expect(page.locator('#found')).toBeVisible();
    await expect(rows).toHaveCount(0);
    expect((await page.locator('#found').textContent()).trim().length).toBeGreaterThan(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#found')).toBeHidden();
    await expect(find).toHaveValue('');
    /* every region of this body is found by its name */
    const regions = await model(page, () => window.bodyModel.regions());
    for (const id of regions) {
      await find.fill(REGIONS[id].name);
      await expect(rows.filter({ hasText: 'Region' }).first(), `${REGIONS[id].name} is found as a region`).toBeVisible();
    }
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
  test('Female and Male keep the place where they can, and go home where the other body has no such region', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page, 'sex=female&closeup=knee');
    await page.locator('#sexSwitch [data-sex="male"]').click();
    await page.waitForFunction(() => window.bodyModel.body().sex === 'male');
    await settle(page);
    expect(await place(page)).toMatchObject({ region: 'knee' });
    await page.locator('#sexSwitch [data-sex="female"]').click();
    await page.waitForFunction(() => window.bodyModel.body().sex === 'female');
    await settle(page);
    /* a region only she has, then to him */
    await page.locator('#contentsBtn').click();
    await page.locator('#contents [data-region="breast"]').click();
    await settle(page);
    expect(await place(page)).toMatchObject({ region: 'breast' });
    await page.locator('#sexSwitch [data-sex="male"]').click();
    await page.waitForFunction(() => window.bodyModel.body().sex === 'male');
    await settle(page);
    expect((await place(page)).region).not.toBe('breast');
    await expect(page.locator('#sheetTitle')).toBeVisible();
    /* in the middle of a story: the story ends, and the page is still whole */
    await page.locator('#homeBtn').click();
    await page.locator('#sheet [data-watch="knee"]').click();
    await page.locator('#sheet [data-go="1"]').click();
    await page.locator('#sexSwitch [data-sex="female"]').click();
    await page.waitForFunction(() => window.bodyModel.body().sex === 'female');
    await settle(page);
    const after = await place(page);
    if (after.story) { await expect(page.locator('#transport')).toBeVisible(); await expect(page.locator('#storyCount')).toHaveText(/^\d+ \/ \d+$/); expect(await model(page, () => window.bodyModel.motion().moving)).toBe(true); }
    else { await expect(page.locator('#transport')).toBeHidden(); await expect(page.locator('#sheetTitle')).toBeVisible(); }
    expect(errors).toEqual([]);
  });
});

test.describe('the sheet', () => {
  test('the way back is first in the sheet: from a part to its region, from a region to the whole body, from a part to its layer', async ({ page }) => {
    const errors = await open(page, 'sex=female&closeup=teeth');
    await expect(page.locator('#sheet .back')).toHaveText('Back to the whole body');
    await page.locator('#sheet .parts button').nth(2).click();
    await settle(page);
    await expect(page.locator('#sheet .back')).toHaveText('Back to the teeth');
    expect(await page.locator('#sheet > *').nth(1).getAttribute('class')).toBe('back');   // first, after the phone's handle
    await expect(page.locator('#sheet .back')).toBeInViewport();
    await page.locator('#sheet .back').click();
    await settle(page);
    expect(await place(page)).toMatchObject({ region: 'teeth', entry: null });
    await page.locator('#sheet .back').click();
    await settle(page);
    expect(await place(page)).toEqual({ region: null, view: 'body', entry: null, story: null, contents: false });
    await expect(page.locator('#sheet .back')).toHaveCount(0);   // home has nowhere to go back to
    /* a part on the whole body goes back to its layer */
    await page.locator('#views [data-view="organs"]').click();
    await settle(page);
    await model(page, () => window.bodyModel.selectEntry('liver'));
    await settle(page);
    await expect(page.locator('#sheet .back')).toHaveText('Back to the organs');
    await page.locator('#sheet .back').click();
    await settle(page);
    expect(await place(page)).toMatchObject({ region: null, view: 'organs', entry: null });
    expect(errors).toEqual([]);
  });
  test('beside a part picked out of it the rest of the body is faint, and the slider sets how faint, from one part to the next', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    await page.locator('#views [data-view="organs"]').click();
    await settle(page);
    await model(page, () => window.bodyModel.selectEntry('liver'));
    await settle(page);
    const others = () => model(page, () => { const m = window.bodyModel, chosen = new Set(m.state.selection.parts), parts = m.body().parts.filter(part => part.layer === 'organs' && !chosen.has(part.index)); return { most: Math.max(...parts.map(part => m.opacityOf(part.index))), chosen: Math.min(...[...chosen].map(index => m.opacityOf(index))) }; });
    const faint = await others();
    expect(faint.chosen).toBe(1);
    expect(faint.most).toBeLessThan(0.05);
    await page.locator('#rest').fill('20');
    expect((await others()).most).toBeCloseTo(0.2, 1);
    await page.locator('#sheet [data-step="1"]').click();
    await settle(page);
    await expect(page.locator('#rest')).toHaveValue('20');   // it keeps its setting from part to part
    expect((await others()).most).toBeCloseTo(0.2, 1);
    await page.locator('#rest').fill('0');
    expect((await others()).most).toBe(0);
    expect(errors).toEqual([]);
  });
  test('a structure with no notes of its own still has a sheet: its name, where it belongs, and the way back', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#views [data-view="skeleton"]').click();
    await settle(page);
    const index = await model(page, () => { const m = window.bodyModel, body = m.body(), noted = new Set(Object.values(body.entries).flat()); return body.parts.find(part => part.layer === 'skeleton' && !noted.has(part.index))?.index ?? -1; });
    test.skip(index < 0, 'every bone falls under a main part');
    const name = await model(page, index => { window.bodyModel.selectPart(index); return window.bodyModel.part(index).name; }, index);
    await settle(page);
    await expect(page.locator('#sheetTitle')).toHaveText(name);
    await expect(page.locator('#sheet .back')).toBeVisible();
    await page.locator('#sheet .back').click();
    expect((await place(page)).entry).toBe(null);
    expect(errors).toEqual([]);
  });
});

test.describe('Contents', () => {
  test('every row under Watch starts its own story, and Exit brings back the place it was started from', async ({ page }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(240_000);
    const errors = await open(page);
    await page.locator('#contentsBtn').click();
    const rows = await page.locator('#contentsWatch [data-watch]').evaluateAll(buttons => buttons.map(button => button.dataset.watch));
    expect(rows.length).toBeGreaterThan(20);
    for (const id of rows) {
      await page.locator('#contentsBtn').click();
      if (!(await page.locator('#contents').isVisible())) await page.locator('#contentsBtn').click();
      await page.locator(`#contentsWatch [data-watch="${id}"]`).click();
      await expect(page.locator('#contents'), id || 'tour').toBeHidden();
      await expect(page.locator('#transport'), id || 'tour').toBeVisible();
      expect(await place(page), id || 'tour').toMatchObject({ region: id || null, story: id ? 'steps' : 'tour' });
      await expect(page.locator('#storyCount'), id || 'tour').toHaveText(/^1 \/ \d+$/);
      await page.locator('#transport [data-story="exit"]').click();
      expect(await place(page), `${id || 'tour'}: Exit goes home, where it was started`).toMatchObject({ region: null, story: null });
    }
    expect(errors).toEqual([]);
  });
  test('every row opens: each region, each layer, each switch and slider under View, and the credits are there', async ({ page }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(240_000);
    const errors = await open(page);
    const contents = async () => { if (!(await page.locator('#contents').isVisible())) await page.locator('#contentsBtn').click(); await expect(page.locator('#contents')).toBeVisible(); };
    await contents();
    const regions = await page.locator('#contents [data-region]').evaluateAll(buttons => buttons.map(button => button.dataset.region));
    expect(regions.sort()).toEqual((await model(page, () => window.bodyModel.regions())).sort());
    for (const id of regions) {
      await contents();
      await page.locator(`#contents [data-region="${id}"]`).click();
      await settle(page);
      expect(await place(page), id).toMatchObject({ region: id, story: null, contents: false });
      await expect(page.locator('#sheetTitle'), id).toHaveText(REGIONS[id].title);
      await expect(page.locator('#sheet .parts button'), id).toHaveCount(await model(page, () => window.bodyModel.entries().length));
      expect(await model(page, () => window.bodyModel.motion().moving), `${id} opens still`).toBe(false);
    }
    for (const view of ['body', 'muscles', 'organs', 'vessels', 'nerves', 'skeleton']) {
      await contents();
      await page.locator(`#contents [data-layer="${view}"]`).click();
      await settle(page);
      expect(await place(page), view).toMatchObject({ region: null, view, contents: false });
    }
    /* View */
    await contents();
    for (const key of ['clothed', 'cut']) {
      const was = await model(page, key => window.bodyModel.state[key], key);
      await page.locator(`#contents [data-toggle="${key}"]`).click();
      expect(await model(page, key => window.bodyModel.state[key], key), key).toBe(!was);
      await contents();
      await expect(page.locator(`#contents [data-toggle="${key}"]`)).toHaveAttribute('aria-pressed', String(!was));
      await page.locator(`#contents [data-toggle="${key}"]`).click();
      await contents();
    }
    await page.locator('#xraySwitch').click();
    expect(await model(page, () => window.bodyModel.state.xray)).toBeGreaterThan(0.5);
    await expect(page.locator('#xrayOut')).toHaveText(/^On/);
    await page.locator('#xray').fill('40');
    expect(await model(page, () => window.bodyModel.state.xray)).toBeCloseTo(0.4, 2);
    await page.locator('#xraySwitch').click();
    await expect(page.locator('#xrayOut')).toHaveText('Off');
    await page.locator('#body').fill('60');
    expect(await model(page, () => window.bodyModel.state.body)).toBeCloseTo(0.6, 2);
    await expect(page.locator('#bodyOut')).toHaveText('60%');
    const tones = page.locator('#tones button');
    expect(await tones.count()).toBeGreaterThan(2);
    await tones.nth(2).click();
    expect(await model(page, () => window.bodyModel.state.tone)).toBe(2);
    await expect(tones.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await contents();
    await page.locator('#resetBtn').click();
    await settle(page);
    const before = await model(page, () => window.bodyModel.camera.position.toArray());
    await model(page, () => { window.bodyModel.camera.position.x += 40; window.bodyModel.controls.update(); });
    await contents();
    await page.locator('#resetBtn').click();
    await settle(page);
    const after = await model(page, () => window.bodyModel.camera.position.toArray());
    expect(Math.hypot(...after.map((value, axis) => value - before[axis]))).toBeLessThan(1);
    /* About and the credits */
    await contents();
    for (const source of ['BodyParts3D', 'Visible Human', 'Z-Anatomy', 'MakeHuman', 'Not medical advice']) await expect(page.locator('#credits')).toContainText(source);
    for (const link of await page.locator('#contents a').evaluateAll(links => links.map(link => link.href))) expect(link).toMatch(/^https:\/\//);
    await page.locator('#contentsBtn').click();
    await expect(page.locator('#contents')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('the model', () => {
  test('every glowing point opens its own region', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    const points = await model(page, () => { window.bodyModel.frame(performance.now()); return window.bodyModel.spots(); });
    expect(points.length).toBeGreaterThanOrEqual(6);
    for (const id of points) {
      await model(page, () => window.bodyModel.frame(performance.now()));
      await page.locator('.spot:visible').filter({ hasText: new RegExp(`^${{ digestive: 'Gut' }[id] || sentence(id)}$`, 'i') }).first().click();
      await settle(page);
      expect(await place(page), id).toMatchObject({ region: id });
      await page.locator('#homeBtn').click();
      await settle(page);
    }
    expect(errors).toEqual([]);
  });
  test('dragging turns the model, the wheel comes closer, and the canvas follows the window', async ({ page }, testInfo) => {
    chromiumOnly(testInfo);   // WebKit under Playwright does not deliver the wheel to the canvas
    const errors = await open(page);
    const view = () => model(page, () => ({ at: window.bodyModel.camera.position.toArray(), far: window.bodyModel.camera.position.distanceTo(window.bodyModel.controls.target) }));
    const box = await page.locator('#scene').boundingBox(), before = await view();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const turned = await view();
    expect(Math.hypot(...turned.at.map((value, axis) => value - before.at[axis]))).toBeGreaterThan(5);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(600);
    expect((await view()).far).toBeLessThan(turned.far);
    for (let k = 0; k < 40; k++) await page.mouse.wheel(0, -900);
    await page.waitForTimeout(600);
    expect((await view()).far).toBeGreaterThanOrEqual(4.9);   // it stops short of going inside
    /* swiped sideways or up and down as far as it will go (two fingers on a trackpad), the model is never lost: the middle of the view stays inside the body */
    const lost = () => model(page, () => {
      const m = window.bodyModel, skin = m.body().parts.find(part => part.name === 'Skin'), target = m.controls.target;
      const inside = [0, 1, 2].every(axis => target.getComponent(axis) >= skin.min[axis] - 0.01 && target.getComponent(axis) <= skin.max[axis] + 0.01);
      const middle = target.clone().project(m.camera);
      return { inside, onScreen: Math.abs(middle.x) < 1 && Math.abs(middle.y) < 1 && middle.z < 1 };
    });
    for (const [dx, dy] of [[4000, 0], [-9000, 0], [0, 6000], [0, -12000], [5000, 5000]]) {
      for (let k = 0; k < 6; k++) await page.mouse.wheel(dx / 6, dy / 6);
      await page.waitForTimeout(250);
      expect(await lost(), `swiped by ${dx}, ${dy}`).toEqual({ inside: true, onScreen: true });
    }
    /* the window changes size */
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(500);
    const sizes = await model(page, () => { const canvas = document.querySelector('#scene').getBoundingClientRect(), stage = document.querySelector('#stage').getBoundingClientRect(); return { canvas: [canvas.width, canvas.height], stage: [stage.width, stage.height], wide: document.documentElement.scrollWidth <= window.innerWidth, tall: document.documentElement.scrollHeight <= window.innerHeight + 1 }; });
    expect(sizes.canvas).toEqual(sizes.stage);
    expect(sizes).toMatchObject({ wide: true, tall: true });
    expect(errors).toEqual([]);
  });
  test('the layer strip is the whole body\'s: each layer by its button, and it gives way to a region and a story', async ({ page }) => {
    const errors = await open(page);
    for (const view of ['muscles', 'organs', 'vessels', 'nerves', 'skeleton', 'body']) {
      await page.locator(`#views [data-view="${view}"]`).click();
      await settle(page);
      expect((await place(page)).view).toBe(view);
      await expect(page.locator(`#views [data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#sheet .eyebrow')).toHaveText(/^Layer \d of 6$/);
    }
    await page.locator('#sheet [data-watch="knee"]').click();
    await expect(page.locator('#layerStrip')).toBeHidden();
    await page.locator('#transport [data-story="exit"]').click();
    await expect(page.locator('#layerStrip')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('links into the site', () => {
  test('a link opens a body, a region of it, or the whole body when the region is not that body\'s or is no region at all', async ({ page }) => {
    const errors = await open(page, 'sex=male&closeup=malePelvis');
    expect(await place(page)).toMatchObject({ region: 'malePelvis' });
    await open(page, 'sex=male&closeup=breast');
    expect(await place(page)).toMatchObject({ region: null, view: 'body' });
    await open(page, 'sex=female&closeup=nosuchplace');
    expect(await place(page)).toMatchObject({ region: null, view: 'body' });
    await expect(page.locator('#sheetTitle')).toBeVisible();
    await open(page, 'sex=nobody');
    await expect(page.locator('#sheetTitle')).toBeVisible();
    await open(page, 'kiosk');
    await expect(page.locator('#sheetTitle')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test('a story fits the screen: the strip, the caption and the bar inside it, nothing to scroll sideways, and the sheet out of the way', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'the phone layout');
    const errors = await open(page, 'sex=female&closeup=heart');
    await page.locator('#sheet [data-watch]').scrollIntoViewIfNeeded();
    await page.locator('#sheet [data-watch]').click();
    await settle(page);
    const fits = () => model(page, () => {
      const width = window.innerWidth, height = window.innerHeight, box = selector => document.querySelector(selector).getBoundingClientRect();
      const inside = rect => rect.left >= -0.5 && rect.right <= width + 0.5 && rect.top >= -0.5 && rect.bottom <= height + 0.5;
      const strip = box('#transport'), controls = [...document.querySelectorAll('#transport > *')].filter(el => !el.hidden).map(el => el.getBoundingClientRect());
      return { strip: inside(strip), controls: controls.every(rect => rect.left >= strip.left - 0.5 && rect.right <= strip.right + 0.5 && rect.width > 0), say: inside(box('#say')) && box('#say').bottom <= strip.top + 1, bar: inside(box('.bar')), sideways: document.documentElement.scrollWidth <= width, sheet: getComputedStyle(document.querySelector('#sheet')).display };
    });
    expect(await fits()).toEqual({ strip: true, controls: true, say: true, bar: true, sideways: true, sheet: 'none' });
    await page.locator('#transport [data-story="next"]').click();
    await page.locator('#transport [data-story="next"]').click();
    await settle(page);
    await expect(page.locator('#storyCount')).toHaveText(`3 / ${STORIES.heart.length}`);
    expect(await fits()).toEqual({ strip: true, controls: true, say: true, bar: true, sideways: true, sheet: 'none' });
    await page.locator('#transport [data-story="exit"]').click();
    await expect(page.locator('#sheet')).toBeVisible();
    expect(errors).toEqual([]);
  });
  test('the sheet opens taller and closes again by its handle, and every control in the bar is on the screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'the phone layout');
    const errors = await open(page, 'sex=female&closeup=knee');
    const tall = () => page.locator('#sheet').evaluate(el => el.getBoundingClientRect().height);
    const short = await tall();
    await page.locator('#sheet .sheet-handle').click();
    expect(await tall()).toBeGreaterThan(short + 60);
    await page.locator('#sheet .sheet-handle').click();
    expect(await tall()).toBeLessThan(short + 5);
    /* and by dragging it: it follows the finger, and settles taller or shorter, whichever it was left nearer */
    const pull = async by => {
      const handle = await page.locator('#sheet .sheet-handle').boundingBox(), x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + by / 2, { steps: 4 }); await page.mouse.move(x, y + by, { steps: 4 });
      const during = await tall();
      await page.mouse.up();
      return during;
    };
    expect(await pull(-260)).toBeGreaterThan(short + 150);
    await expect(page.locator('#sheet')).toHaveClass(/full/);
    expect(await pull(300)).toBeLessThan(short + 40);
    await expect(page.locator('#sheet')).not.toHaveClass(/full/);
    expect(await tall()).toBeLessThan(short + 5);
    for (const selector of ['#homeBtn', '#find', '#sexSwitch', '#soundBtn', '#labelsBtn', '#contentsBtn']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).toBeTruthy();
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(page.viewportSize().width + 0.5);
      expect(box.height, `${selector} is big enough to touch`).toBeGreaterThanOrEqual(32);
    }
    await expect(page.locator('#sheet .back')).toBeVisible();
    await page.locator('#sheet .back').click();
    await settle(page);
    expect(await place(page)).toMatchObject({ region: null });
    await expect(page.locator('#hint')).toBeVisible();   // the hint over the model is the phone's, on the whole body, until the model is touched
    expect(errors).toEqual([]);
  });
});
