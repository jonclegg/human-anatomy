// What the voice says. A key names where it is said: "view:<view>" on a whole-body view, "region:<close-up>" on a
// close-up's opening, "entry:<part>" on a part. scripts/body/make-audio.mjs turns each into audio/<file>.mp3 with
// Google text-to-speech and lists them in audio/manifest.json; the app plays whichever belongs to what is on show.
export const VOICE = { languageCode: 'en-GB', name: 'en-GB-Chirp3-HD-Charon' };
/* the music, made once with ElevenLabs from this description */
export const MUSIC = { prompt: 'Slow, warm ambient music for a science documentary about the human body. Soft sustained synth pads and a gentle felt piano, a very slow pulse like a resting heartbeat, calm and full of wonder. No drums, no vocals, no melody that draws attention. It must loop seamlessly.', seconds: 90 };
export const NARRATION = {
  'view:body': 'This is the human body. Around three thousand named structures, and every one of them is here. Drag the line at the bottom to peel it back, layer by layer: skin, muscle, organs, vessels, nerves, and bone. Or choose one of the glowing points, and step inside.',
  'region:heart': 'The heart. A muscle about the size of your fist, beating around a hundred thousand times a day. It is really two pumps, side by side. Let us follow a single heartbeat through it, in eight stops.',
  'entry:heartRightAtrium': 'Stop one: the right atrium. Blood that has given up its oxygen returns here from the whole body, through the two largest veins you have. And in this wall sits the heart\'s own pacemaker, the small patch of cells where every beat begins.',
  'entry:heartTricuspidValve': 'Stop two: the tricuspid valve. The atrium squeezes, and blood drops through these three thin leaflets into the chamber below. When that chamber squeezes in turn, the leaflets swing shut. That closing is the first half of the sound of a heartbeat.',
  'entry:heartRightVentricle': 'Stop three: the right ventricle. Its only job is to send blood next door, to the lungs. The lungs are easy to fill, so this wall is thin, and it works at about a fifth of the pressure of the other side.',
  'entry:heartPulmonaryValve': 'Stop four: the pulmonary valve. Three small pockets open as the ventricle squeezes, then fill like parachutes to close behind the blood. Beyond them lie the lungs, where the blood picks up oxygen.',
  'entry:heartLeftAtrium': 'Stop five: the left atrium, at the back of the heart. Four veins bring the blood home from the lungs. They are the only veins in the body that carry blood rich in oxygen.',
  'entry:heartMitralValve': 'Stop six: the mitral valve. The only valve with two leaflets, tied down by fine cords so that it cannot blow backwards. It has to hold against the highest pressure in the heart.',
  'entry:heartLeftVentricle': 'Stop seven: the left ventricle. The thickest wall in the heart, because this chamber drives blood to every part of you, from your scalp to your toes. The pulse you feel at your wrist is this muscle contracting.',
  'entry:heartAorticValve': 'Stop eight: the aortic valve, the last door out. Just above it open the coronary arteries, so the first organ the heart feeds is itself. And then the whole cycle begins again, a little more than once every second, for the whole of your life.',
};
