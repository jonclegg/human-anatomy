// Motions of the pelvis: an egg's journey to the uterus, and the two things that leave by the male urethra.
// See ../motions.mjs for the format.
import { smooth, during, light, URINE, SEED } from './shared.mjs';

/* ---------- The female pelvis: an egg, from the ovary to the uterus ---------- */
export const femalePelvis = {
  cycle: 13000, watch: 'how an egg reaches the uterus',
  build(kit) {
    const womb = kit.centre(kit.one(/^Body of uterus$/));
    const sides = ['Left', 'Right'].map(side => {
      const named = pattern => kit.one(new RegExp(pattern.replace('SIDE', side), 'i')), middle = pattern => kit.centre(named(pattern));
      const ovary = named('^SIDE ovary$'), tube = ['^SIDE fimbriae of uterine tube$', '^SIDE uterine tube infundibulum$', '^SIDE ampulla of uterine tube$', '^SIDE isthmus of (fallopian|uterine) tube$'];
      return { ovary, tube: tube.map(named), way: kit.curve([kit.centre(ovary), ...tube.map(middle), womb.clone().lerp(middle(tube[3]), 0.35), womb]) };
    });
    const turnOf = time => Math.floor(time / 13) % 2;   // the ovaries do not strictly take turns, but here they do, so both tubes are seen
    return {
      sides, turnOf, womb: kit.entry('uterus'),
      streams: sides.map(({ way }, k) => ({ curve: way.curve, colour: '#ffe9a8', count: 18, size: 1.5, spread: 0.06, packed: 0.012, place: phase => 0.012 + 0.985 * smooth(0.16, 0.9, phase), shown: (phase, time) => (turnOf(time) === k ? during(phase, 0.1, 0.99, 0.03) : 0) })),
    };
  },
  step(rig, phase, act, time) {
    const { ovary, tube } = rig.sides[rig.turnOf(time)];
    light(act, [ovary], during(phase, 0, 0.22, 0.08)); light(act, [tube[0], tube[1]], 0.7 * during(phase, 0.14, 0.4)); light(act, [tube[2], tube[3]], 0.6 * during(phase, 0.35, 0.85)); light(act, rig.womb, 0.45 * during(phase, 0.8, 1));
    return { caption: phase < 0.16 ? 'About once a month, an ovary releases an egg' : phase < 0.38 ? 'The fringed end of the uterine tube sweeps over the ovary and catches it' : phase < 0.82 ? 'Fine hairs and gentle squeezing carry it along the tube over several days. Fertilisation, if it happens, happens here' : 'It reaches the uterus, where the lining has thickened' };
  },
};

/* the middle of the bladder, and the urethra's line from it outward */
function outflow(kit) {
  const pool = kit.centre(kit.one(/^Urinary bladder$/)), pipe = kit.line(kit.find(/^Urethra$/, kit.shown), { from: pool, radius: 0.7 });
  return { pool, pipe };
}

/* ---------- The male pelvis: urine, and then semen, by the same way out ---------- */
export const malePelvis = {
  cycle: 12000, watch: 'how urine and semen leave the body',
  build(kit) {
    const { pool, pipe } = outflow(kit), gland = kit.centre(kit.one(/^Prostate$/)), curve = points => kit.curve(points).curve;
    const after = pipe.filter(point => point.y < gland.y - 0.5);
    const ducts = kit.entry('deferentDuct').map(duct => kit.line(duct, { from: kit.end(duct, gland.clone().sub(kit.centre(duct)).negate().normalize(), 1), radius: 0.6 }));
    return {
      bladder: kit.one(/^Urinary bladder$/), pool, adders: [...kit.entry('seminalVesicle'), ...kit.entry('prostate')],
      streams: [
        { curve: curve([pool, ...pipe]), colour: URINE, count: 312, size: 0.48, spread: 0.12, speed: () => 0.5, shown: phase => during(phase, 0.04, 0.46) },
        ...ducts.map(duct => ({ curve: curve([...duct, gland, ...after]), colour: SEED, count: 192, size: 0.42, spread: 0.08, speed: () => 0.3, shown: phase => during(phase, 0.54, 0.98) })),
      ],
    };
  },
  step(rig, phase, act) {
    act.rigid(rig.bladder, { pivot: rig.pool, scale: 1 - 0.14 * smooth(0.04, 0.46, phase) * (1 - smooth(0.6, 1, phase)) });
    light(act, rig.adders, 0.6 * during(phase, 0.56, 0.98, 0.08));
    return { caption: phase < 0.5 ? 'Urine leaves the bladder through the middle of the prostate and along the urethra' : 'Sperm arrive by the two deferent ducts. The seminal vesicles and the prostate add most of the fluid, and it leaves by the same urethra, but not at the same time as urine' };
  },
};

/* ---------- The penis and testes: where sperm are made, and their way out ---------- */
export const penis = {
  cycle: 10000, watch: 'how sperm are made and stored',
  build(kit) {
    const sides = ['Left', 'Right'].map(side => {
      const named = pattern => kit.one(new RegExp(pattern.replace('SIDE', side))), maker = named('^SIDE testis$'), coil = named('^SIDE epididymis$'), duct = named('^SIDE deferent duct$');
      const stored = kit.line(coil, { from: kit.end(coil, kit.V(0, 1, 0), 0.6), radius: 0.6 }), away = kit.line(duct, { from: stored.at(-1), radius: 0.6 });
      return { maker, coil, way: kit.curve([kit.centre(maker), ...stored, ...away]) };
    });
    return { makers: sides.map(side => side.maker), coils: sides.map(side => side.coil), streams: sides.map(({ way }) => ({ curve: way.curve, colour: SEED, count: 336, size: 0.36, spread: 0.08, speed: () => 0.07 })) };
  },
  step(rig, phase, act) {
    light(act, rig.makers, 0.5 * during(phase, 0, 0.5, 0.1)); light(act, rig.coils, 0.6 * during(phase, 0.5, 1, 0.1));
    return { caption: phase < 0.5 ? 'Sperm are made in the testes: more than a thousand every second' : 'They spend up to two weeks maturing in the coiled epididymis behind each testis, then leave by the deferent duct' };
  },
};
