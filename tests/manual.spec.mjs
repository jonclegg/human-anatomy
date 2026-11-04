import { test, expect } from '@playwright/test';

const desktopOnly = testInfo => test.skip(testInfo.project.name === 'iphone', 'desktop interaction');

const settle = page => page.waitForFunction(() => !window.wootenManual.busy(), null, { timeout: 5_000 });
/* the page opens on the whole body; tests about another view switch to it first */
async function open(page, view) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 30_000 });
  if (view) { await page.locator(`#views [data-view="${view}"]`).click(); await settle(page); }
  return errors;
}
const screenOf = (page, id) => page.evaluate(part => window.wootenManual.screenOf(part), id);
const inspectorTitle = page => page.locator('#inspector h2');
const visibleTags = page => page.locator('#labels .tag:not(.static):visible');
const isPhone = page => page.viewportSize().width <= 820;
/* phones keep Callouts and Colour code in the parts sheet, and Arousal/X-ray behind their own toolbar button */
async function toggle(page, key) {
  if (await page.locator(`.rail [data-toggle="${key}"]`).isVisible()) return page.locator(`.rail [data-toggle="${key}"]`).click();
  if (!(await page.locator('#drawer').isVisible())) await page.locator('#partsBtn').click();
  await page.locator(`#drawer [data-toggle="${key}"]`).click();
  await page.locator('#partsBtn').click();
}
async function openDock(page) { if (!(await page.locator('#dock').isVisible())) await page.locator('#dockBtn').click(); }
const partName = (page, id) => page.evaluate(part => document.querySelector(`#drawer [data-part="${part}"]`).childNodes[1].textContent, id);
async function drag(page, dx, dy) {
  const box = await page.locator('#scene').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(x + dx * k / 10, y + dy * k / 10);
  await page.mouse.up();
  await page.evaluate(() => window.wootenManual.frame(performance.now()));
}

test.describe('loading', () => {
  test.use({ reducedMotion: 'reduce' });   // instant camera moves, so software-rendered Chromium isn't timing flights
  test('renders the model without errors, quickly', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('#loading')).toHaveCount(0);
    const firstFrame = await page.evaluate(() => performance.getEntriesByName('manual:first-frame')[0].startTime);
    expect(firstFrame).toBeLessThan(8_000);
    const coverage = await page.evaluate(() => window.wootenManual.coverage());
    expect(coverage).toBeGreaterThan(0.04);   // it opens on the whole body: a tall, mostly see-through figure
    expect(errors).toEqual([]);
  });

  test('an idle page does not keep redrawing', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => window.wootenManual.renders());
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.wootenManual.renders())).toBe(before);
  });

  test('every view draws something', async ({ page }) => {
    await open(page);
    for (const view of ['body', 'front', 'clitoris', 'pee', 'inside']) {
      await page.locator(`#views [data-view="${view}"]`).click();
      await settle(page);
      expect(await page.evaluate(() => window.wootenManual.coverage()), view).toBeGreaterThan(view === 'body' ? 0.04 : 0.1);
    }
  });
});

test.describe('body and navigation', () => {
  test.use({ reducedMotion: 'reduce' });

  test('opens on the whole body standing upright, which the Body slider fades out', async ({ page }) => {
    await open(page);
    await expect(page.locator('#views [data-view="body"]')).toHaveAttribute('aria-pressed', 'true');
    const posture = await page.evaluate(() => window.wootenManual.posture());
    expect(posture.height).toBeGreaterThan(150);        // the whole body, head to feet (cm)
    expect(posture.height).toBeLessThan(180);
    expect(posture.headOffset).toBeLessThan(12);        // the head sits over the pelvis: she stands, not leans
    expect(posture.feetOffset).toBeLessThan(15);
    expect(posture.shown).toBe(true);
    await openDock(page);
    await page.locator('#body').fill('0');
    await expect(page.locator('#bodyOut')).toHaveText('Hidden');
    expect((await page.evaluate(() => window.wootenManual.posture())).shown).toBe(false);
  });

  test('Previous and Next, and the arrow keys, step through every part in number order', async ({ page }, testInfo) => {
    await open(page);
    if (isPhone(page)) { await page.locator('#partsBtn').click(); await page.locator('#drawer [data-step="1"]').click(); }   // phones start from the parts sheet
    else await page.locator('#inspector [data-step="1"]').click();
    await expect(page.locator('#inspector .stepper span')).toHaveText('1 of 33');
    await expect(inspectorTitle(page)).toHaveText('Mons pubis');
    await page.locator('#inspector [data-step="1"]').click();
    await expect(page.locator('#inspector .stepper span')).toHaveText('2 of 33');
    await page.locator('#inspector [data-step="-1"]').click();
    await page.locator('#inspector [data-step="-1"]').click();
    await expect(page.locator('#inspector .stepper span')).toHaveText('33 of 33');   // wraps round
    if (testInfo.project.name === 'iphone') return;
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#inspector .stepper span')).toHaveText('1 of 33');
    await page.keyboard.press('ArrowRight');
    await expect(inspectorTitle(page)).toHaveText(await partName(page, 'labiaMajora'));
  });
});

