// Builds design-review/report.html: each reviewer's score per round, what changed, and screenshots.
// Usage: node scripts/review-report.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../design-review/', import.meta.url));
const notes = JSON.parse(readFileSync(`${root}notes.json`, 'utf8'));
const rounds = readdirSync(root).filter(name => /^round-\d+$/.test(name) && existsSync(`${root}${name}/reviews.json`))
  .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
  .map(name => ({ name, ...JSON.parse(readFileSync(`${root}${name}/reviews.json`, 'utf8')) }));
const REVIEWERS = [['google/gemini-4-argon', 'Gemini 4 Argon'], ['~openai/gpt-astra-latest', 'GPT Astra'], ['anthropic/claude-opus-5.5', 'Claude Opus 5.5']];
const SELF = JSON.parse(readFileSync(`${root}self-scores.json`, 'utf8'));
const scoreOf = (round, model) => round.results.find(r => r.model === model)?.score;
const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const latest = rounds.at(-1);
const latestScores = REVIEWERS.map(([model]) => scoreOf(latest, model));
const lowest = Math.min(...latestScores, SELF[latest.name] ?? 10);

/* chart: one line per reviewer, rounds on x, score 3–10 on y */
const W = 640, H = 240, left = 34, right = 14, top = 14, bottom = 28;
const x = k => left + (rounds.length === 1 ? 0 : k * (W - left - right) / (rounds.length - 1));
const y = v => top + (10 - v) / 7 * (H - top - bottom);
const COLORS = ['var(--gemini)', 'var(--gpt)', 'var(--claude)', 'var(--self)'];
const series = [...REVIEWERS.map(([model, label]) => [label, rounds.map(r => scoreOf(r, model))]), ['My self-review', rounds.map(r => SELF[r.name])]];
const chart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores by round">
  ${[4, 6, 8, 9, 10].map(v => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="${v === 9 ? 'goal' : 'grid'}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
  <text x="${W - right}" y="${y(9) - 6}" text-anchor="end" class="goal-label">target 9</text>
  ${rounds.map((r, k) => `<text x="${x(k)}" y="${H - 8}" text-anchor="middle">${k}</text>`).join('')}
  ${series.map(([label, values], s) => {
    const points = values.map((v, k) => v == null ? null : [x(k), y(v)]).filter(Boolean);
    return `<polyline fill="none" stroke="${COLORS[s]}" stroke-width="2.2" points="${points.map(p => p.join(',')).join(' ')}"/>` +
      points.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3.6" fill="${COLORS[s]}"/>`).join('');
  }).join('')}
</svg>`;

const rows = rounds.map((r, k) => `<tr><td class="round">${k}</td>${REVIEWERS.map(([model]) => {
  const v = scoreOf(r, model); return `<td class="num ${v >= 9 ? 'pass' : ''}">${v ?? '–'}</td>`; }).join('')}<td class="num ${SELF[r.name] >= 9 ? 'pass' : ''}">${SELF[r.name] ?? '–'}</td><td class="num">$${(r.spentTotal ?? 0).toFixed(2)}</td><td class="note">${escape(notes[r.name] || '')}</td></tr>`).join('');

const roundCards = [...rounds].reverse().map(r => {
  const k = Number(r.name.split('-')[1]);
  return `<section class="round-card">
    <h3>Round ${k}</h3>
    <p>${escape(notes[r.name] || '')}</p>
    <div class="shots">
      <figure><img src="${r.name}/desktop-first-load.jpg" alt="Desktop, round ${k}" loading="lazy"><figcaption>Desktop</figcaption></figure>
      <figure><img src="${r.name}/desktop-side-view.jpg" alt="Desktop side view, round ${k}" loading="lazy"><figcaption>Side cut</figcaption></figure>
      <figure class="phone"><img src="${r.name}/phone-part-selected.jpg" alt="Phone, round ${k}" loading="lazy"><figcaption>Phone</figcaption></figure>
    </div>
    <div class="critiques">${r.results.filter(x => !x.error).map(x => `<div><b>${escape(REVIEWERS.find(([m]) => m === x.model)?.[1] ?? x.model)} · ${x.score}</b><ul>${x.topFixes.slice(0, 3).map(f => `<li>${escape(f)}</li>`).join('')}</ul></div>`).join('')}</div>
  </section>`;
}).join('');

writeFileSync(`${root}report.html`, `<title>Vagina Manual Design Review</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap">
<style>
/* Layout: a single reading column; summary and chart first, then each round newest first. */
:root { --bg: #eef0f1; --surface: #ffffff; --ink: #121517; --muted: #5b6369; --line: #d5dade; --mark: #ffd400;
  --gemini: #2f6fd6; --gpt: #11946b; --claude: #c4572a; --self: #6b6f74;
  --face: "Archivo", "Helvetica Neue", Arial, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #121416; --surface: #1b1e21; --ink: #eef0f1; --muted: #9aa3aa; --line: #2c3136; --gemini: #6b9cf0; --gpt: #3fc497; --claude: #e58a5f; --self: #a3a8ad; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #121416; --surface: #1b1e21; --ink: #eef0f1; --muted: #9aa3aa; --line: #2c3136; --gemini: #6b9cf0; --gpt: #3fc497; --claude: #e58a5f; --self: #a3a8ad; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font-family: var(--face); font-size: 15px; line-height: 1.5; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 980px; margin: 0 auto; padding-block: 40px 64px; display: grid; gap: 36px; }
h1 { font-size: clamp(30px, 5vw, 48px); font-weight: 800; font-stretch: 112%; line-height: 1; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
h2 { font-size: 20px; font-weight: 700; font-stretch: 108%; margin: 0 0 12px; }
h3 { font-size: 18px; font-weight: 700; margin: 0; }
p { margin: 0; max-width: 68ch; }
.status { display: grid; gap: 10px; }
.status .verdict { font-size: 18px; }
.status mark { background: var(--mark); color: #121517; padding: 0 4px; }
.meta { color: var(--muted); font-size: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px; min-width: 0; }
svg { width: 100%; height: auto; display: block; }
svg text { fill: var(--muted); font: 12px var(--face); }
svg .grid { stroke: var(--line); }
svg .goal { stroke: var(--ink); stroke-dasharray: 4 4; }
svg .goal-label { fill: var(--ink); font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13.5px; margin-top: 10px; }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 6px; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12.5px; color: var(--muted); font-weight: 600; }
.num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; font-weight: 600; }
.pass { background: var(--mark); color: #121517; }
.round { font-weight: 700; }
.note { color: var(--muted); min-width: 260px; }
.rounds { display: grid; gap: 20px; }
.round-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px; display: grid; gap: 12px; min-width: 0; }
.shots { display: grid; grid-template-columns: 1fr 1fr 0.42fr; gap: 10px; align-items: start; }
.shots figure { margin: 0; display: grid; gap: 4px; }
.shots img { width: 100%; border-radius: 6px; border: 1px solid var(--line); display: block; }
figcaption { font-size: 12.5px; color: var(--muted); }
.critiques { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; font-size: 13.5px; }
.critiques ul { margin: 4px 0 0; padding-left: 18px; color: var(--muted); display: grid; gap: 4px; }
@media (max-width: 640px) { .shots { grid-template-columns: 1fr 1fr; } .shots .phone { grid-column: span 2; max-width: 200px; } }
</style>
<main>
  <header class="status">
    <h1>Vagina Manual design review</h1>
    <p class="verdict">Round ${rounds.length - 1}: lowest score <mark>${lowest}</mark> out of 10. Target: every reviewer at 9 or above.</p>
    <p class="meta">Each round, three models score six screenshots of the page (desktop and iPhone) against benchmark sites: Apple AirPods Pro, Linear, NASA Eyes, BioDigital Human, Stripe, Lusion, igloo.inc and Neal.fun. OpenRouter spend so far: $${(latest.spentTotal ?? 0).toFixed(2)} of a $100 cap.</p>
  </header>
  <section class="panel">
    <h2>Scores by round</h2>
    ${chart}
    <div class="legend">${series.map(([label], s) => `<span style="--c:${COLORS[s]}">${label}</span>`).join('')}</div>
  </section>
  <section class="panel">
    <h2>Every round</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Round</th>${REVIEWERS.map(([, label]) => `<th class="num">${label}</th>`).join('')}<th class="num">Self</th><th class="num">Spent</th><th>What changed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>
  <section class="rounds">
    <h2>Rounds, newest first</h2>
    ${roundCards}
  </section>
</main>
`);
console.log(`report: ${rounds.length} rounds, lowest latest score ${lowest}`);
