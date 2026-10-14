// Injectable random sources. Every rule function takes `rng` with a `next()` returning [0, 1).

export function createRng(seed = Date.now()) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return {
    seed,
    next() {
      // mulberry32
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// Replays a fixed list of values (for tests); falls back to 0 when exhausted.
export function createSequenceRng(values) {
  let index = 0;
  return {
    next() {
      const value = index < values.length ? values[index] : 0;
      index += 1;
      return value;
    },
    get used() { return index; },
  };
}

export function randomInt(rng, min, max) {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function pickWeighted(rng, entries, weightOf = (e) => e.weight) {
  const total = entries.reduce((sum, e) => sum + weightOf(e), 0);
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= weightOf(entry);
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}