test.describe('labels', () => {
  test('the Labels button hides and shows labels', async ({ page }) => {
    await open(page);
    await expect(visibleTags(page).first()).toBeVisible();
    const before = await visibleTags(page).count();
    expect(before).toBeGreaterThanOrEqual(3);   // the body overview names only a few big landmarks
    await toggle(page, 'labels');
    await expect(page.locator('[data-toggle="labels"]').first()).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleTags(page)).toHaveCount(0);
    await toggle(page, 'labels');
    await expect(visibleTags(page)).toHaveCount(before);
  });

  test('organs under opaque skin are not labelled in the outside view', async ({ page }) => {
    await open(page, 'front');
    await expect(page.locator('#labels .tag', { hasText: 'Clitoral glans' })).toBeVisible();
    for (const hidden of ['Uterus', 'Bladder', 'Rectum', 'Ovaries']) await expect(page.locator('#labels .tag', { hasText: hidden })).toBeHidden();
    await page.locator('#views [data-view="inside"]').click();
    await settle(page);
    // labels that would overlap are thinned out, so on a small screen only some organs get one
    await expect(page.locator('#labels .tag:visible').filter({ hasText: /\d(Uterus|Bladder|Cervix|Vagina|Ovaries)$/ }).first()).toBeVisible();
  });

  test('clicking a label selects that part', async ({ page }) => {
    await open(page, 'front');
    await page.locator('#labels .tag', { hasText: 'Clitoral glans' }).click();
    await expect(inspectorTitle(page)).toHaveText('Clitoral glans');
  });
});

test.describe('rotation', () => {
  test('dragging that starts on a label still rotates', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page, 'front');
    const tag = await page.locator('#labels .tag', { hasText: 'Mons pubis' }).boundingBox();
    const before = await screenOf(page, 'labiaMajora');
    await page.mouse.move(tag.x + 10, tag.y + 10);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(tag.x + 10 + 18 * k, tag.y + 10);
    await page.mouse.up();
    await page.evaluate(() => window.wootenManual.frame(performance.now()));
    expect(Math.abs((await screenOf(page, 'labiaMajora')).x - before.x)).toBeGreaterThan(20);
    await expect(page.locator('#inspector h2')).not.toHaveText('Mons pubis');   // a drag is not a click
  });

  test('dragging left-right turns the model about the screen\'s vertical axis, with no spin', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page, 'front');
    const cameraAxes = () => page.evaluate(() => {
      const e = window.wootenManual.camera.matrixWorld.elements;
      return { up: [e[4], e[5], e[6]], forward: [-e[8], -e[9], -e[10]] };
    });
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const before = await cameraAxes();
    const outerBefore = await screenOf(page, 'labiaMajora');
    await drag(page, 220, 0);
    const after = await cameraAxes();
    expect(dot(before.up, after.up)).toBeGreaterThan(Math.cos(3 * Math.PI / 180));   // screen "up" did not roll
    expect(dot(before.forward, after.forward)).toBeLessThan(Math.cos(10 * Math.PI / 180)); // the view really turned
    expect(Math.abs(dot(after.forward, before.up))).toBeLessThan(0.05);               // and only sideways
    expect(Math.abs((await screenOf(page, 'labiaMajora')).x - outerBefore.x)).toBeGreaterThan(20);
  });

  test('dragging up-down tilts the model', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    const monsBefore = await screenOf(page, 'mons'), anusBefore = await screenOf(page, 'anus');
    await drag(page, 0, 160);
    const monsAfter = await screenOf(page, 'mons'), anusAfter = await screenOf(page, 'anus');
    expect(Math.abs((anusAfter.y - monsAfter.y) - (anusBefore.y - monsBefore.y))).toBeGreaterThan(15);
    expect(Math.abs((monsAfter.x - anusAfter.x) - (monsBefore.x - anusBefore.x))).toBeLessThan(12);   // no sideways spin
  });

  test('Reset view returns to the current view after dragging and zooming', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    const position = () => page.evaluate(() => window.wootenManual.camera.position.toArray());
    const before = await position();
    await drag(page, 200, 120);
    await page.mouse.wheel(0, -400);
    await page.evaluate(() => window.wootenManual.frame(performance.now()));
    const moved = await position();
    expect(Math.hypot(...moved.map((v, k) => v - before[k]))).toBeGreaterThan(5);
    await page.locator('#resetBtn').click();
    await settle(page);
    const after = await position();
    expect(Math.hypot(...after.map((v, k) => v - before[k]))).toBeLessThan(0.05);
  });

  test('the side view stands upright: head up, front and back level', async ({ page }) => {
    await open(page);
    await page.locator('#views [data-view="pee"]').click();
    await settle(page);
    const bladder = await screenOf(page, 'bladder'), urethra = await screenOf(page, 'urethra');
    const uterus = await screenOf(page, 'uterus'), rectum = await screenOf(page, 'rectum');
    expect(bladder.y).toBeLessThan(urethra.y);                       // bladder sits above the urethra
    expect(Math.sign(rectum.x - bladder.x)).not.toBe(0);             // front and back are side by side
    expect(Math.abs(uterus.y - bladder.y)).toBeLessThan(Math.abs(rectum.x - bladder.x));
  });
});

