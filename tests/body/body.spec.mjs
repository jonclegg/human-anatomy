import { test, expect } from '@playwright/test';
import { ENTRIES } from '../../site/body/parts.mjs';

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
    expect(requested.sort()).toEqual(['male/nerves.glb', 'male/organs.glb', 'male/skeleton.glb', 'male/skin.glb']);   // not muscles or vessels until asked
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
    await model(page, () => window.bodyModel.selectEntry('femur'));
    await expect(page.locator('#inspector .source')).toContainText('Visible Human Female');
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
    const pyramid = await model(page, () => window.bodyModel.body().parts.findIndex(part => /^Left renal pyramid/.test(part.name)));
    expect(pyramid).toBeGreaterThan(-1);
    const chosen = await model(page, index => { window.bodyModel.selectPart(index); return window.bodyModel.state.selection.parts.map(other => window.bodyModel.sideOf(other)); }, pyramid);
    expect(chosen.length).toBeGreaterThan(10);
    expect(new Set(chosen)).toEqual(new Set(['left']));
    await expect(page.locator('#inspectorTitle')).toHaveText('Kidneys');
    await expect(page.locator('#inspector .aka')).toContainText('Left renal pyramid');
  });

  test('choosing a part isolates it: it stays solid and the rest fades', async ({ page }) => {
    await open(page, { view: 'organs' });
    await model(page, () => window.bodyModel.selectEntry('liver'));
    const opacities = await model(page, () => { const m = window.bodyModel; return { liver: m.opacityOf(m.entryParts('liver')[0]), heart: m.opacityOf(m.entryParts('heart')[0]) }; });
    expect(opacities.liver).toBe(1);
    expect(opacities.heart).toBeLessThan(0.2);
    if (!isPhone(page)) { await page.locator('#isolateChip').click(); expect(await model(page, () => window.bodyModel.state.selection)).toBeNull(); }
  });

  test('‹ › and the arrow keys step through the main parts in number order', async ({ page }) => {
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

    test(`${sex}: no organ passes through bone`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'geometry, checked once');
      await open(page, { sex, view: 'organs' });   // the organs view loads the skeleton too, as faint context
      const results = await model(page, () => {
        const m = window.bodyModel, parts = m.body().parts;
        const solid = part => part.layer === 'skeleton' && !/cartilage|disk|ligament|membrane|meniscus|symphysis/i.test(part.name);
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
