import { test, expect } from '@playwright/test';
import { ENTRIES } from '../../site/body/parts.mjs';
import { REGIONS, DETAILS } from '../../site/body/closeups.mjs';
import { STORIES } from '../../site/body/stories.mjs';

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
async function open(page, { sex = 'male', view } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/?sex=${sex}`);
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
  if (view) await page.locator(`#views [data-view="${view}"]`).click();
  await settle(page);
  return errors;
}
const model = (page, script, arg) => page.evaluate(script, arg);
const isPhone = page => page.viewportSize().width <= 820;
const desktopOnly = testInfo => test.skip(testInfo.project.name === 'iphone', 'desktop interaction');

test.describe('loading', () => {
  test.use({ reducedMotion: 'reduce' });
  test('renders the body without errors, quickly, loading only the layers it shows', async ({ page }) => {
    const requested = [];
    page.on('request', request => { if (request.url().endsWith('.glb')) requested.push(request.url().split('/').slice(-2).join('/')); });
    const errors = await open(page);
    await expect(page.locator('#loading')).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByName('body:first-frame')[0].startTime)).toBeLessThan(10_000);
    expect(await model(page, () => window.bodyModel.coverage())).toBeGreaterThan(0.03);
    expect(requested.sort()).toEqual(['male/clothing.glb', 'male/nerves.glb', 'male/organs.glb', 'male/skeleton.glb', 'male/skin.glb']);   // not muscles or vessels until asked
    expect(errors).toEqual([]);
  });

  test('an idle page does not keep redrawing', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(1500);
    const before = await model(page, () => window.bodyModel.renders());
    await page.waitForTimeout(2000);
    expect(await model(page, () => window.bodyModel.renders())).toBe(before);
  });

  test('every view draws something and loads its layer on demand', async ({ page }) => {
    await open(page);
    for (const [view, layer] of [['skeleton', 'skeleton'], ['muscles', 'muscles'], ['organs', 'organs'], ['vessels', 'vessels'], ['nerves', 'nerves'], ['body', 'organs']]) {
      await page.locator(`#views [data-view="${view}"]`).click();
      await settle(page);
      expect(await model(page, () => window.bodyModel.loaded())).toContain(layer);
      expect(await model(page, () => window.bodyModel.coverage()), view).toBeGreaterThan(0.02);
    }
  });
});

test.describe('both bodies', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the Female and Male switch swaps bodies, each with its own organs', async ({ page }) => {
    await open(page, { view: 'organs' });
    const male = await model(page, () => ({ parts: window.bodyModel.body().parts.length, entries: window.bodyModel.entries() }));
    expect(male.parts).toBeGreaterThan(2000);
    expect(male.entries).toEqual(expect.arrayContaining(['prostate', 'testis', 'heart', 'lungs']));
    expect(male.entries).not.toContain('uterus');
    await page.locator('#sexSwitch [data-sex="female"]').click();
    await settle(page);
    const female = await model(page, () => ({ sex: window.bodyModel.body().sex, parts: window.bodyModel.body().parts.length, entries: window.bodyModel.entries() }));
    expect(female.sex).toBe('female');
    expect(female.parts).toBeGreaterThan(2000);
    expect(female.entries).toEqual(expect.arrayContaining(['uterus', 'ovary', 'breast', 'heart', 'lungs']));
    expect(female.entries).not.toContain('prostate');
    await expect(page.locator('#figure')).toContainText('Female');
    expect(await model(page, () => window.bodyModel.coverage())).toBeGreaterThan(0.02);
    // her callouts, not his: the labels are rebuilt for the new body
    await expect(page.locator('#labels .tag:not([hidden])').first()).toBeVisible();
    await expect(page.locator('#labels .tag', { hasText: 'Uterus' })).toHaveCount(1);
    await expect(page.locator('#labels .tag', { hasText: 'Prostate' })).toHaveCount(0);
  });

  test('a selected part carries over to its equivalent in the other body', async ({ page }) => {
    await open(page);
    await model(page, () => window.bodyModel.selectEntry('testis'));
    await page.locator('#sexSwitch [data-sex="female"]').click();
    await settle(page);
    await expect(page.locator('#inspectorTitle')).toHaveText('Ovaries');
    await model(page, () => window.bodyModel.selectEntry('femur'));
    await page.locator('#sexSwitch [data-sex="male"]').click();
    await settle(page);
    await expect(page.locator('#inspectorTitle')).toHaveText('Femur');
  });

  test('fitted female parts say so, scanned ones say where they come from', async ({ page }) => {
    await open(page, { sex: 'female', view: 'skeleton' });
    await model(page, () => window.bodyModel.selectEntry('humerus'));
    await expect(page.locator('#inspector .source em')).toHaveText('Fitted');
    await model(page, () => window.bodyModel.selectEntry('uterus'));
    await expect(page.locator('#inspector .source')).toContainText('Visible Human Female');
  });
});

test.describe('moving', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the height ruler and the up and down keys move the view up and down the body', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    const y = () => model(page, () => window.bodyModel.controls.target.y);
    const box = await page.locator('#heightRuler .scale').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.1);
    expect(await y()).toBeGreaterThan(140);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
    expect(await y()).toBeLessThan(30);
    const before = await y();
    await page.locator('#scene').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowUp');
    expect(await y()).toBeGreaterThan(before);
  });
});