test.describe('touch', () => {
  // Real multi-finger touches need Chromium's DevTools protocol; Playwright's WebKit can only tap.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'chromium', 'multi-touch needs Chromium'));

  const cameraState = page => page.evaluate(() => {
    const { camera, controls } = window.wootenManual;
    const e = camera.matrixWorld.elements;
    return { up: [e[4], e[5], e[6]], forward: [-e[8], -e[9], -e[10]], position: camera.position.toArray(), distance: camera.position.distanceTo(controls.target) };
  });
  const angle = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI;
  /* fingers: a list of frames, each a list of [x, y] offsets from the stage centre, one per finger */
  async function touch(page, frames) {
    const box = await page.locator('#scene').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    const points = frame => frame.map(([x, y], id) => ({ x: cx + x, y: cy + y, id }));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(frames[0]) });
    for (const frame of frames.slice(1)) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(frame) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => window.wootenManual.frame(performance.now()));
  }
  const swipe = (dx, dy, steps = 12) => Array.from({ length: steps + 1 }, (_, k) => [[dx * k / steps, dy * k / steps]]);

  test('a one-finger swipe turns the model a steady amount, with no roll', async ({ page }) => {
    await open(page);
    const before = await cameraState(page);
    await touch(page, swipe(120, 0));
    const after = await cameraState(page);
    expect(angle(before.forward, after.forward)).toBeGreaterThan(25);   // 120 px ≈ 34°: as far per pixel as a mouse on a desktop
    expect(angle(before.forward, after.forward)).toBeLessThan(45);
    expect(angle(before.up, after.up)).toBeLessThan(3);
  });

  test('a wobbly finger path that ends where it began puts the model back', async ({ page }) => {
    await open(page);
    const before = await cameraState(page);
    const circle = Array.from({ length: 41 }, (_, k) => [[60 * Math.sin(k / 40 * 2 * Math.PI), 60 - 60 * Math.cos(k / 40 * 2 * Math.PI)]]);
    await touch(page, circle);
    const after = await cameraState(page);
    expect(angle(before.forward, after.forward)).toBeLessThan(1);
    expect(angle(before.up, after.up)).toBeLessThan(1);
  });

  test('pinching zooms without turning the model', async ({ page }) => {
    await open(page);
    const before = await cameraState(page);
    await touch(page, Array.from({ length: 11 }, (_, k) => [[-40 - 6 * k, 0], [40 + 6 * k, 0]]));
    const after = await cameraState(page);
    expect(after.distance).toBeLessThan(before.distance * 0.7);
    expect(angle(before.forward, after.forward)).toBeLessThan(2);
  });

  test('lifting one finger of a pinch does not make the model jump', async ({ page }) => {
    await open(page);
    const box = await page.locator('#scene').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    const send = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
    await send('touchStart', [{ x: cx - 50, y: cy, id: 0 }, { x: cx + 50, y: cy, id: 1 }]);
    await send('touchMove', [{ x: cx - 60, y: cy, id: 0 }, { x: cx + 60, y: cy, id: 1 }]);
    await send('touchEnd', [{ x: cx + 60, y: cy, id: 1 }]);                   // finger 0 lifts
    await page.evaluate(() => window.wootenManual.frame(performance.now()));
    const before = await cameraState(page);
    await send('touchMove', [{ x: cx + 64, y: cy, id: 1 }]);                 // the other finger moves 4 px
    await send('touchEnd', []);
    await page.evaluate(() => window.wootenManual.frame(performance.now()));
    expect(angle(before.forward, (await cameraState(page)).forward)).toBeLessThan(3);
  });

  test('Reset view puts the camera back after turning and zooming', async ({ page }) => {
    await open(page);
    const before = await cameraState(page);
    await touch(page, swipe(140, 90));
    await touch(page, Array.from({ length: 11 }, (_, k) => [[-40 - 6 * k, 0], [40 + 6 * k, 0]]));
    expect(angle(before.forward, (await cameraState(page)).forward)).toBeGreaterThan(20);
    await page.locator('#resetBtn').tap();
    await settle(page);
    const after = await cameraState(page);
    expect(angle(before.forward, after.forward)).toBeLessThan(0.5);
    expect(Math.abs(after.distance - before.distance)).toBeLessThan(0.05);
  });

  test('the Reset view button sits on the model, clear of the labels bar', async ({ page }) => {
    await open(page);
    const stage = await page.locator('#stage').boundingBox(), reset = await page.locator('#resetBtn').boundingBox();
    expect(reset.y).toBeGreaterThanOrEqual(stage.y);
    expect(reset.x + reset.width).toBeLessThanOrEqual(stage.x + stage.width);
    expect(reset.height).toBeGreaterThanOrEqual(32);   // big enough to hit with a thumb
  });
});

