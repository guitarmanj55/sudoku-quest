// Sudoku engine: seeded generation, uniqueness check and a simple logic grader.
(function (global) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(a, r) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const ROW = [], COL = [], BOX = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9);
    COL[i] = i % 9;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const u = [];
    for (let i = 0; i < 81; i++) if (BOX[i] === b) u.push(i);
    UNITS.push(u);
  }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    }
    PEERS.push(p);
  }
  const POP = new Uint8Array(1024);
  for (let m = 0; m < 1024; m++) {
    let c = 0, x = m;
    while (x) { c += x & 1; x >>= 1; }
    POP[m] = c;
  }
  const ALL = 0x3FE; // bits 1..9

  function solvedGrid(r) {
    const g = new Array(81).fill(0);
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    (function fill() {
      // always fill the most constrained cell next, so the search never thrashes
      let i = -1, bestN = 10;
      for (let j = 0; j < 81; j++) {
        if (g[j]) continue;
        const n = POP[ALL & ~(rows[ROW[j]] | cols[COL[j]] | boxes[BOX[j]])];
        if (n < bestN) { bestN = n; i = j; }
      }
      if (i < 0) return true;
      if (bestN === 0) return false;
      const ri = ROW[i], ci = COL[i], bi = BOX[i];
      for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) {
        const bit = 1 << d;
        if ((rows[ri] | cols[ci] | boxes[bi]) & bit) continue;
        g[i] = d; rows[ri] |= bit; cols[ci] |= bit; boxes[bi] |= bit;
        if (fill()) return true;
        g[i] = 0; rows[ri] &= ~bit; cols[ci] &= ~bit; boxes[bi] &= ~bit;
      }
      return false;
    })();
    return g;
  }

  function countSolutions(grid, limit) {
    const g = grid.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      const d = g[i];
      if (!d) continue;
      const bit = 1 << d;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return 0;
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    }
    let count = 0;
    (function search() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const n = POP[m];
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { count++; return; }
      const ri = ROW[best], ci = COL[best], bi = BOX[best];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d; rows[ri] |= bit; cols[ci] |= bit; boxes[bi] |= bit;
        search();
        g[best] = 0; rows[ri] &= ~bit; cols[ci] &= ~bit; boxes[bi] &= ~bit;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  // level 1 = naked singles only, level 2 = + hidden singles. Returns true if fully solved.
  function logicSolve(grid, level) {
    const g = grid.slice();
    for (;;) {
      const cand = new Array(81).fill(0);
      let empty = 0;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        empty++;
        let m = ALL;
        for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p]);
        cand[i] = m;
      }
      if (!empty) return true;
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (!g[i] && POP[cand[i]] === 1) { g[i] = Math.log2(cand[i]); progress = true; }
      }
      if (!progress && level >= 2) {
        for (const u of UNITS) {
          for (let d = 1; d <= 9; d++) {
            const bit = 1 << d;
            let pos = -1, n = 0;
            for (const i of u) {
              if (g[i] === d) { n = -1; break; }
              if (!g[i] && (cand[i] & bit)) { n++; pos = i; }
            }
            if (n === 1) { g[pos] = d; progress = true; }
          }
        }
      }
      if (!progress) return false;
    }
  }

  // target = clue count to aim for; logic = puzzle must stay solvable at this level;
  // avoid = prefer puzzles NOT solvable at this level (so they really need harder steps).
  const CFG = {
    novice: { target: 40, logic: 1 },
    easy:   { target: 35, logic: 1 },
    medium: { target: 31, logic: 2, avoid: 1, tries: 4 },
    hard:   { target: 27, avoid: 2, tries: 6 },
    expert: { target: 23, avoid: 2, tries: 10 },
  };

  function carve(sol, r, target, logic) {
    const puz = sol.slice();
    let clues = 81;
    const order = shuffle(Array.from({ length: 41 }, (_, i) => i), r);
    for (const i of order) {
      if (clues <= target) break;
      const j = 80 - i; // keep the classic rotational symmetry
      const vi = puz[i], vj = puz[j];
      puz[i] = 0; puz[j] = 0;
      if (countSolutions(puz, 2) !== 1 || (logic && !logicSolve(puz, logic))) {
        puz[i] = vi; puz[j] = vj;
      } else {
        clues -= i === j ? 1 : 2;
      }
    }
    // second pass: single cells, to get closer to sparse targets
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), r)) {
      if (clues <= target) break;
      if (!puz[i]) continue;
      const v = puz[i];
      puz[i] = 0;
      if (countSolutions(puz, 2) !== 1 || (logic && !logicSolve(puz, logic))) puz[i] = v;
      else clues--;
    }
    return { puzzle: puz, solution: sol, clues };
  }

  function generate(diff, seed, opts) {
    const cfg = CFG[diff] || CFG.medium;
    const r = rng(seed);
    const target = cfg.target - (opts && opts.boss ? 3 : 0);
    let best = null;
    for (let t = 0; t < (cfg.tries || 1); t++) {
      const res = carve(solvedGrid(r), r, target, cfg.logic);
      if (!cfg.avoid || !logicSolve(res.puzzle, cfg.avoid)) return res;
      if (!best || res.clues < best.clues) best = res;
    }
    return best;
  }

  global.Sudoku = { rng, hash, generate, countSolutions, logicSolve, PEERS, UNITS, ROW, COL, BOX, POP, ALL };
})(window);