test.describe('clothing', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const sex of ['male', 'female']) {
    test(`${sex}: the body opens clothed, solid, and the Clothing switch takes it off`, async ({ page }) => {
      await open(page, { sex });
      const skin = await model(page, () => window.bodyModel.findPart('Skin'));
      expect(await model(page, index => window.bodyModel.opacityOf(index), skin)).toBe(1);
      expect(await model(page, () => window.bodyModel.clothing())).toMatchObject({ shown: true, opacity: 1 });
      expect((await model(page, () => window.bodyModel.clothing())).triangles).toBeGreaterThan(500);   // modelled garments: his cut-off jeans are about 700 triangles
      if (sex === 'male') expect(await model(page, index => window.bodyModel.opacityOf(index), await model(page, () => window.bodyModel.findPart('Pubic hair')))).toBe(0);
      await page.locator(isPhone(page) ? '#partsBtn' : '#clothedBtn').click();
      if (isPhone(page)) await page.locator('#drawer [data-toggle="clothed"]').click();
      expect((await model(page, () => window.bodyModel.clothing())).shown).toBe(false);
    });
  }

  for (const [sex, entry] of [['male', 'penis'], ['female', 'uterus']]) {
    test(`${sex}: covered on first load, uncovered only by choosing a reproductive part`, async ({ page }) => {
      await open(page, { sex });
      expect(await model(page, () => window.bodyModel.clothing())).toMatchObject({ shown: true, opacity: 1 });
      for (const view of ['skeleton', 'organs', 'body']) {   // looking around keeps it covered
        await page.locator(`#views [data-view="${view}"]`).click();
        await settle(page);
        expect((await model(page, () => window.bodyModel.clothing())).shown, view).toBe(true);
      }
      await model(page, key => window.bodyModel.selectEntry(key), entry);
      expect((await model(page, () => window.bodyModel.clothing())).shown, `choosing ${entry}`).toBe(false);
      await model(page, () => window.bodyModel.selectEntry('heart'));
      expect((await model(page, () => window.bodyModel.clothing())).shown, 'choosing another part covers it again').toBe(true);
    });
  }

  test('inside views the clothing fades with the skin but still covers', async ({ page }) => {
    await open(page, { view: 'skeleton' });
    const { shown, opacity } = await model(page, () => window.bodyModel.clothing());
    expect(shown).toBe(true);
    expect(opacity).toBeGreaterThan(0.3);
    expect(opacity).toBeLessThan(1);
  });
});

test.describe('parts', () => {
  test('every main part has a description, a misconception, measurements and an equivalent', () => {
    for (const [key, entry] of Object.entries(ENTRIES)) {
      expect(entry.name, key).toBeTruthy();
      expect(entry.what?.length, `${key} what`).toBeGreaterThan(40);
      expect(entry.does?.length, `${key} does`).toBeGreaterThan(30);
      expect(entry.bug?.length, `${key} misconception`).toBeGreaterThan(30);
      expect(entry.stats?.length, `${key} stats`).toBeGreaterThanOrEqual(3);
      expect(entry.other, `${key} other sex`).toBeTruthy();
    }
    expect(Object.keys(ENTRIES).length).toBeGreaterThanOrEqual(150);
  });

  test('every structure is named and can be found in the parts list', async ({ page }) => {
    await open(page);
    const names = await model(page, () => window.bodyModel.body().parts.map(part => part.name));
    expect(names.every(name => name && name.length > 2)).toBe(true);
    if (isPhone(page) || !(await page.locator('#drawer').isVisible())) await page.locator('#partsBtn').click();
    await page.locator('#search').fill('renal artery');
    await expect(page.locator('#partGroups button').first()).toBeVisible();
    await page.locator('#partGroups [data-part]').first().click();
    await expect(page.locator('#inspectorTitle')).toContainText(/renal artery/i);
  });

  test('both bodies have more than 2,900 structures, with Z-Anatomy\'s additions credited', async ({ page }) => {
    for (const sex of ['male', 'female']) {
      await open(page, { sex });
      const found = await model(page, () => ({ count: window.bodyModel.body().parts.length, entries: window.bodyModel.entries() }));
      expect(found.count, sex).toBeGreaterThan(2900);
      expect(found.entries, sex).toEqual(expect.arrayContaining(['latissimusDorsi', 'rectusAbdominis', 'facialMuscles', 'thyroid', 'lymphNodes', 'legNerves', 'armNerves', 'brachialPlexus']));
    }
    await model(page, () => window.bodyModel.selectEntry('thyroid'));
    await expect(page.locator('#inspector .source')).toContainText('Z-Anatomy');
  });

  for (const sex of ['male', 'female']) {
    test(`${sex}: structures the audit found misfiled sit under the right main part, on their named side`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'data, checked once');
      await open(page, { sex });
      const result = await model(page, () => {
        const m = window.bodyModel, b = m.body(), keys = Object.keys(b.entries);
        const entryOf = name => { const part = b.parts.find(p => p.name === name); if (!part) return null; return keys.find(key => b.entries[key].includes(part.index)) || 'none'; };
        /* a structure named for one side lies wholly on the other only where the name is not a side of the body */
        const misplaced = b.parts.filter(p => /^(left|right)\b/i.test(p.name) && !/ventricle|atri|valve|cusp|papillary|chorda|conus|coronary|cardiac|marginal (branch|artery|vein)|interventricular|hepatic|liver|portal|gastr|colic|epiploic|lobe|segment|bronch|lung|pulmonary|vagus|crus of|bundle|brachiocephalic|subclavian|carotid|duct/i.test(p.name)
          && (/^left/i.test(p.name) ? p.max[0] < -0.5 : p.min[0] > 0.5)).map(p => p.name);
        return {
          colon: (b.entries.colon || []).map(i => b.parts[i].name).filter(name => /mesocolon|mesentery/i.test(name)),
          maxillary: entryOf('Left maxillary nerve') || entryOf('Maxillary nerve'),
          teeth: b.parts.filter(p => /teeth|tooth/i.test(p.name)).map(p => p.layer),
          lips: b.parts.filter(p => /^lips?$/i.test(p.name)).map(p => p.layer),
          coronary: (b.entries.coronaryArteries || []).map(i => b.parts[i].name).filter(name => /femoral|humeral|callosomarginal|colon|scapular/i.test(name)),
          valves: (b.entries.heartValves || []).map(i => b.parts[i].name).filter(name => /ileocecal/i.test(name)),
          misplaced,
        };
      });
      expect(result.colon, 'mesocolon is not colon').toEqual([]);
      if (result.maxillary) expect(result.maxillary).toBe('cranialNerves');
      expect(new Set(result.teeth)).toEqual(new Set(['skeleton']));
      for (const layer of result.lips) expect(layer).toBe('skin');
      expect(result.coronary, 'only the heart\'s own arteries are coronary').toEqual([]);
      expect(result.valves).toEqual([]);
      expect(result.misplaced, 'left and right names match the side').toEqual([]);
    });
  }

  test('almost every structure falls under a main part\'s notes', async ({ page }) => {
    for (const sex of ['male', 'female']) {
      await open(page, { sex });
      const share = await model(page, () => { const body = window.bodyModel.body(); return [...body.entryOf].filter(at => at >= 0).length / body.parts.length; });
      expect(share, sex).toBeGreaterThan(0.97);
    }
  });
});