test.describe('picking and inspector', () => {
  test('clicking the model selects the part under the pointer', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    await toggle(page, 'labels');                                      // click the model itself, not a label
    const mons = await screenOf(page, 'mons');
    await page.mouse.click(mons.x, mons.y);
    await expect(inspectorTitle(page)).toHaveText('Mons pubis');
    await page.locator('#views [data-view="clitoris"]').click();
    await settle(page);
    const crus = await screenOf(page, 'crura');
    const picked = await page.evaluate(({ x, y }) => window.wootenManual.pick(x, y), crus);
    expect(picked).toBe('crura');
  });

  test('hovering shows the part name', async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await open(page);
    await toggle(page, 'labels');
    const mons = await screenOf(page, 'mons');
    await page.mouse.move(mons.x - 4, mons.y);
    await page.mouse.move(mons.x, mons.y);
    await expect(page.locator('#tip')).toHaveText('Mons pubis');
  });

  test('choosing an internal part isolates it: it stays solid and everything else fades', async ({ page }) => {
    await open(page, 'front');
    await page.locator('#partsBtn').click();
    await page.locator('#drawer [data-part="uterus"]').click();
    const showAll = isPhone(page) ? page.locator('#inspector [data-show-all]') : page.locator('#isolateChip');   // phones keep Show all in the details sheet
    await expect(showAll).toBeVisible();
    const opacities = await page.evaluate(() => { const m = window.wootenManual; return { uterus: m.opacityOf('uterus'), skin: m.opacityOf('skin'), bladder: m.opacityOf('bladder') }; });
    expect(opacities.uterus).toBe(1);
    expect(opacities.skin).toBeLessThan(0.1);
    expect(opacities.bladder).toBeLessThan(0.2);
    await showAll.click();
    await expect(showAll).toBeHidden();
    expect(await page.evaluate(() => window.wootenManual.opacityOf('skin'))).toBe(1);
  });

  test('the inspector closes and reopens on the next selection', async ({ page }) => {
    await open(page, 'front');
    await page.locator('#labels .tag', { hasText: 'Clitoral glans' }).click();
    await page.locator('#inspector [data-close]').click();
    await expect(page.locator('#inspector')).toBeHidden();
    await page.locator('#labels .tag', { hasText: 'Clitoral glans' }).click();
    await expect(page.locator('#inspector')).toBeVisible();
    await expect(inspectorTitle(page)).toHaveText('Clitoral glans');
  });
});

