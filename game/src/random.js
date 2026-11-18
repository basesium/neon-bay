// A small seeded random number generator (mulberry32) plus the helpers the city builder
// and the traffic use: the same seed gives the same city, the same traffic colours and the
// same screenshot scenes, which is what makes the staged shots repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** A number in [min, max). */
  random.range = (min, max) => min + random() * (max - min);
  /** An integer in [min, max]. */
  random.int = (min, max) => min + Math.floor(random() * (max - min + 1));
  /** One element of an array. */
  random.pick = (items) => items[Math.floor(random() * items.length)];
  /** True with the given probability. */
  random.chance = (p) => random() < p;
  return random;
}
