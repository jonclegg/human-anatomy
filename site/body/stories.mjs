// The stories a guided tour tells: how a thing works, one step at a time. A close-up that has a story here tours its
// story, not its list of parts. Each step is one moment: what is said (written for the ear, and shown beside the model),
// the part it is about, what to look at and from where, and which stretch of the motion plays, slowed, while it is told.
//   entry    the part it is about: lit, and labelled
//   frame    the parts the view closes in on (default: the whole close-up); from: the direction to look from; fill: how closely
//   open     cuts the close-up open, facing the viewer: the parts through whose middle the cut passes (default: left whole);
//            lift: how far nearer the viewer than that, in cm
//   labels   the parts labelled during the step (default: its entry alone; [] for none)
//   span     the stretch of the motion's cycle that plays, over and over, taking `seconds` each time (default: all of it, at its own pace)
//   streams  which of the motion's streams show (default: all)
const FRONT = [0.6, 0.1, 0.8], LEFT = [0.85, 0.1, 0.5];   // both sides are seen from the front and the body's left, the left side from further round, as an opened heart is drawn in an atlas
const ABOVE = [-0.25, 1, -0.1];     // from above, down the two great arteries onto their valves
const RIGHT_SIDE = ['heartRightAtrium', 'heartRightVentricle'], LEFT_SIDE = ['heartLeftAtrium', 'heartLeftVentricle'];
/* only the front wall is taken off (the cut lies `lift` cm nearer the viewer than the side's two valves), so the valves, their cords and the muscles that hold them are whole behind it */
const RIGHT_VALVES = ['heartTricuspidValve', 'heartPulmonaryValve'], LEFT_VALVES = ['heartMitralValve', 'heartAorticValve'];
export const STORIES = {
  heart: [
    { title: 'One beat, slowed down', entry: 'heartVentricularWall', labels: [],
      say: 'This is one heartbeat, slowed right down. Blue blood has given up its oxygen. Red blood has just picked more up.' },
    { title: 'Blood comes home', entry: 'heartRightAtrium', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 2.2, from: FRONT, fill: 1.15, labels: ['heartRightAtrium', 'heartTricuspidValve'], span: [0.14, 0.58], seconds: 5, streams: [0],
      say: 'Used blood from the body pours into the right atrium. The valve in its floor is shut, so the chamber fills.' },
    { title: 'The tricuspid valve opens', entry: 'heartTricuspidValve', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 2.2, from: FRONT, fill: 1.15, labels: ['heartRightAtrium', 'heartTricuspidValve', 'heartRightVentricle'], span: [0.5, 1.13], seconds: 6, streams: [0],
      say: 'The ventricle below relaxes, and the tricuspid valve drops open. Blood falls through, and a last squeeze from the atrium tops the ventricle up.' },
    { title: 'The right ventricle squeezes', entry: 'heartRightVentricle', frame: RIGHT_SIDE, open: RIGHT_VALVES, lift: 2.2, from: FRONT, fill: 1.15, labels: ['heartTricuspidValve', 'heartRightVentricle', 'heartPulmonaryValve'], span: [0.08, 0.58], seconds: 5.5, streams: [0],
      say: 'Now the ventricle squeezes. The tricuspid valve slams shut: that is the first heart sound, lub. The blood forces the pulmonary valve open, and leaves for the lungs.' },
    { title: 'Back from the lungs', entry: 'heartLeftAtrium', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 2.4, fill: 1.15, labels: ['heartLeftAtrium', 'heartMitralValve'], from: LEFT, span: [0.14, 0.58], seconds: 5, streams: [1],
      say: 'It comes back from the lungs bright red, full of oxygen, into the left atrium.' },
    { title: 'The mitral valve opens', entry: 'heartMitralValve', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 2.4, fill: 1.15, labels: ['heartLeftAtrium', 'heartMitralValve', 'heartLeftVentricle'], from: LEFT, span: [0.5, 1.13], seconds: 6, streams: [1],
      say: 'The mitral valve opens, and the left ventricle fills, in step with the right.' },
    { title: 'The left ventricle squeezes', entry: 'heartLeftVentricle', frame: LEFT_SIDE, open: LEFT_VALVES, lift: 0.5, fill: 1.15, labels: ['heartMitralValve', 'heartLeftVentricle', 'heartAorticValve'], from: LEFT, span: [0.08, 0.58], seconds: 5.5, streams: [1],
      say: 'The left ventricle has the thickest wall, because it drives blood round the whole body. It squeezes, the mitral valve shuts, the aortic valve opens, and blood surges into the aorta. That surge is your pulse.' },
    { title: 'The valves snap shut', entry: 'heartAorticValve', frame: ['heartAorticValve', 'heartPulmonaryValve'], open: ['heartAorticValve', 'heartPulmonaryValve'], lift: 2.2, fill: 0.8, from: ABOVE, labels: ['heartAorticValve', 'heartPulmonaryValve'], span: [0.3, 0.72], seconds: 5, streams: [],
      say: 'As the ventricles relax, blood in the two great arteries falls back, fills the cups of these valves, and snaps them shut. That is the second heart sound: dub.' },
    { title: 'The whole beat', entry: 'heartVentricularWall', frame: ['heartVentricularWall'], open: ['heartTricuspidValve', 'heartMitralValve'], lift: 2.6, from: [0.72, 0.1, 0.68], fill: 1.05, labels: [],
      say: 'Now all of it, at full speed. Atria, then ventricles. Lub, dub. About a hundred thousand times a day.' },
  ],
};