test.describe('picking and inspector', () => {
  test.use({ reducedMotion: 'reduce' });
  test('clicking the model selects the structure under the pointer', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page, { view: 'skeleton' });
    const femur = await model(page, () => window.bodyModel.findPart('Left femur'));
    const point = await model(page, index => window.bodyModel.screenOf(index), femur);
    await page.mouse.click(point.x, point.y);
    await settle(page);
    await expect(page.locator('#inspectorTitle')).toHaveText('Left femur');
    await expect(page.locator('#inspector .aka')).toContainText('Femur');
  });

  test('picking a piece of an organ selects the organ on that side', async ({ page }) => {
    await open(page, { sex: 'female', view: 'organs' });
    const segment = await model(page, () => { const parts = window.bodyModel.body().parts, index = parts.findIndex(part => /segment of left lung$/.test(part.name)); return { index, name: parts[index]?.name }; });
    expect(segment.index).toBeGreaterThan(-1);
    const chosen = await model(page, index => { window.bodyModel.selectPart(index); return window.bodyModel.state.selection.parts.map(other => window.bodyModel.sideOf(other)); }, segment.index);
    expect(chosen.length).toBeGreaterThan(5);
    expect(new Set(chosen)).toEqual(new Set(['left']));
    await expect(page.locator('#inspectorTitle')).toHaveText('Lungs');
    await expect(page.locator('#inspector .aka')).toContainText(segment.name);
  });

  test('choosing a part isolates it: it stays solid and the rest fades', async ({ page }) => {
    await open(page, { view: 'organs' });
    await model(page, () => window.bodyModel.selectEntry('liver'));
    const opacities = await model(page, () => { const m = window.bodyModel; return { liver: m.opacityOf(m.entryParts('liver')[0]), heart: m.opacityOf(m.entryParts('heart')[0]) }; });
    expect(opacities.liver).toBe(1);
    expect(opacities.heart).toBeLessThan(0.2);
    if (!isPhone(page)) { await page.locator('#isolateChip').click(); expect(await model(page, () => window.bodyModel.state.selection)).toBeNull(); }
  });

  test('Back, Next and the arrow keys step through the main parts in number order', async ({ page }) => {
    await open(page, { view: 'skeleton' });
    await model(page, () => window.bodyModel.selectEntry('skull'));
    await page.locator('#inspector [data-step="1"]').click();
    await expect(page.locator('#inspectorTitle')).toHaveText('Mandible');
    await page.locator('#inspector [data-step="-1"]').click();
    await expect(page.locator('#inspectorTitle')).toHaveText('Skull');
    if (!isPhone(page)) {
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await expect(page.locator('#inspectorTitle')).toHaveText('Hyoid bone');
    }
  });

  test('X-ray fades the view\'s outer layer, and the skin slider fades the skin', async ({ page }) => {
    await open(page, { view: 'muscles' });
    const deltoid = await model(page, () => window.bodyModel.entryParts('deltoid')[0]);
    expect(await model(page, index => window.bodyModel.opacityOf(index), deltoid)).toBe(1);
    await page.locator('#dockBtn').click();
    await page.locator('#xraySwitch').click();
    expect(await model(page, index => window.bodyModel.opacityOf(index), deltoid)).toBeLessThan(0.5);
    await page.locator('#body').fill('60');
    const skin = await model(page, () => window.bodyModel.findPart('Skin'));
    expect(await model(page, index => window.bodyModel.opacityOf(index), skin)).toBeCloseTo(0.6, 1);
  });
});