test.describe('parts list', () => {
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 480_000 });   // 33 parts; phones reopen the list sheet for each
  test('every part in the parts list opens its details', async ({ page }) => {
    await open(page);
    await page.locator('#partsBtn').click();
    await expect(page.locator('#drawer')).toBeVisible();
    const parts = await page.evaluate(() => [...document.querySelectorAll('#drawer .part-list button')].map((b, k) => ({ id: b.dataset.part, name: b.childNodes[1].textContent, number: b.firstChild.textContent, k })));
    expect(parts.length).toBe(await page.evaluate(() => window.wootenManual.TOUR.length));
    for (const { id, name } of parts) {
      if (!(await page.locator('#drawer').isVisible())) await page.locator('#partsBtn').click();   // phones swap the list for the details sheet
      await page.locator(`#drawer [data-part="${id}"]`).click();
      await expect(inspectorTitle(page)).toHaveText(name);
      await expect(page.locator(`#drawer [data-part="${id}"]`)).toHaveAttribute('aria-current', 'true');
    }
    /* every number in the list matches the number on that part's callout */
    for (const { id, number } of parts.slice(0, 5)) expect(await page.evaluate(part => window.wootenManual.tagNumber(part), id)).toBe(number);
  });

});

test.describe('controls', () => {
  test('view buttons switch views', async ({ page }) => {
    await open(page);
    for (const view of ['clitoris', 'pee', 'inside', 'front']) {
      await page.locator(`#views [data-view="${view}"]`).click();
      await expect(page.locator(`#views [data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.wootenManual.state.view)).toBe(view);
    }
    await page.locator('#views [data-view="pee"]').click();
    expect(await page.evaluate(() => window.wootenManual.state.cut)).toBe(true);   // the side view is the cut view
  });

  test('colour and layer toggles change the model', async ({ page }) => {
    await open(page);
    await toggle(page, 'coded');
    expect(await page.evaluate(() => window.wootenManual.state.coded)).toBe(true);
    await page.locator('#partsBtn').click();
    await page.locator('#layers [data-layer="bones"]').click();
    await expect(page.locator('#layers [data-layer="bones"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.wootenManual.state.layers.bones)).toBe(false);
  });

  test('arousal slider reports the phase and vaginal length', async ({ page }) => {
    await open(page);
    await openDock(page);
    await page.locator('#arousal').fill('100');
    await expect(page.locator('#arousalOut')).toHaveText('Late plateau · vagina 10.6 cm');
    await page.locator('#arousal').fill('50');
    await expect(page.locator('#arousalOut')).toHaveText('Plateau · vagina 9.3 cm');
  });

  test('the orgasm sequence runs and resets', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await openDock(page);
    await page.locator('#orgasmBtn').click();
    await expect(page.locator('#orgasmBtn')).toBeDisabled();
    await expect(page.locator('#arousalOut')).toHaveText(/Contraction \d+ \/ 10/, { timeout: 15_000 });
    await expect(page.locator('#arousalOut')).toHaveText('Baseline · vagina 8.0 cm', { timeout: 30_000 });
    await expect(page.locator('#orgasmBtn')).toBeEnabled();
  });

  test('X-ray and skin tone controls update state', async ({ page }) => {
    await open(page, 'front');
    await openDock(page);
    await expect(page.locator('#xray')).toBeHidden();                 // the strength slider only shows while X-ray is on
    await page.locator('#xraySwitch').click();
    await expect(page.locator('#xraySwitch')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#xray').fill('100');
    expect(await page.evaluate(() => window.wootenManual.state.xray)).toBe(1);
    await page.locator('#partsBtn').click();
    await page.locator('#tones button').nth(2).click();
    await expect(page.locator('#tones button').nth(2)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('guided tour', () => {
  // camera flights are instant under reduced motion; software-rendered browsers would otherwise spend minutes animating 28 stops
  test.use({ reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 240_000 });
  test('steps through every part with Next and Back, then ends', async ({ page }) => {
    await open(page);
    const tour = await page.evaluate(() => window.wootenManual.TOUR.map(([id]) => id));
    const names = await page.evaluate(ids => ids.map(id => document.querySelector(`#drawer [data-part="${id}"]`).childNodes[1].textContent), tour);
    await page.locator('#tourBtn').click();
    const total = tour.length;
    await expect(page.locator('#tourCount')).toHaveText(`Tour 1 of ${total}`);
    await expect(inspectorTitle(page)).toHaveText(names[0]);
    await page.locator('[data-tour="play"]').click();                  // pause so the timer can't race the clicks
    for (let k = 1; k < tour.length; k++) {
      await page.locator('[data-tour="next"]').click();
      await expect(page.locator('#tourCount')).toHaveText(`Tour ${k + 1} of ${total}`);
      await expect(inspectorTitle(page)).toHaveText(names[k]);
    }
    await expect(page.locator('[data-tour="next"]')).toBeDisabled();
    await page.locator('[data-tour="prev"]').click();
    await expect(page.locator('#tourCount')).toHaveText(`Tour ${total - 1} of ${total}`);
    await page.locator('[data-tour="stop"]').click();
    await expect(page.locator('#tourCount')).toHaveCount(0);
    await expect(page.locator('#tourBtn')).toHaveText('Guided tour');
  });

  test('plays on its own', async ({ page }) => {
    await open(page);
    await page.locator('#tourBtn').click();
    await page.evaluate(() => window.wootenManual.frame(performance.now() + 7_500));
    await expect(page.locator('#tourCount')).toHaveText(/^Tour 2 of \d+$/);
  });

  test('every tour stop is on screen', async ({ page }) => {
    await open(page);
    await page.locator('#tourBtn').click();
    await page.locator('[data-tour="play"]').click();
    const viewport = page.viewportSize();
    const total = await page.evaluate(() => window.wootenManual.TOUR.length);
    for (let k = 0; k < total; k++) {
      await settle(page);
      const id = await page.evaluate(() => window.wootenManual.state.selected);
      const point = await screenOf(page, id);
      expect(point.inFront, id).toBe(true);
      expect(point.x, id).toBeGreaterThan(0); expect(point.x, id).toBeLessThan(viewport.width);
      if (k < total - 1) await page.locator('[data-tour="next"]').click();
    }
  });
});

test.describe('manual and layout', () => {
  test('pee route buttons jump to the right part and view', async ({ page }) => {
    await open(page);
    await page.locator('.route [data-select="bladder"]').click();
    await expect(inspectorTitle(page)).toHaveText('Bladder');
    expect(await page.evaluate(() => window.wootenManual.state.view)).toBe('pee');
    await expect(page.locator('#isolateChip')).toContainText('Bladder');
    await page.locator('.route [data-select="meatus"]').click();
    await expect(inspectorTitle(page)).toHaveText('Urethral opening');
  });

  test('the model gets most of the screen and nothing scrolls sideways', async ({ page }) => {
    await open(page);
    const stage = await page.locator('#stage').boundingBox();
    const viewport = page.viewportSize();
    expect(stage.width * stage.height).toBeGreaterThan(0.4 * viewport.width * viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });

  test('on phones the model fills the screen and details open in a sheet over it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'phone layout');
    await open(page, 'front');
    const viewport = page.viewportSize();
    const stage = await page.locator('#stage').boundingBox();
    expect(stage.height).toBeGreaterThan(0.9 * viewport.height);
    await expect(page.locator('#inspector')).toBeHidden();          // nothing chosen yet: the model has the whole screen
    await page.locator('#labels .tag', { hasText: 'Clitoral glans' }).click();
    const sheet = await page.locator('#inspector').boundingBox();
    const toolbar = await page.locator('.rail').boundingBox();
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(toolbar.y);          // sits above the tool bar, which stays reachable
    expect(sheet.y).toBeGreaterThan(viewport.height * 0.4);                 // opens low, so the part stays in view
    await expect(inspectorTitle(page)).toBeVisible();
  });
});

test.describe('anatomy', () => {
  // Published ranges the model is sized to (cm, degrees). Sources: Longhurst et al. 2023 (clitoris meta-analysis),
  // Lloyd et al. 2005 (vulval and vaginal ranges), MRI and ultrasound studies of uterine version and flexion.
  const RANGES = {
    glansLength: [0.5, 0.8], glansWidth: [0.4, 0.65],                 // avg 6.4 × 5.1 mm
    clitBodyLength: [2.0, 3.0],                                      // avg 25 mm
    crusLength: [4.5, 6.0], bulbLength: [4.5, 6.0],                  // avg 52 mm each
    glansToMeatus: [1.6, 4.5],                                       // avg 22 mm, range 16–45
    glansToIntroitus: [3.5, 5.0],                                    // avg 43 mm
    glansToAnus: [6.5, 8.5],                                         // avg 76 mm
    minoraLength: [2, 10], minoraWidth: [0.7, 5], majoraLength: [7, 12], perineumLength: [1.5, 5.5],
    vaginaLength: [6.5, 12.5],
    // Barnhart et al. 2006 (MRI, 28 women): mean width 26.2 mm at the entrance, 27.8 at the pelvic floor, 32.5 at the top
    vaginaEntranceWidth: [2.3, 2.9], vaginaMidWidth: [2.5, 3.1], vaginaMaxWidth: [2.9, 3.6],
    vaginaWall: [0.35, 0.45],                                        // 3.5–4.3 mm muscular wall (MRI, ultrasound)
    vaginaMidDepth: [0.7, 1.1],                                      // collapsed: two walls with almost no space between
    vaginaLumenDepth: [0, 0.15],
    vaginaHShape: [3, 20],                                           // the side grooves are several times taller than the crossbar
    vaginaBend: [125, 160],                                          // lower third steep, upper two-thirds angled back
    urethraLength: [3, 5], cervixLength: [2.5, 3.5],
    uterusLength: [7, 8.5], uterusWidth: [4.5, 5.5], uterusDepth: [2.5, 3.5],
    versionAngle: [70, 90],                                          // between the cervical and upper vaginal axes
    flexionAngle: [140, 180],                                        // body to cervix, measured in front: anteflexed is under 180
    tubeLength: [10, 12], ovaryLength: [2.5, 4], ovaryWidth: [1.5, 2.5], ovaryDepth: [1, 2],
    // how the organs sit against each other, checked against Gray's Anatomy plate 1166 (midline section)
    bladderToVagina: [0.05, 0.5],                                    // the bladder base lies on the front vaginal wall
    retropubicSpace: [0.5, 2.5],                                     // just behind the pubic symphysis
    urethraToVagina: [0, 0.4],                                       // embedded in the front vaginal wall
    rectumToVagina: [0.05, 0.8],                                     // separated only by the rectovaginal septum
    uterusBodyAngle: [35, 65],                                       // the body rises up and forward (~50° in Gray's)
    ovaryHeightVsUterus: [-1.5, 2.5], ovaryFromMidline: [4, 7],      // on the side wall: ~3 cm ovarian ligament from the uterine corner; NIH Visible Human Female 5.3–6.2 cm
    fundusToRectum: [1, 20],
    promontoryToSymphysis: [10.5, 13],
    uterineCavityLength: [6, 8],                                     // uterine sound depth, os to fundus
    uterusIntoBladder: [0, 0],                                       // the uterus rests on the bladder, never inside it                               // obstetric conjugate, ~11–12.5 cm
  };

  test('every measurement falls inside its published range', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const measured = await page.evaluate(() => window.wootenManual.measure());
    for (const [name, [low, high]] of Object.entries(RANGES)) {
      expect(measured[name], name).toBeGreaterThanOrEqual(low);
      expect(measured[name], name).toBeLessThanOrEqual(high);
    }
  });

  test('the outside of the vaginal wall is a smooth oval, not a box', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const { vaginaOuterRoundness } = await page.evaluate(() => window.wootenManual.measure());
    expect(vaginaOuterRoundness).toBeLessThan(0.85);                 // ellipse 0.785, rectangle 1.0
  });

  test('arousal balloons the inner part behind a snug lower third, instead of making a funnel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const { restWidths, arousedWidths } = await page.evaluate(() => window.wootenManual.measure());
    for (let k = 2; k <= 6; k++) expect(Math.abs(arousedWidths[k] - restWidths[k]) / restWidths[k], `lower third at ${k * 5}%`).toBeLessThan(0.15);
    const chamber = arousedWidths.slice(12, 18), widest = Math.max(...arousedWidths);
    expect(widest).toBeGreaterThan(4.0);                             // Masters & Johnson: the inner vagina distends to several cm
    expect(Math.min(...chamber) / widest).toBeGreaterThan(0.85);     // a rounded chamber, not a steady taper
  });

  test('rugae ripple the lining only, so the outside of the wall is smooth', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const { restWidths } = await page.evaluate(() => window.wootenManual.measure());
    for (let k = 3; k <= 12; k++) expect(Math.abs(restWidths[k + 1] - 2 * restWidths[k] + restWidths[k - 1]), `bumpiness at ${k * 5}%`).toBeLessThan(0.05);
  });

  test('the resting vagina is an even tube, not a cone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const { vaginaMidWidth, vaginaMaxWidth } = await page.evaluate(() => window.wootenManual.measure());
    expect(vaginaMaxWidth / vaginaMidWidth).toBeLessThan(1.35);
  });
});

