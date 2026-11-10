// The stories a guided tour tells: how a thing works, one step at a time. A close-up that has a story here tours its
// story, not its list of parts. Each step is one moment: what is said (written for the ear, and shown beside the model),
// the part it is about, what to look at and from where, and which stretch of the motion plays, slowed, while it is told.
//   entry    the part it is about: lit, and labelled
//   frame    the parts the view closes in on (default: the whole close-up); from: the direction to look from
//   labels   the parts labelled during the step (default: its entry alone; [] for none)
//   span     the stretch of the motion's cycle that plays, over and over, taking `seconds` each time (default: all of it, at its own pace)
//   streams  which of the motion's streams show (default: all)
const BEHIND = [0.75, 0.2, -0.65];   // from the back and the body's left, where the left atrium lies
export const STORIES = {
  heart: [
    { title: 'One beat, slowed down', entry: 'heartVentricularWall', labels: [],
      say: 'This is your heart, beating. One beat takes less than a second, far too quick to follow. So let us slow it right down, and walk through a single beat, one step at a time. Blue is blood that has given up its oxygen. Red is blood that has just collected more.' },
    { title: 'Blood comes home', entry: 'heartRightAtrium', frame: ['heartRightAtrium', 'heartTricuspidValve'], span: [0.14, 0.58], seconds: 5, streams: [0],
      say: 'Start on the right side. Used blood from the whole body pours in through the two great veins, and collects here, in the right atrium. The valve in its floor is shut for now, so the chamber fills.' },
    { title: 'The tricuspid valve opens', entry: 'heartTricuspidValve', frame: ['heartRightAtrium', 'heartRightVentricle'], labels: ['heartRightAtrium', 'heartTricuspidValve', 'heartRightVentricle'], span: [0.58, 1.13], seconds: 5.5, streams: [0],
      say: 'Then the ventricle below relaxes, and the tricuspid valve drops open. Most of the blood simply falls through. At the last moment the atrium squeezes, and tops the ventricle up.' },
    { title: 'The right ventricle squeezes', entry: 'heartRightVentricle', frame: ['heartRightVentricle', 'heartPulmonaryValve'], labels: ['heartTricuspidValve', 'heartRightVentricle', 'heartPulmonaryValve'], span: [0.13, 0.58], seconds: 5, streams: [0],
      say: 'Now the ventricle squeezes. The pressure slams the tricuspid valve shut behind the blood. That is the first heart sound: lub. With nowhere else to go, the blood pushes the pulmonary valve open, and leaves for the lungs.' },
    { title: 'Back from the lungs', entry: 'heartLeftAtrium', frame: ['heartLeftAtrium', 'heartMitralValve'], from: BEHIND, span: [0.14, 0.58], seconds: 5, streams: [1],
      say: 'In the lungs the blood trades its carbon dioxide for oxygen. It comes back bright red, into the left atrium, which sits at the back of the heart.' },
    { title: 'The mitral valve opens', entry: 'heartMitralValve', frame: ['heartLeftAtrium', 'heartLeftVentricle'], labels: ['heartLeftAtrium', 'heartMitralValve', 'heartLeftVentricle'], from: BEHIND, span: [0.58, 1.13], seconds: 5.5, streams: [1],
      say: 'The mitral valve opens, and the left ventricle fills, just as the right one did. The two sides keep perfect step: both atria squeeze in the same instant.' },
    { title: 'The left ventricle squeezes', entry: 'heartLeftVentricle', frame: ['heartLeftVentricle', 'heartAorticValve', 'heartGreatVessels'], labels: ['heartMitralValve', 'heartLeftVentricle', 'heartAorticValve'], span: [0.13, 0.58], seconds: 5, streams: [1],
      say: 'And both ventricles squeeze together. The left has the thickest wall in the heart, because it has to drive blood to every part of you. The mitral valve shuts, the aortic valve opens, and blood surges into the aorta. That surge is the pulse you can feel at your wrist.' },
    { title: 'The valves snap shut', entry: 'heartAorticValve', frame: ['heartAorticValve', 'heartPulmonaryValve'], labels: ['heartAorticValve', 'heartPulmonaryValve', 'heartLeftCoronary'], span: [0.4, 0.72], seconds: 4.5,
      say: 'As the ventricles relax, the blood in the two great arteries starts to fall back. It catches in the cups of the aortic and pulmonary valves, and snaps them shut. That is the second heart sound: dub. And in this pause the heart feeds itself, through the coronary arteries that open just above the aortic valve.' },
    { title: 'The whole beat', entry: 'heartVentricularWall', labels: [],
      say: 'Now put it all together, at full speed. Atria, then ventricles. Lub, dub. The right side sends blood to the lungs, and the left side sends it round the body, in the same instant. About a hundred thousand times a day, and it never stops to rest.' },
  ],
};