test.describe('close-ups', () => {
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 240_000 });
  test('every close-up has a title, an opening text and a view, and every part of it its notes', () => {
    expect(Object.keys(REGIONS).length).toBeGreaterThanOrEqual(15);
    for (const [id, region] of Object.entries(REGIONS)) {
      for (const field of ['name', 'note', 'title', 'figure']) expect(region[field], `${id} ${field}`).toBeTruthy();
      expect(region.text.any || (region.text.female && region.text.male) || region.text[region.sex], `${id} text`).toBeTruthy();
      expect(region.direction, `${id} direction`).toHaveLength(3);
      expect(region.parts.length, `${id} parts`).toBeGreaterThanOrEqual(6);
    }
    for (const [key, entry] of Object.entries(DETAILS)) {
      for (const field of ['name', 'what', 'does', 'bug']) expect(entry[field], `${key} ${field}`).toBeTruthy();
      expect(entry.stats, `${key} stats`).toHaveLength(3);
      for (const text of [entry.what, entry.does, entry.bug]) expect(text, key).not.toMatch(/—/);
    }
  });
  for (const sex of ['female', 'male']) {
    test(`${sex}: each close-up shows its own numbered parts solid, its context faint and nothing else`, async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      const errors = await open(page, { sex });
      const ids = await model(page, () => window.bodyModel.regions());
      expect(ids.length).toBeGreaterThanOrEqual(12);
      expect(ids).toContain(sex === 'female' ? 'vulva' : 'malePelvis');
      expect(ids).not.toContain(sex === 'female' ? 'malePelvis' : 'vulva');
      for (const id of ids) {
        const seen = await model(page, async id => {
          const m = window.bodyModel; m.setRegion(id); await m.ready();
          const body = m.body(), around = m.around(), order = m.entries();
          return { parts: order.length, listed: document.querySelectorAll('#side .stops button').length,
            own: [...around.own].filter(index => body.parts[index].layer !== 'skin' && m.opacityOf(index) < 1).length,
            context: [...around.context].filter(index => m.opacityOf(index) === 0 || m.opacityOf(index) > 0.5).length,
            others: body.parts.filter((part, index) => part.layer !== 'skin' && !around.own.has(index) && !around.context.has(index) && m.opacityOf(index) > 0).length,
            clothing: m.clothing().opacity, coverage: m.coverage(), pressed: document.querySelectorAll('#views [aria-pressed="true"]').length };
        }, id);
        expect(seen.parts, id).toBe(REGIONS[id].parts.filter(key => !(DETAILS[key] || ENTRIES[key]).sex || (DETAILS[key] || ENTRIES[key]).sex === sex).length);   // every listed part is in this body
        expect(seen.listed, id).toBe(STORIES[id] ? STORIES[id].length : seen.parts);   // beside it: its story's steps where it has a story, else its parts
        expect({ own: seen.own, context: seen.context, others: seen.others, clothing: seen.clothing, pressed: seen.pressed }, id).toEqual({ own: 0, context: 0, others: 0, clothing: 0, pressed: 0 });
        expect(seen.coverage, id).toBeGreaterThan(0.03);
      }
      expect(errors).toEqual([]);
    });
  }
  test('stepping and the tour stay inside a close-up; leaving it brings the whole body back', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    await model(page, async () => { window.bodyModel.setRegion('heart'); await window.bodyModel.ready(); });
    await settle(page);
    const first = REGIONS.heart.parts.slice(0, 2);
    await page.keyboard.press('ArrowRight');
    expect(await model(page, () => window.bodyModel.state.selection.entry)).toBe(first[0]);
    await expect(page.locator('#inspector .stepper span')).toHaveText(new RegExp(`^1 of ${REGIONS.heart.parts.length}$`));
    await page.keyboard.press('ArrowRight');
    expect(await model(page, () => window.bodyModel.state.selection.entry)).toBe(first[1]);
    expect(await model(page, () => window.bodyModel.state.region)).toBe('heart');
    await page.locator('#tourBtn').click();
    await expect(page.locator('#tourCount')).toHaveText(`Tour 1 of ${STORIES.heart.length}`);   // the heart's tour is its story
    await expect(page.locator('#inspectorTitle')).toHaveText(STORIES.heart[0].title);
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'true');   // a tour is told aloud
    await page.locator('#side [data-story="3"]').click();                               // a later step: one stretch of the beat, slowed, one side's blood, its own labels
    await expect(page.locator('#inspectorTitle')).toHaveText(STORIES.heart[3].title);
    await expect.poll(() => model(page, () => window.bodyModel.sound().key)).toBe('story:heart:3');
    await expect.poll(() => page.locator('#labels .tag:not([hidden])').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Right ventricle'), expect.stringContaining('Pulmonary valve')]));
    await page.locator('#tourBtn').click();
    await page.keyboard.press('Escape');
    await page.locator('#inspector [data-leave]').click();
    await settle(page);
    expect(await model(page, () => ({ region: window.bodyModel.state.region, femur: window.bodyModel.entries().includes('femur'), numbered: window.bodyModel.entries().length }))).toEqual({ region: null, femur: true, numbered: expect.any(Number) });
    await expect(page.locator('#views [data-view="body"]')).toHaveAttribute('aria-pressed', 'true');
  });
  test('the close-ups menu lists this body\'s close-ups and opens one; it carries over to the other body when that body has it', async ({ page }) => {
    await open(page, { sex: 'female' });
    await page.locator('#closeupsBtn').click();
    await expect(page.locator('#closeupList [data-region="vulva"]')).toBeVisible();
    await expect(page.locator('#closeupList [data-region="malePelvis"]')).toHaveCount(0);
    await page.locator('#closeupList [data-region="knee"]').click();
    await settle(page);
    await expect(page.locator('#closeups')).toBeHidden();
    await expect(page.locator('#inspector h2')).toHaveText(REGIONS.knee.title);
    await page.locator('#sexSwitch [data-sex="male"]').click();
    await settle(page);
    expect(await model(page, () => [window.bodyModel.state.sex, window.bodyModel.state.region])).toEqual(['male', 'knee']);
    await model(page, async () => { await window.bodyModel.switchSex('female'); window.bodyModel.setRegion('vulva'); await window.bodyModel.ready(); await window.bodyModel.switchSex('male'); });
    expect(await model(page, () => [window.bodyModel.state.sex, window.bodyModel.state.region])).toEqual(['male', null]);
  });
  test('the midline cut takes away the body\'s left half', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page, { view: 'skeleton' });
    const femurs = await model(page, () => ['Left femur', 'Right femur'].map(name => window.bodyModel.findPart(name)));
    expect(Math.min(...femurs)).toBeGreaterThanOrEqual(0);
    await page.locator('#cutBtn').click();
    await settle(page);
    await page.waitForTimeout(300);
    expect(await model(page, femurs => femurs.map(index => window.bodyModel.visibleNow(index)), femurs)).toEqual([false, true]);
    await page.locator('#cutBtn').click();
    await settle(page);
    expect(await model(page, femurs => window.bodyModel.visibleNow(femurs[0]), femurs)).toBe(true);
  });
  test('female: the modelled vulva, clitoris and urethra sit in her pelvis and meet her scanned organs', async ({ page }) => {
    await open(page, { sex: 'female', view: 'organs' });
    const seen = await model(page, () => {
      const m = window.bodyModel, parts = m.body().parts, named = name => { const part = parts.find(item => item.name === name); if (!part) throw new Error(`no ${name}`); return part; };
      const hips = [named('Left hip bone'), named('Right hip bone')], modelled = parts.filter(part => part.source === 'Wooten Labs');
      const box = { min: [0, 1, 2].map(c => Math.min(...hips.map(hip => hip.min[c]))), max: [0, 1, 2].map(c => Math.max(...hips.map(hip => hip.max[c]))) };
      const crura = [named('Left crus of clitoris'), named('Right crus of clitoris')], urethra = named('Urethra'), bladder = named('Urinary bladder'), vagina = named('Vagina'), hymen = named('Hymen'), glans = named('Glans of clitoris');
      return {
        modelled: modelled.length, sources: [...new Set(modelled.map(part => part.layer))].sort(),
        outsidePelvis: modelled.filter(part => part.centre[0] < box.min[0] || part.centre[0] > box.max[0] || part.centre[1] > box.max[1] || part.centre[1] < box.min[1] - 6).map(part => part.name),
        clitorisSpan: Math.max(...crura.map(crus => crus.max[0])) - Math.min(...crura.map(crus => crus.min[0])),
        glansWidth: glans.max[0] - glans.min[0],
        urethraLength: Math.hypot(...urethra.max.map((value, c) => value - urethra.min[c])),
        urethraToBladder: bladder.min[1] - urethra.max[1],
        vaginaToOpening: Math.hypot(vagina.centre[0] - hymen.centre[0], vagina.min[1] - hymen.centre[1]),
        midline: Math.abs(glans.centre[0]),
      };
    });
    expect(seen.modelled).toBeGreaterThanOrEqual(24);
    expect(seen.sources).toEqual(['muscles', 'organs', 'skin']);
    expect(seen.outsidePelvis).toEqual([]);
    expect(seen.clitorisSpan).toBeGreaterThan(6); expect(seen.clitorisSpan).toBeLessThan(12);   // across the two crura, along the pubic arch
    expect(seen.glansWidth).toBeGreaterThan(0.3); expect(seen.glansWidth).toBeLessThan(1);      // 3–10 mm (Lloyd 2005)
    expect(seen.urethraLength).toBeGreaterThan(3); expect(seen.urethraLength).toBeLessThan(6.5);
    expect(seen.urethraToBladder).toBeLessThan(0.3);   // it reaches the bladder
    expect(seen.vaginaToOpening).toBeLessThan(1.5);    // the vagina comes down to the opening
    expect(seen.midline).toBeLessThan(0.3);
  });
});