test.describe('bones', () => {
  // The pelvis is the Human Reference Atlas female bony pelvis (Visible Human Female), aligned on the symphysis and promontory.
  test('no organ passes through bone, and the clitoral legs run along the pubic arch', async ({ page }) => {
    await open(page);
    const gaps = await page.evaluate(() => Object.fromEntries(['rectum', 'tubes', 'ovaries', 'uterus', 'bladder', 'vagina', 'bulbs', 'urethra', 'crura']
      .map(id => [id, window.wootenManual.gap(id, 'pelvis')])));
    for (const id of ['rectum', 'tubes', 'ovaries', 'uterus', 'bladder', 'vagina', 'bulbs', 'urethra']) expect(gaps[id], id).toBeGreaterThan(0.3);
    expect(gaps.rectum).toBeLessThan(1.5);     // presacral fat is thin: the rectum lies in the hollow of the sacrum
    expect(gaps.ovaries).toBeLessThan(2);      // the ovary sits in the ovarian fossa on the side wall
    expect(gaps.crura).toBeLessThan(1.5);      // the crura attach along the ischiopubic rami
    expect(gaps.bladder).toBeLessThan(2.5);    // retropubic space
  });

  // Routes from the NIH Human Reference Atlas ligament set: each ligament runs from the uterus or ovary to bone.
  test('the uterine ligaments stay tied to the uterus and the pelvis as the uterus lifts with arousal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'geometry is the same in every browser');
    await open(page);
    const ties = () => page.evaluate(() => ({ uterus: window.wootenManual.gap('ligaments', 'uterus'), ovaries: window.wootenManual.gap('ligaments', 'ovaries'),
      bone: window.wootenManual.gap('ligaments', 'pelvis'), rectum: window.wootenManual.gap('ligaments', 'rectum'), bladder: window.wootenManual.gap('ligaments', 'bladder') }));
    for (const level of ['0', '100']) {
      await openDock(page);
      const renders = await page.evaluate(() => window.wootenManual.renders());
      await page.locator('#arousal').fill(level);
      await page.waitForFunction(before => window.wootenManual.renders() > before, renders);   // the shapes are rebuilt on the next frame
      const gaps = await ties();
      expect(gaps.uterus, `uterus at ${level}%`).toBeLessThan(0.3);
      expect(gaps.ovaries, `ovaries at ${level}%`).toBeLessThan(0.3);
      expect(gaps.bone, `bone at ${level}%`).toBeLessThan(0.6);
      expect(gaps.bladder, `bladder at ${level}%`).toBeGreaterThan(0.2);   // the round ligaments pass over it
      // at rest the uterosacral ligaments pass either side of the rectum; when the uterus lifts, the cervix leans against it
      if (level === '0') expect(gaps.rectum).toBeGreaterThan(0.2);
    }
  });
});

