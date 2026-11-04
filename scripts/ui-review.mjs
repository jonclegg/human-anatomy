// Screenshots the page in several states and asks outside models to score its UI design against benchmark sites.
// Usage: node scripts/ui-review.mjs <round-name> [url]   (default url: the local test server)
// Needs OPENROUTER_API_KEY in the environment; the key is never printed.
import { webkit, devices } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const round = process.argv[2] || 'round';
const url = process.argv[3] || 'http://127.0.0.1:4173/';
const root = fileURLToPath(new URL('../design-review/', import.meta.url));
const out = `${root}${round}/`;
mkdirSync(out, { recursive: true });

const REVIEWERS = ['google/gemini-4-argon', '~openai/gpt-astra-latest', 'anthropic/claude-opus-5.5'];

async function capture() {
  const browser = await webkit.launch();
  const shots = [];
  const ready = page => page.waitForSelector('html[data-model-ready="true"]', { timeout: 30_000 }).then(() => page.waitForTimeout(1200));
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(url); await ready(desktop);
  await desktop.screenshot({ path: `${out}desktop-first-load.jpg`, quality: 80 }); shots.push(['Desktop, first load', 'desktop-first-load.jpg']);
  await desktop.evaluate(() => { window.wootenManual.select('glans'); window.wootenManual.focusPart('glans'); });
  await desktop.waitForTimeout(1500);
  await desktop.screenshot({ path: `${out}desktop-part-selected.jpg`, quality: 80 }); shots.push(['Desktop, after clicking the clitoris', 'desktop-part-selected.jpg']);
  await desktop.evaluate(() => { window.wootenManual.select(null); window.wootenManual.setView('pee'); });
  await desktop.waitForTimeout(1800);
  await desktop.screenshot({ path: `${out}desktop-side-view.jpg`, quality: 80 }); shots.push(['Desktop, side cut-away view', 'desktop-side-view.jpg']);
  const phone = await browser.newPage(devices['iPhone 13']);
  await phone.goto(url); await ready(phone);
  await phone.screenshot({ path: `${out}phone-first-load.jpg`, quality: 80 }); shots.push(['iPhone, first load', 'phone-first-load.jpg']);
  await phone.evaluate(() => { window.wootenManual.select('uterus'); window.wootenManual.focusPart('uterus'); });
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: `${out}phone-part-selected.jpg`, quality: 80, fullPage: false }); shots.push(['iPhone, after tapping the uterus', 'phone-part-selected.jpg']);
  await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: `${out}phone-scrolled.jpg`, quality: 80 }); shots.push(['iPhone, scrolled down a third of the page', 'phone-scrolled.jpg']);
  await browser.close();
  return shots;
}

const PROMPT = `You are a demanding senior product designer who judges for Awwwards and has shipped work at Apple and Linear.
Score the UI design of "The Vagina Manual" by Wooten Labs: an interactive 3D anatomy explorer (a little tongue in cheek, aimed at curious men and nerds) that lets people rotate a model, click parts, switch views and read short explanations.

The first two images are BENCHMARKS: screenshots of genuinely excellent sites (Apple AirPods Pro, Linear, NASA Eyes on the Solar System, BioDigital Human, Stripe, Lusion, igloo.inc, Neal.fun), desktop then phone.
The remaining images are the site under review, each captioned.

Scoring scale, relative to the benchmarks: 10 = would sit comfortably among them or beat them; 9 = clearly benchmark-class, only nitpicks left; 7 = competent but obviously a step below; 5 = generic; 3 = poor.
Judge visual design, hierarchy, typography, color, layout, the 3D presentation, mobile layout, how usable and discoverable the controls look, and whether it looks like generic AI-generated "slop" (tells such as glassmorphism pills everywhere, pink-on-dark gradients, monospace uppercase eyebrow labels, rows of toggle chips, generic card panels, emoji, vague copy).
Be specific and harsh; do not inflate. Scores of 9 must be earned.

Reply with JSON only, no markdown fence:
{"score": <number 1-10, one decimal>, "looksLikeAISlop": <true|false>, "slopTells": [<short strings>], "strengths": [<short strings>], "topFixes": [<up to 8 concrete, specific changes, most important first>]}`;

function image(path) {
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(path).toString('base64')}` } };
}

async function review(model, key, shots) {
  const content = [{ type: 'text', text: PROMPT },
    { type: 'text', text: 'BENCHMARK desktop sheet:' }, image(`${root}references/reference-desktop.jpg`),
    { type: 'text', text: 'BENCHMARK phone sheet:' }, image(`${root}references/reference-phone.jpg`)];
  for (const [caption, file] of shots) content.push({ type: 'text', text: `UNDER REVIEW: ${caption}` }, image(`${out}${file}`));
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0.2 }),
  });
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status} ${await response.text()}`);
  const body = await response.json();
  const text = body.choices[0].message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return { model, ...JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) };
}

const shots = await capture();
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('Set OPENROUTER_API_KEY to run the design review');
/* budget: the user capped this design review at $100 of OpenRouter spend; stop at $95 to leave headroom for one round's cost */
const BUDGET_START_USAGE = 392.378, BUDGET_STOP = 95;
const usage = async () => (await (await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } })).json()).data.usage;
const spentBefore = await usage() - BUDGET_START_USAGE;
if (spentBefore >= BUDGET_STOP) throw new Error(`Design-review budget used up: $${spentBefore.toFixed(2)} of $100 spent`);
const results = await Promise.all(REVIEWERS.map(model => review(model, key, shots).catch(error => ({ model, error: error.message }))));
const spentAfter = await usage() - BUDGET_START_USAGE;
writeFileSync(`${out}reviews.json`, JSON.stringify({ round, spentTotal: spentAfter, results }, null, 2));
console.log(`OpenRouter spend on this design review so far: $${spentAfter.toFixed(2)} of $100`);
for (const result of results) {
  if (result.error) { console.log(`\n## ${result.model}: ERROR ${result.error.slice(0, 300)}`); continue; }
  console.log(`\n## ${result.model}: ${result.score}/10, AI slop: ${result.looksLikeAISlop}`);
  console.log('slop tells:', result.slopTells.join(' | '));
  console.log('fixes:\n- ' + result.topFixes.join('\n- '));
}
