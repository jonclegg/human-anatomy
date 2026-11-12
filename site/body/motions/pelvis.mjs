// Motions of the pelvis: an egg's journey to the uterus, the clitoris filling with blood, the two things that leave by
// the male urethra, and sperm and blood in the penis and testes.
// See ../motions.mjs for the format.
import { smooth, during, light, thread, FRESH, URINE, SEED } from './shared.mjs';

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

/* ---------- The clitoris: blood comes in, the erectile tissue swells, muscles hold the blood there, and it drains ----------
   0.04-0.82 the arteries bring more blood; 0.10-0.50 the bulbs, crura and body swell; 0.50-0.82 the muscles over them tighten; 0.82-0.98 it subsides */
export const clitoris = {
  cycle: 14000, watch: 'how the clitoris fills with blood',
  build(kit) {
    const sides = ['Left', 'Right'].map(side => {
      const named = pattern => kit.one(new RegExp(pattern.replace('SIDE', side))), crus = named('^SIDE crus of clitoris$'), bulb = named('^SIDE bulb of vestibule$');
      const artery = kit.line(named('^SIDE internal pudendal artery$'), { to: kit.centre([crus, bulb]), radius: 0.6 });
      /* each muscle lies on the erectile body it covers, and swells with it, about the same point */
      return { artery, swelling: [[crus, crus], [named('^SIDE ischiocavernosus$'), crus], [bulb, bulb], [named('^SIDE bulbospongiosus$'), bulb]].map(([part, on]) => ({ part, pivot: kit.centre(on) })), ends: [crus, bulb].map(part => kit.centre(part)) };
    });
    const body = kit.one(/^Body of clitoris$/), middle = kit.centre(body);
    return {
      swelling: [...sides.flatMap(side => side.swelling), { part: body, pivot: middle }, { part: kit.one(/^Glans of clitoris$/), pivot: middle }],
      erectile: [...kit.entry('clitorisCrura'), ...kit.entry('clitorisBulbs'), body], muscles: [...kit.entry('clitorisIschiocavernosus'), ...kit.entry('clitorisBulbospongiosus')],
      streams: sides.flatMap(({ artery, ends }) => ends.map(end => ({ curve: kit.curve([...artery, end]).curve, colour: FRESH, count: 120, size: 0.3, spread: 0.08, speed: () => 0.22, shown: phase => during(phase, 0.04, 0.82, 0.06) }))),
    };
  },
  step(rig, phase, act) {
    const swell = smooth(0.1, 0.5, phase) * (1 - smooth(0.82, 0.98, phase));
    for (const { part, pivot } of rig.swelling) act.rigid(part, { pivot, scale: 1 + 0.1 * swell });
    light(act, rig.erectile, 0.35 * swell); light(act, rig.muscles, 0.5 * during(phase, 0.5, 0.82, 0.08));
    return { caption: phase < 0.5 ? 'During arousal the arteries bring more blood, and the bulbs, crura and body of the clitoris swell' : phase < 0.82 ? 'The muscles over them tighten, press on the veins, and keep the blood in' : 'Afterwards the blood drains away' };
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
    const ducts = kit.entry('deferentDuct').map(duct => thread(kit.points(duct), kit.end(duct, kit.V(0, -1, 0), 0.8)));   // each from its low end, at the testis
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

/* ---------- The penis and testes: where sperm are made, their way out, and the blood that makes an erection ----------
   0-0.33 made; 0.33-0.66 stored and sent on; 0.68-1 blood fills the corpora cavernosa. The penis is not shown rising:
   the skin and everything round it would have to move with it. The blood is shown going in. */
export const penis = {
  cycle: 15000, watch: 'how sperm are made, and how an erection happens',
  build(kit) {
    const sides = ['Left', 'Right'].map(side => {
      const named = pattern => kit.one(new RegExp(pattern.replace('SIDE', side))), maker = named('^SIDE testis$'), coil = named('^SIDE epididymis$'), duct = named('^SIDE deferent duct$');
      const stored = kit.line(coil, { from: kit.end(coil, kit.V(0, 1, 0), 0.6), radius: 0.6 }), away = kit.line(duct, { from: kit.end(duct, kit.V(0, -1, 0), 0.8), radius: 1 });   // from the duct's own low end, where it leaves the epididymis
      return { maker, coil, way: kit.curve([kit.centre(maker), ...stored, ...away]), filling: kit.curve(kit.line(named('^SIDE deep artery of penis$'), { to: kit.centre(kit.entry('penisGlans')), radius: 1.5 })) };
    });
    return {
      makers: sides.map(side => side.maker), coils: sides.map(side => side.coil), firm: kit.entry('penisCorpusCavernosum'),
      streams: [
        ...sides.map(({ way }) => ({ curve: way.curve, colour: SEED, count: 336, size: 0.36, spread: 0.08, speed: () => 0.07, shown: phase => 1 - during(phase, 0.68, 1.01) })),
        ...sides.map(({ filling }) => ({ curve: filling.curve, colour: FRESH, count: 168, size: 0.3, spread: 0.12, speed: () => 0.25, shown: phase => during(phase, 0.68, 1) })),
      ],
    };
  },
  step(rig, phase, act) {
    light(act, rig.makers, 0.5 * during(phase, 0, 0.33, 0.08)); light(act, rig.coils, 0.6 * during(phase, 0.33, 0.66, 0.08)); light(act, rig.firm, 0.4 * during(phase, 0.7, 1, 0.1));
    return { caption: phase < 0.33 ? 'Sperm are made in the testes: more than a thousand every second' : phase < 0.67 ? 'They spend up to two weeks maturing in the coiled epididymis behind each testis, then leave by the deferent duct' : 'In an erection, arteries inside the two corpora cavernosa widen and blood fills them' };
  },
};