test.describe('peel and glowing points', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the peel fades the body from skin to muscles with no jump, and lands on each layer\'s view', async ({ page }) => {
    await open(page);
    const sweep = await model(page, async () => {
      const m = window.bodyModel, skin = m.findPart('Skin'), out = [];
      for (let k = 0; k <= 10; k++) { m.setPeel(k / 10); await m.ready(); out.push({ skin: m.opacityOf(skin), clothing: m.clothing().opacity, view: m.state.view, blended: !!m.state.blend }); }
      return out;
    });
    expect(sweep[0]).toEqual({ skin: 1, clothing: 1, view: 'body', blended: false });
    expect(sweep[10]).toMatchObject({ skin: 0, clothing: 0, view: 'muscles', blended: false });
    for (let k = 1; k <= 10; k++) {
      expect(sweep[k].skin, `skin at ${k / 10}`).toBeLessThanOrEqual(sweep[k - 1].skin);
      expect(sweep[k - 1].skin - sweep[k].skin, `skin step at ${k / 10}`).toBeLessThan(0.16);   // even steps: no jump anywhere along the way
      expect(sweep[k].clothing, `clothing at ${k / 10}`).toBeLessThanOrEqual(sweep[k - 1].clothing);
    }
    await page.locator('#peel').fill('500');
    await settle(page);
    expect(await model(page, () => window.bodyModel.state.view)).toBe('skeleton');
    await expect(page.locator('#views [data-view="skeleton"]')).toHaveAttribute('aria-pressed', 'true');
  });
  test('glowing points on the whole body open a close-up\'s card, and the card starts its tour', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    const spots = await model(page, () => { window.bodyModel.frame(performance.now()); return window.bodyModel.spots(); });
    expect(spots).toEqual(expect.arrayContaining(['brain', 'heart', 'hand', 'knee', 'foot']));
    await expect(page.locator('#side .card h3')).toHaveText(REGIONS.heart.title);
    await page.locator('.spot[aria-label="Open the knee"]').click();
    await expect(page.locator('#side .card h3')).toHaveText(REGIONS.knee.title);
    await page.locator('#side [data-tour-region="knee"]').click();
    await settle(page);
    expect(await model(page, () => [window.bodyModel.state.region, !!window.bodyModel.state.tour, window.bodyModel.state.selection?.entry])).toEqual(['knee', true, REGIONS.knee.parts[0]]);
    await expect(page.locator('#tourCount')).toHaveText(`Tour 1 of ${REGIONS.knee.parts.length}`);
    await expect(page.locator('#side .stops button[aria-current="true"]')).toHaveCount(1);
    expect(await model(page, () => window.bodyModel.spots())).toEqual([]);   // the points belong to the whole body
  });
});

