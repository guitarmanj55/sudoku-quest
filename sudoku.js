// Sudoku engine: seeded generation, uniqueness check and a simple logic grader.
// Supports classic sudoku and the diagonal variant (both long diagonals hold 1-9).
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
  const POP = new Uint8Array(1024);
  for (let m = 0; m < 1024; m++) {
    let c = 0, x = m;
    while (x) { c += x & 1; x >>= 1; }
    POP[m] = c;
  }
  const ALL = 0x3FE; // bits 1..9

  // UNITS: 0-8 rows, 9-17 columns, 18-26 boxes, 27-28 diagonals (diagonal variant only).
  // CU[i]: the units cell i belongs to. PEERS[i]: every other cell sharing a unit with i.
  function makeVariant(diag) {
    const UNITS = [];
    for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    for (let b = 0; b < 9; b++) UNITS.push(Array.from({ length: 81 }, (_, i) => i).filter(i => BOX[i] === b));
    if (diag) {
      UNITS.push(Array.from({ length: 9 }, (_, k) => k * 10));
      UNITS.push(Array.from({ length: 9 }, (_, k) => k * 8 + 8));
    }
    const CU = Array.from({ length: 81 }, () => []);
    UNITS.forEach((u, ui) => u.forEach(i => CU[i].push(ui)));
    const PEERS = CU.map((us, i) => [...new Set(us.flatMap(u => UNITS[u]))].filter(j => j !== i));
    return { diag, UNITS, CU, PEERS };
  }
  const CLASSIC = makeVariant(false);
  const DIAGONAL = makeVariant(true);

  function solvedGrid(r, v) {
    const g = new Array(81).fill(0), um = new Array(v.UNITS.length).fill(0);
    const used = i => { let m = 0; for (const u of v.CU[i]) m |= um[u]; return m; };
    (function fill() {
      // always fill the most constrained cell next, so the search never thrashes
      let i = -1, bestN = 10;
      for (let j = 0; j < 81; j++) {
        if (g[j]) continue;
        const n = POP[ALL & ~used(j)];
        if (n < bestN) { bestN = n; i = j; }
      }
      if (i < 0) return true;
      if (bestN === 0) return false;
      for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) {
        const bit = 1 << d;
        if (used(i) & bit) continue;
        g[i] = d; for (const u of v.CU[i]) um[u] |= bit;
        if (fill()) return true;
        g[i] = 0; for (const u of v.CU[i]) um[u] &= ~bit;
      }
      return false;
    })();
    return g;
  }

  function countSolutions(grid, limit, v = CLASSIC) {
    const g = grid.slice(), um = new Array(v.UNITS.length).fill(0);
    const used = i => { let m = 0; for (const u of v.CU[i]) m |= um[u]; return m; };
    for (let i = 0; i < 81; i++) {
      const d = g[i];
      if (!d) continue;
      const bit = 1 << d;
      if (used(i) & bit) return 0;
      for (const u of v.CU[i]) um[u] |= bit;
    }
    let count = 0;
    (function search() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~used(i);
        const n = POP[m];
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { count++; return; }
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d; for (const u of v.CU[best]) um[u] |= bit;
        search();
        g[best] = 0; for (const u of v.CU[best]) um[u] &= ~bit;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  // level 1 = naked singles only, level 2 = + hidden singles. Returns true if fully solved.
  function logicSolve(grid, level, v = CLASSIC) {
    const g = grid.slice();
    for (;;) {
      const cand = new Array(81).fill(0);
      let empty = 0;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        empty++;
        let m = ALL;
        for (const p of v.PEERS[i]) if (g[p]) m &= ~(1 << g[p]);
        cand[i] = m;
      }
      if (!empty) return true;
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (!g[i] && POP[cand[i]] === 1) { g[i] = Math.log2(cand[i]); progress = true; }
      }
      if (!progress && level >= 2) {
        for (const u of v.UNITS) {
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

  function carve(sol, r, target, logic, v) {
    const puz = sol.slice();
    let clues = 81;
    const ok = () => countSolutions(puz, 2, v) === 1 && (!logic || logicSolve(puz, logic, v));
    const order = shuffle(Array.from({ length: 41 }, (_, i) => i), r);
    for (const i of order) {
      if (clues <= target) break;
      const j = 80 - i; // keep the classic rotational symmetry
      const vi = puz[i], vj = puz[j];
      puz[i] = 0; puz[j] = 0;
      if (!ok()) { puz[i] = vi; puz[j] = vj; }
      else clues -= i === j ? 1 : 2;
    }
    // second pass: single cells, to get closer to sparse targets
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), r)) {
      if (clues <= target) break;
      if (!puz[i]) continue;
      const val = puz[i];
      puz[i] = 0;
      if (!ok()) puz[i] = val;
      else clues--;
    }
    return { puzzle: puz, solution: sol, clues };
  }

  function generate(diff, seed, opts = {}) {
    const cfg = CFG[diff] || CFG.medium;
    const v = opts.diag ? DIAGONAL : CLASSIC;
    const r = rng(seed);
    const target = cfg.target - (opts.boss ? 3 : 0);
    let best = null;
    for (let t = 0; t < (cfg.tries || 1); t++) {
      const res = carve(solvedGrid(r, v), r, target, cfg.logic, v);
      if (!cfg.avoid || !logicSolve(res.puzzle, cfg.avoid, v)) return res;
      if (!best || res.clues < best.clues) best = res;
    }
    return best;
  }

  // Givens that can be hidden while the puzzle stays uniquely solvable by singles.
  function pickFog(puzzle, seed, count, v = CLASSIC) {
    const r = rng(seed), p = puzzle.slice(), fog = [];
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k).filter(k => p[k]), r)) {
      if (fog.length >= count) break;
      const val = p[i];
      p[i] = 0;
      if (countSolutions(p, 2, v) === 1 && logicSolve(p, 2, v)) fog.push(i);
      else p[i] = val;
    }
    return fog;
  }

  global.Sudoku = {
    rng, hash, shuffle, generate, countSolutions, logicSolve, pickFog,
    CLASSIC, DIAGONAL, PEERS: CLASSIC.PEERS, UNITS: CLASSIC.UNITS, ROW, COL, BOX, POP, ALL,
  };
})(window);