test.describe('cross-section', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the Cross-section button opens a slice that shows an H-shaped, front-to-back flattened vagina', async ({ page }) => {
    await open(page);
    await page.locator('#sectionBtn').click();
    await expect(page.locator('#sectionPanel')).toBeVisible();
    await expect(page.locator('#sectionBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sectionDepth').fill('15');
    const slice = await page.evaluate(() => window.wootenManual.section());
    expect(slice.width).toBeGreaterThan(2 * slice.thickness);        // wide side to side, thin front to back
    expect(slice.lumenThickness).toBeLessThan(0.15);                 // walls touching
    await expect(page.locator('#sectionNote')).toContainText('H-shaped');
    const drawn = await page.evaluate(() => {
      const canvas = document.getElementById('sectionCanvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0; for (let k = 3; k < data.length; k += 4) if (data[k]) painted++;
      return painted / (canvas.width * canvas.height);
    });
    expect(drawn).toBeGreaterThan(0.03);
  });

  test('neighbours are on the right sides: urethra and bladder in front, rectum behind', async ({ page }) => {
    await open(page);
    await page.locator('#sectionBtn').click();
    await page.locator('#sectionDepth').fill('10');
    const low = await page.evaluate(() => window.wootenManual.section());
    expect(low.urethra.v).toBeGreaterThan(0);
    expect(low.rectum.v).toBeLessThan(0);
    await page.locator('#sectionDepth').fill('45');
    const middle = await page.evaluate(() => window.wootenManual.section());
    expect(middle.bladder).toBe(true);
    expect(middle.rectum.v + middle.rectum.radius).toBeLessThanOrEqual(middle.back + 0.05);   // behind the back wall, not inside it
  });

  test('the deepest slice shows the cervix inside the vault, clear of the rectum', async ({ page }) => {
    await open(page);
    await page.locator('#sectionBtn').click();
    await page.locator('#sectionDepth').fill('88');
    const deep = await page.evaluate(() => window.wootenManual.section());
    expect(deep.cervix).toBe(true);
    await expect(page.locator('#sectionNote')).toContainText('cervix');
    expect(deep.rectum.v + deep.rectum.radius).toBeLessThanOrEqual(deep.back + 0.05);   // the rectum's front stays behind the vault
  });

  test('the slice depth readout follows the slider', async ({ page }) => {
    await open(page);
    await page.locator('#sectionBtn').click();
    await page.locator('#sectionDepth').fill('50');
    await expect(page.locator('#sectionDepthOut')).toHaveText('4.0 cm in');
  });
});