test.describe('motion', () => {
  test('in the heart close-up the chambers squeeze in turn, the valves open and shut, and blood runs through both sides', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?sex=male&closeup=heart');
    await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
    await model(page, () => window.bodyModel.ready());
    const at = phase => model(page, phase => {
      const m = window.bodyModel, parts = m.body().parts, find = pattern => parts.findIndex(part => pattern.test(part.name)), opacity = pattern => m.opacityOf(find(pattern));
      m.holdMotion(phase); m.frame(performance.now());
      const scale = pattern => m.moveOf(find(pattern))[12];   // how far a part is drawn in toward its pivot: 1 is not at all
      return { ...m.motion(), tricuspid: opacity(/leaflet of tricuspid valve$/), aortic: opacity(/cusp of aortic valve$/), wall: opacity(/^Wall of ventricle$/), atrium: scale(/^Cavity of right atrium$/), ventricle: scale(/^Cavity of left ventricle$/) };
    }, phase);
    const topUp = await at(0.07), ejecting = await at(0.3), refilling = await at(0.8);
    expect(topUp).toMatchObject({ moving: true, drops: 4800, caption: expect.stringContaining('Atria squeeze') });
    expect(topUp.atrium).toBeLessThan(0.83); expect(topUp.ventricle).toBe(1);
    expect(ejecting.atrium).toBe(1); expect(ejecting.ventricle).toBeLessThan(0.76);
    expect(ejecting.tricuspid).toBe(1); expect(ejecting.aortic).toBeLessThan(0.3);        // inflow shut, outflow open
    expect(refilling.tricuspid).toBeLessThan(0.3); expect(refilling.aortic).toBe(1);      // and the other way round
    expect([refilling.atrium, refilling.ventricle]).toEqual([1, 1]);
    await expect(page.locator('#figure span')).toHaveText(['Atria squeeze', 'Ventricles squeeze', 'Heart refills']);   // the three moments stay put,
    await expect(page.locator('#figure span.now')).toHaveText('Heart refills');                                          // and the one it is in is lit
    expect(refilling.wall).toBeLessThan(0.4);                                             // the walls are glass, so the blood shows
    const before = await model(page, () => { window.bodyModel.holdMotion(null); return window.bodyModel.renders(); });
    /* the labels hold their places while the heart moves under them */
    await page.waitForTimeout(600);
    const layouts = await page.evaluate(async () => {
      const seen = new Set();
      for (let k = 0; k < 20; k++) { seen.add([...document.querySelectorAll('#labels .tag')].filter(tag => !tag.hidden).map(tag => tag.textContent + tag.style.transform).join('|')); await new Promise(done => setTimeout(done, 100)); }
      return [...seen];
    });
    expect(layouts).toHaveLength(1); expect(layouts[0]).toContain('Right atrium');
    await page.waitForTimeout(700);
    expect(await model(page, () => window.bodyModel.renders())).toBeGreaterThan(before);   // it keeps moving
    await page.locator('#inspector [data-motion]').click();
    expect(await model(page, () => ({ ...window.bodyModel.motion(), wall: window.bodyModel.opacityOf(window.bodyModel.findPart('Wall of ventricle')), still: window.bodyModel.moveOf(window.bodyModel.findPart('Wall of ventricle')).every(value => value === 0) }))).toMatchObject({ moving: false, drops: 0, wall: 1, still: true });
    expect(errors).toEqual([]);
  });
  for (const sex of ['male', 'female']) {
    test(`every close-up of the ${sex} body that has a motion runs it, with a caption for each moment`, async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      test.setTimeout(240_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`/?sex=${sex}`);
      await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
      const regions = await model(page, () => window.bodyModel.regions().filter(id => window.bodyModel.motions().includes(id)));
      expect(regions.length).toBeGreaterThan(12);
      for (const id of regions) {
        const seen = await model(page, async id => {
          const m = window.bodyModel, wait = ms => new Promise(done => setTimeout(done, ms));
          m.setRegion(id); await m.ready();
          for (let tries = 0; tries < 100 && !m.motion().moving; tries++) await wait(50);   // its layers arrive, then it starts
          const moments = [];
          for (const phase of [0.05, 0.3, 0.55, 0.8]) {
            m.holdMotion(phase); m.frame(performance.now());
            const moves = m.body().parts.map((part, index) => m.moveOf(index)), moved = moves.filter(move => move[3] > 0);
            moments.push({ ...m.motion(), moved: moved.length, finite: moves.flat().every(Number.isFinite), switch: document.querySelector('#inspector [data-motion]')?.textContent });
          }
          m.holdMotion(null);
          return moments;
        }, id);
        for (const moment of seen) {
          expect(moment, id).toMatchObject({ moving: true, finite: true });
          expect(moment.caption.length, `${id} has a caption`).toBeGreaterThan(12);
          expect(moment.caption.length, `${id}'s caption fits the line under the figure`).toBeLessThan(190);
          expect(moment.moved + moment.drops, `${id} moves something or has something flowing`).toBeGreaterThan(0);
          expect(moment.switch, id).toMatch(/^(Stop|Keep) /);
        }
      }
      expect(errors).toEqual([]);
    });
  }
  test('a step of the heart\'s story plays its own stretch of the beat, slowed, with one side\'s blood', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await page.goto('/?sex=male&closeup=heart');
    await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
    await model(page, () => window.bodyModel.ready());
    await expect.poll(() => model(page, () => window.bodyModel.motion().moving)).toBe(true);
    await page.locator('#side [data-story="3"]').click();
    await page.waitForTimeout(500);
    const phases = await page.evaluate(async () => { const seen = []; for (let k = 0; k < 30; k++) { seen.push(window.bodyModel.motion().phase); await new Promise(done => setTimeout(done, 100)); } return seen; });
    expect(Math.min(...phases)).toBeGreaterThan(0.129); expect(Math.max(...phases)).toBeLessThan(0.581);
    expect(new Set(phases).size).toBeGreaterThan(10);   // and it moves through it
    await page.locator('#inspector [data-tour="stop"]').click();
    await page.waitForTimeout(1500);
    const free = await page.evaluate(async () => { const seen = []; for (let k = 0; k < 14; k++) { seen.push(window.bodyModel.motion().phase); await new Promise(done => setTimeout(done, 100)); } return seen; });
    expect(Math.max(...free) - Math.min(...free)).toBeGreaterThan(0.7);   // the tour over, the heart beats on at its own pace
  });
  test('with reduced motion nothing moves until it is asked to', async ({ browser }, testInfo) => {
    desktopOnly(testInfo);
    const context = await browser.newContext({ reducedMotion: 'reduce' }), page = await context.newPage();
    await page.goto('/?sex=male&closeup=knee');
    await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
    await model(page, () => window.bodyModel.ready());
    expect(await model(page, () => window.bodyModel.motion().moving)).toBe(false);
    await page.locator('#inspector [data-motion]').click();
    await expect.poll(() => model(page, () => window.bodyModel.motion().moving)).toBe(true);
    await context.close();
  });
});

