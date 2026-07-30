// Deterministic PRNG (mulberry32) — fixed seed constant so the stress thread
// regenerates identically on every replay (spec §8). No Math.random anywhere.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Power-law-ish integer in [min,max] biased low (vote magnitudes).
export function powInt(rnd, min, max, exp = 2.4) {
  const u = rnd();
  return Math.floor(min + (max - min) * Math.pow(u, exp));
}

export const SEED_CONST = 1337;
