// Makes the site's sound: the voice (site/body/narration.mjs) with Google Cloud text-to-speech, and the music with
// ElevenLabs. Writes site/body/audio/<name>.mp3 and audio/manifest.json, which lists what the app can play.
// The voice needs gcloud signed in and a project with the Text-to-Speech API on; the music needs an ElevenLabs API key
// in the environment as ELEVENLABS_API_KEY. A clip whose text has not changed is not made again; the music is made once.
// Usage: node scripts/body/make-audio.mjs <google project> [music]     ("music" makes the music again)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NARRATION, VOICE, MUSIC } from '../../site/body/narration.mjs';
import { REGIONS, ALL } from '../../site/body/closeups.mjs';
import { TOUR } from '../../site/body/parts.mjs';

const [project, again] = process.argv.slice(2);
if (!project) throw new Error('usage: node scripts/body/make-audio.mjs <google project> [music]');
const folder = new URL('../../site/body/audio/', import.meta.url);
mkdirSync(folder, { recursive: true });
const manifestFile = new URL('manifest.json', folder);
const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { narration: {} };
const manifest = { voice: VOICE.name, music: previous.music || null, narration: {} };

/* what is to be said: what is written for the ear, then every other part of a close-up or of the main tour, from its note */
const lines = { ...NARRATION };
for (const key of [...Object.values(REGIONS).flatMap(region => region.parts), ...TOUR.map(([key]) => key)]) lines[`entry:${key}`] ||= `${ALL[key].name}. ${ALL[key].what} ${ALL[key].does}`;

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
async function say([key, text]) {
  const hash = createHash('sha256').update(`${VOICE.name}|${text}`).digest('hex').slice(0, 10);
  const file = `${key.replace(/[^a-zA-Z0-9]+/g, '-')}.mp3`, was = previous.narration[key];
  if (was?.hash === hash && existsSync(new URL(was.file, folder))) { manifest.narration[key] = was; return; }
  /* the service is sometimes busy for a moment (429, 5xx): ask again a few times, waiting longer each time */
  let response;
  for (let attempt = 1; ; attempt++) {
    response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text }, voice: VOICE, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.96 } }),
    });
    if (response.ok) break;
    if (attempt === 6 || (response.status !== 429 && response.status < 500)) throw new Error(`text-to-speech for ${key}: ${response.status} ${await response.text()}`);
    await new Promise(done => setTimeout(done, 2000 * attempt));
  }
  const audio = Buffer.from((await response.json()).audioContent, 'base64');
  writeFileSync(new URL(file, folder), audio);
  manifest.narration[key] = { file, hash };
  console.log(`voice: ${key} (${(audio.length / 1024).toFixed(0)} KB)`);
}
/* four at a time; the manifest lists them in the order they are written here, whatever order they finish in */
const waiting = Object.entries(lines);
for (const [key] of waiting) manifest.narration[key] = null;
await Promise.all(Array.from({ length: 4 }, async () => { while (waiting.length) await say(waiting.shift()); }));

const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
if (!manifest.music || again === 'music') {
  if (!elevenLabsKey) console.log('music: not made, ELEVENLABS_API_KEY is not set');
  else {
    const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': elevenLabsKey, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: MUSIC.prompt, music_length_ms: MUSIC.seconds * 1000 }),
    });
    if (!response.ok) throw new Error(`ElevenLabs music: ${response.status} ${await response.text()}`);
    const audio = Buffer.from(await response.arrayBuffer());
    writeFileSync(new URL('music.mp3', folder), audio);
    manifest.music = 'music.mp3';
    console.log(`music: made (${(audio.length / 1024).toFixed(0)} KB)`);
  }
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
console.log(`audio/manifest.json: ${Object.keys(manifest.narration).length} voice clips, music ${manifest.music ? 'yes' : 'no'}`);
