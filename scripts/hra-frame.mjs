// The Human Reference Atlas (Visible Human Female) frame, mapped into the model's frame.
// The source is glTF-standard (+X subject's left, +Y up, +Z front, metres) from a body scanned lying down,
// which rocks the pelvis backward. The model's frame is cm with +y front and z = -height (S(x, y, s) = V(x, y, -s)).
// The source is turned and scaled so its pubic symphysis (back-top) and sacral promontory land on the model's own:
// symphysis S(0, 2.95, 6.9), promontory S(0, -6.0, 15.0), a 12.07 cm obstetric conjugate.
const SOURCE = { centreX: -0.86, symphysis: [-4.53, -0.44], promontory: [-8.29, 11.66] };   // cm, (front, height) in the source
const TARGET = { symphysis: [2.95, 6.9], promontory: [-6.0, 15.0] };                          // cm, (front, height) in the model
const vector = (a, b) => [b[0] - a[0], b[1] - a[1]];
const source = vector(SOURCE.symphysis, SOURCE.promontory), target = vector(TARGET.symphysis, TARGET.promontory);
export const turn = Math.atan2(target[1], target[0]) - Math.atan2(source[1], source[0]);
export const scale = Math.hypot(...target) / Math.hypot(...source);

export function toModel([x, y, z]) {   // metres, glTF axes -> model cm
  const front = z * 100 - SOURCE.symphysis[0], height = y * 100 - SOURCE.symphysis[1];
  const f = front * Math.cos(turn) - height * Math.sin(turn), h = front * Math.sin(turn) + height * Math.cos(turn);
  return [(x * 100 - SOURCE.centreX) * scale, TARGET.symphysis[0] + f * scale, -(TARGET.symphysis[1] + h * scale)];
}