test.describe('sound', () => {
  test.use({ reducedMotion: 'reduce' });
  test('sound is off until asked for; then music plays, and the voice speaks for what is on show', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    const errors = await open(page);
    expect(await model(page, () => window.bodyModel.sound())).toMatchObject({ on: false, clip: null, musicPlaying: false });
    await page.locator('#soundBtn').click();
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => model(page, () => window.bodyModel.sound())).toMatchObject({ on: true, key: 'view:body', clip: 'view-body.mp3', speaking: true, music: 'music.mp3', musicPlaying: true });
    expect((await model(page, () => window.bodyModel.sound())).musicLevel).toBeLessThan(0.1);   // the music drops under the voice
    await page.locator('#side [data-tour-region="heart"]').click();
    await settle(page);
    await expect.poll(() => model(page, () => window.bodyModel.sound().key)).toBe('story:heart:0');
    await page.waitForTimeout(1500);
    expect(await model(page, () => window.bodyModel.state.tour.index)).toBe(0);   // the tour waits for the voice
    await page.locator('#soundBtn').click();
    expect(await model(page, () => window.bodyModel.sound())).toMatchObject({ on: false, speaking: false, musicPlaying: false });
    expect(errors).toEqual([]);
  });
});

test.describe('layout', () => {
  test('the model gets most of the screen and nothing scrolls sideways', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const free = await model(page, () => window.bodyModel.freeRect());
    const viewport = page.viewportSize();
    expect((free.right - free.left) * (free.bottom - free.top)).toBeGreaterThan(viewport.width * viewport.height * (isPhone(page) ? 0.35 : 0.3));
  });

  test('on phones the tools sit along the bottom and details open in a sheet over the model', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'phone layout');
    await open(page);
    const rail = await page.locator('.rail').boundingBox(), viewport = page.viewportSize();
    expect(rail.y + rail.height).toBeGreaterThan(viewport.height - 80);
    await model(page, () => window.bodyModel.selectEntry('heart'));
    const sheet = await page.locator('#inspector').boundingBox();
    expect(sheet.width).toBeGreaterThan(viewport.width - 40);
    expect(sheet.y).toBeGreaterThan(viewport.height * 0.3);
  });
});

