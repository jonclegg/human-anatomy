import { test, expect } from '@playwright/test';

/* What people do on the site, start to finish, the way they do it: taps on a phone (touch), clicks on a desktop. After
   every step the same rules hold: no errors, nothing scrolls sideways, every control in the bar is on the screen, and
   the sheet shows exactly when it should (always on a desktop; on a phone only for a region or a part, never in a story,
   and not after its X until something else is opened). */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { this.muted = true; return play.call(this); };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (to, ...rest) { return to instanceof AudioDestinationNode ? to : connect.call(this, to, ...rest); };
  });
});

const model = (page, script, arg) => page.evaluate(script, arg);
const settle = page => page.waitForFunction(() => !window.bodyModel.busy(), null, { timeout: 30_000 });
const touch = () => !!test.info().project.use.hasTouch;
const isPhone = page => page.viewportSize().width <= 820;
const place = page => model(page, () => { const { region, selection, story, contents } = window.bodyModel.state; return { region, entry: selection?.entry ?? null, story: story ? story.kind : null, contents }; });

async function open(page, query = 'sex=female') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/?${query}`);
  await page.waitForSelector('html[data-model-ready="true"]', { timeout: 60_000 });
  await model(page, () => window.bodyModel.ready());
  await settle(page);
  return errors;
}
/* a tap on a phone, a click on a desktop */
async function press(page, locator) {
  if (touch(page)) await locator.tap(); else await locator.click();
  await settle(page);
}
/* a tap or click on the model itself, on one of an entry's parts where it shows */
async function pressPart(page, key) {
  const point = await model(page, key => {   // anywhere on the canvas the entry shows, not hidden under a label or a panel
    const body = window.bodyModel.body(), want = body.order.indexOf(key) >= 0 ? body.keys.indexOf(key) : -1, rect = document.getElementById('scene').getBoundingClientRect();
    for (let y = rect.top + 20; y < rect.bottom - 20; y += 12) for (let x = rect.left + 20; x < rect.right - 20; x += 12) {
      const index = window.bodyModel.pick(x, y), over = document.elementFromPoint(x, y);
      if (index >= 0 && body.entryOf[index] === want && over?.id === 'scene') return { x, y };
    }
    return null;
  }, key);
  expect(point, `${key} can be picked on screen`).toBeTruthy();
  if (touch(page)) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await settle(page);
}
/* a label on the model: the one for the first numbered part that has one showing */
async function shownLabel(page) {
  const tag = page.locator('#labels .tag:not([hidden])').first();
  await expect(tag).toBeVisible();
  return tag;
}
/* the rules that hold after every step */
async function holds(page, errors, step) {
  const seen = await model(page, () => {
    const sheet = document.getElementById('sheet'), width = innerWidth;
    const bar = ['#homeBtn', '#find', '#sexSwitch', '#soundBtn', '#labelsBtn', '#contentsBtn'].map(selector => document.querySelector(selector).getBoundingClientRect());
    return {
      sideways: document.documentElement.scrollWidth > width + 0.5,
      barOff: bar.some(rect => rect.left < -0.5 || rect.right > width + 0.5),
      sheetShown: getComputedStyle(sheet).display !== 'none' && sheet.getBoundingClientRect().height > 0,
    };
  });
  const { region, entry, story } = await place(page);
  const closed = await model(page, () => window.bodyModel.state.sheetClosed);
  const wanted = !isPhone(page) || (!story && !closed && !!(region || entry));
  expect(seen.sideways, `${step}: nothing scrolls sideways`).toBe(false);
  expect(seen.barOff, `${step}: the bar is on the screen`).toBe(false);
  expect(seen.sheetShown, `${step}: the sheet ${wanted ? 'shows' : 'is away'}`).toBe(wanted);
  expect(errors, step).toEqual([]);
}

test.describe('workflows', () => {
  test('a region from its point on the body, a part from its label, Next and Previous, and back up to the whole body', async ({ page }) => {
    const errors = await open(page);
    await holds(page, errors, 'home');
    await press(page, page.locator('.spot', { hasText: /^Foot$/ }));
    expect(await place(page)).toMatchObject({ region: 'foot', entry: null });
    await holds(page, errors, 'the foot');
    const tag = await shownLabel(page), name = (await tag.textContent()).replace(/^\d+/, '');
    await press(page, tag);
    expect((await place(page)).entry, 'a label opens its part').not.toBeNull();
    await expect(page.locator('#sheetTitle')).toContainText(name.slice(0, 4));
    await holds(page, errors, 'a part from its label');
    const first = (await place(page)).entry;
    await press(page, page.locator('#sheet [data-step="1"]'));
    expect((await place(page)).entry).not.toBe(first);
    await holds(page, errors, 'Next');
    await press(page, page.locator('#sheet [data-step="-1"]'));
    expect((await place(page)).entry).toBe(first);
    await press(page, page.locator('#sheet .back'));
    expect(await place(page)).toMatchObject({ region: 'foot', entry: null });
    await holds(page, errors, 'back to the region');
    await press(page, page.locator('#sheet .back'));
    expect(await place(page)).toMatchObject({ region: null, entry: null });
    await holds(page, errors, 'back home');
  });

  test('on a phone: the X puts the sheet away, and a label, the model, the search or the region again each bring it back', async ({ page }) => {
    test.skip(!isPhone(page), 'the phone sheet');
    const errors = await open(page);
    await press(page, page.locator('.spot', { hasText: /^Foot$/ }));
    const close = async step => { await press(page, page.locator('#sheet .sheet-close')); await holds(page, errors, step); await expect(page.locator('#sheet')).toBeHidden(); };
    await close('the foot, put away');
    /* a label on the model */
    await press(page, await shownLabel(page));
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'a label after the X');
    /* the same part again, by its label */
    const entry = (await place(page)).entry;
    await close('the part, put away');
    await press(page, page.locator(`#labels .tag:not([hidden])`).first());
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'the same label again');
    /* the model itself */
    await close('put away again');
    await pressPart(page, entry);
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'the model after the X');
    /* the search */
    await close('put away for the search');
    await press(page, page.locator('#find'));
    await page.locator('#find').fill('talus');
    await press(page, page.locator('#found li').first());
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'the search after the X');
    /* the region again, from Contents */
    await press(page, page.locator('#sheet .back'));
    await close('the region, put away');
    await press(page, page.locator('#contentsBtn'));
    await press(page, page.locator('#contents [data-region="foot"]'));
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'the region again from Contents');
  });

  test('on a phone: the sheet dragged taller stays so from part to part, and dragged down it goes away', async ({ page }) => {
    test.skip(!isPhone(page), 'the phone sheet');
    const errors = await open(page);
    await press(page, page.locator('.spot', { hasText: /^Heart$/ }));
    const height = () => page.locator('#sheet').evaluate(el => el.getBoundingClientRect().height);
    const drag = async by => {   // by the mouse: a touch drag cannot be driven here, and the sheet takes either pointer the same way
      const box = await page.locator('#sheet .sheet-handle').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + by / 2, { steps: 4 }); await page.mouse.move(x, y + by, { steps: 4 }); await page.mouse.up();
      await settle(page);
    };
    const before = await height();
    await drag(-200);
    const raised = await height();
    expect(raised).toBeGreaterThan(before + 150);
    await holds(page, errors, 'dragged taller');
    await press(page, await shownLabel(page));
    expect(Math.abs(await height() - raised)).toBeLessThan(2);
    await holds(page, errors, 'a part keeps the height');
    await drag(900);
    await expect(page.locator('#sheet')).toBeHidden();
    await holds(page, errors, 'dragged away');
    await press(page, await shownLabel(page));
    await expect(page.locator('#sheet')).toBeVisible();
    await holds(page, errors, 'back for the next part');
  });

  test('the layers at home: each layer by its name, a part picked out of it, and back to that layer', async ({ page }) => {
    const errors = await open(page);
    for (const view of ['muscles', 'organs', 'skeleton']) {
      await press(page, page.locator(`#views [data-view="${view}"]`));
      await holds(page, errors, `the ${view}`);
      await press(page, await shownLabel(page));
      expect((await place(page)).entry, `a label on the ${view}`).not.toBeNull();
      await holds(page, errors, `a part of the ${view}`);
      await press(page, page.locator('#sheet .back'));
      expect(await place(page)).toMatchObject({ region: null, entry: null });
      await expect(page.locator(`#views [data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      await holds(page, errors, `back to the ${view}`);
    }
  });

  test('a guide: started from a region, stepped, paused, and left, back where it started', async ({ page }) => {
    const errors = await open(page);
    await press(page, page.locator('.spot', { hasText: /^Heart$/ }));
    await press(page, page.locator('#sheet [data-watch="heart"]'));
    expect(await place(page)).toMatchObject({ region: 'heart', story: 'steps' });
    await holds(page, errors, 'the guide');
    await press(page, page.locator('#transport [data-story="next"]'));
    await expect(page.locator('#storyCount')).toHaveText(/^2 \//);
    await press(page, page.locator('#transport [data-story="play"]'));
    await expect(page.locator('#transport [data-story="play"]')).toHaveText('Play');
    await holds(page, errors, 'paused');
    await press(page, page.locator('#transport [data-story="exit"]'));
    expect(await place(page)).toMatchObject({ region: 'heart', story: null });
    await holds(page, errors, 'left the guide');
    if (isPhone(page)) await expect(page.locator('#sheet')).toBeVisible();
  });

  test('Contents: the tour, a region, and closing it again; the title goes home from anywhere', async ({ page }) => {
    const errors = await open(page);
    await press(page, page.locator('#contentsBtn'));
    await expect(page.locator('#contents')).toBeVisible();
    await press(page, page.locator('#contents [data-watch=""]'));
    expect(await place(page)).toMatchObject({ story: 'tour', contents: false });
    await holds(page, errors, 'the tour');
    await press(page, page.locator('#homeBtn'));
    expect(await place(page)).toMatchObject({ region: null, entry: null, story: null });
    await holds(page, errors, 'home from the tour');
    await press(page, page.locator('#contentsBtn'));
    await press(page, page.locator('#contents [data-region="knee"]'));
    expect(await place(page)).toMatchObject({ region: 'knee' });
    await holds(page, errors, 'the knee from Contents');
    await press(page, page.locator('#contentsBtn'));
    await press(page, page.locator('#contentsBtn'));   // Close
    expect(await place(page)).toMatchObject({ region: 'knee', contents: false });
    await holds(page, errors, 'Contents closed again');
    await press(page, page.locator('#homeBtn'));
    await holds(page, errors, 'home');
  });

  test('the body switched in a region and on a part, the labels off and on, and the sound on and off', async ({ page }) => {
    const errors = await open(page);
    await press(page, page.locator('.spot', { hasText: /^Heart$/ }));
    await press(page, await shownLabel(page));
    await press(page, page.locator('#sexSwitch [data-sex="male"]'));
    await page.waitForFunction(() => window.bodyModel.body().sex === 'male');
    await settle(page);
    await holds(page, errors, 'switched to him on a part');
    await press(page, page.locator('#labelsBtn'));
    await expect(page.locator('#labels .tag:not([hidden])')).toHaveCount(0);
    await press(page, page.locator('#labelsBtn'));
    await expect(page.locator('#labels .tag:not([hidden])').first()).toBeVisible();
    await press(page, page.locator('#soundBtn'));
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'true');
    await press(page, page.locator('#soundBtn'));
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'false');
    await holds(page, errors, 'labels and sound');
    await press(page, page.locator('#sexSwitch [data-sex="female"]'));
    await page.waitForFunction(() => window.bodyModel.body().sex === 'female');
    await settle(page);
    await holds(page, errors, 'back to her');
  });

  test('the search: a part, a region and a story, each from the box, and Escape clears it', async ({ page }) => {
    const errors = await open(page);
    for (const [query, check] of [['patella', place => !!place.entry], ['heart', place => !!place.region], ['how you swallow', place => !!place.story]]) {
      await press(page, page.locator('#find'));
      await page.locator('#find').fill(query);
      await press(page, page.locator('#found li').first());
      expect(check(await place(page)), query).toBe(true);
      await holds(page, errors, `searched ${query}`);
      if ((await place(page)).story) await press(page, page.locator('#transport [data-story="exit"]'));
    }
    await press(page, page.locator('#find'));
    await page.locator('#find').fill('kidney');
    await expect(page.locator('#found')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#found')).toBeHidden();
    await expect(page.locator('#find')).toHaveValue('');
    await holds(page, errors, 'search cleared');
  });
});
