// Shared utility helpers used across the app.
export function debounce(fn, delay = 150) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRNG {
  constructor(seed) {
    if (typeof seed === "string") {
      this.state = hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) {
      this.state = 0x1a2b3c4d;
    }
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  fork() {
    let nextSeed = Math.floor(this.next() * 0xffffffff) >>> 0;
    if (nextSeed === 0) nextSeed = 0x9e3779b9;
    return new SeededRNG(nextSeed);
  }
}