/* Sizes from the models themselves, against published adult ranges. Lengths are along each structure's long axis. */
test.describe('anatomy', () => {
  test.describe.configure({ timeout: 180_000 });
  test('female: a slim young body', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'geometry, checked once');
    await open(page, { sex: 'female' });
    const waist = await model(page, () => {
      const m = window.bodyModel, skin = m.findPart('Skin'), points = m.points(skin), height = m.size('skin').y;
      /* the narrowest trunk width between the hips and the ribs, and the depth there. Her forearms hang beside her
         waist: the trunk is the run of points through the midline with no gap of 3 cm across. */
      let best = null;
      for (let y = 0.56 * height; y <= 0.66 * height; y += 0.5) {
        const across = points.filter(p => Math.abs(p[1] - y) < 1.5).sort((a, b) => a[0] - b[0]);   // the hook samples about 2,000 of the skin's points
        const start = across.findIndex(p => p[0] >= 0);
        if (start < 1) continue;
        let low = start - 1, high = start;
        while (low > 0 && across[low][0] - across[low - 1][0] < 3) low--;
        while (high < across.length - 1 && across[high + 1][0] - across[high][0] < 3) high++;
        const row = across.slice(low, high + 1);
        if (row.length < 8) continue;
        const width = row.at(-1)[0] - row[0][0], depth = Math.max(...row.map(p => p[2])) - Math.min(...row.map(p => p[2]));
        if (!best || width < best.width) best = { width, depth };
      }
      return { ...best, source: m.part(skin).source };
    });
    expect(waist.source).toBe('MakeHuman');
    expect(waist.width, 'a waist was measured').toBeDefined();
    expect(waist.width, 'waist width').toBeLessThan(28);
    expect(waist.depth, 'waist depth').toBeLessThan(21);
  });

  const RANGES = {
    male: { height: [160, 190], femur: [42, 52], humerus: [28, 37], tibia: [33, 43], kidney: [9, 13.5], heart: [10, 15], spleen: [8, 14], trachea: [9, 15], spinalCord: [38, 50], pelvisWidth: [24, 32] },
    /* her scanned heart is about 15.5 cm long, above the usual 12–14 cm; the Visible Human Female was 59 and died of a heart
       attack, so this range allows for her heart as scanned rather than a typical one */
    female: { height: [150, 180], femur: [38, 48], humerus: [25, 34], tibia: [30, 40], kidney: [9, 13.5], heart: [9, 16.5], spleen: [8, 14], trachea: [8, 14], spinalCord: [35, 48], pelvisWidth: [25, 34], uterus: [5, 10] },
  };
  for (const sex of ['male', 'female']) {
    test(`${sex}: every measurement falls inside its published range`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'geometry, checked once');
      await open(page, { sex });
      for (const view of ['skeleton', 'nerves']) { await page.locator(`#views [data-view="${view}"]`).click(); await settle(page); }
      const measured = await model(page, () => {
        const m = window.bodyModel;
        const lengthOf = (key, side) => m.lengthOf(key, side);
        return {
          height: m.size('skin').y, femur: lengthOf('femur', 'left'), humerus: lengthOf('humerus', 'left'), tibia: lengthOf('tibia', 'left'),
          kidney: lengthOf('kidney', 'left'), heart: lengthOf('heart'), spleen: lengthOf('spleen'), trachea: lengthOf('trachea'), spinalCord: lengthOf('spinalCord'),
          pelvisWidth: m.size('hipBone').x, uterus: m.entryParts('uterus').length ? lengthOf('uterus') : null,
        };
      });
      for (const [name, [low, high]] of Object.entries(RANGES[sex])) {
        expect(measured[name], `${sex} ${name}`).toBeGreaterThanOrEqual(low);
        expect(measured[name], `${sex} ${name}`).toBeLessThanOrEqual(high);
      }
      expect(measured.femur / measured.height, 'femur share of height').toBeGreaterThan(0.24);
      expect(measured.femur / measured.height, 'femur share of height').toBeLessThan(0.29);
    });

    test(`${sex}: bone and muscle stay inside the skin`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'geometry, checked once');
      await open(page, { sex, view: 'muscles' });
      const share = await model(page, () => {
        const m = window.bodyModel, parts = m.body().parts, skin = [m.findPart('Skin')];
        const pick = layer => parts.filter(part => part.layer === layer).map(part => part.index);
        return { skeleton: m.inside(pick('skeleton'), skin, 3000, true), muscles: m.inside(pick('muscles'), skin, 3000, true) };
      });
      expect(share.skeleton, `${sex} bone inside the skin`).toBeGreaterThan(0.97);
      expect(share.muscles, `${sex} muscle inside the skin`).toBeGreaterThan(0.98);
    });

    test(`${sex}: no organ passes through bone`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'geometry, checked once');
      await open(page, { sex, view: 'organs' });   // the organs view loads the skeleton too, as faint context
      const results = await model(page, () => {
        const m = window.bodyModel, parts = m.body().parts;
        const solid = part => part.layer === 'skeleton' && !/cartilage|dis[ck]|ligament|membrane|meniscus|symphysis/i.test(part.name);
        const fittedBones = parts.filter(part => solid(part) && (part.fitted || part.source === 'BodyParts3D')).map(part => part.index);
        const scannedBones = parts.filter(part => solid(part) && !part.fitted && part.source !== 'BodyParts3D').map(part => part.index);
        const out = {};
        for (const key of ['heart', 'lungs', 'liver', 'kidney', 'spleen', 'stomach', 'bladder', 'pancreas', 'uterus', 'prostate']) {
          const organ = m.entryParts(key);
          if (!organ.length) continue;
          out[key] = { placed: m.inside(organ, fittedBones), scanned: scannedBones.length ? m.inside(organ, scannedBones) : 0 };
        }
        return out;
      });
      /* bones and organs that were placed, fitted or registered: under 2% of an organ's points may touch the inside of a bone */
      for (const [key, { placed }] of Object.entries(results)) expect(placed, `${sex} ${key} inside placed bone`).toBeLessThan(0.02);
      /* scanned organ against scanned bone of the same person (her lungs against her own sternum): left as scanned, under 1% */
      for (const [key, { scanned }] of Object.entries(results)) expect(scanned, `${sex} ${key} inside scanned bone`).toBeLessThan(0.01);
    });
  }
});
