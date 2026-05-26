/**
 * Pure scoring math for Qaid. No DOM, no global state — every function takes
 * its inputs explicitly so the same code is exercised from the app and from
 * tests. Game-specific quirks live here:
 *
 *   Custom  — per-player totals; first to threshold wins (or lowest hits it = lowest wins).
 *   Sebeeta — per-player totals; anyone hitting threshold loses, opposing team wins.
 *   Kout    — per-team totals; first team to threshold wins. Ties at threshold
 *             break by higher score.
 */

// Kout contract scoring table. `made` goes to the caller; `failed` goes to
// the opponent. Malzoom is a special case where both directions pay the same.
export const KOUT_CONTRACT_SCORES = {
  bab:     { made: 5,  failed: 10 },
  '6':     { made: 6,  failed: 12 },
  '7':     { made: 7,  failed: 14 },
  '8':     { made: 8,  failed: 16 },
  bawan:   { made: 36, failed: 18 },
  malzoom: { made: 5,  failed: 5 },
};

export const KOUT_LEVELS = ['bab', '6', '7', '8', 'bawan', 'malzoom'];

/**
 * Compute the round's [teamA, teamB] score change for a Kout contract.
 * Returns [0, 0] when the contract isn't fully specified yet.
 *
 * @param {0|1|null} caller - team index that called the contract
 * @param {string|null} level - one of KOUT_LEVELS
 * @param {'made'|'failed'|null} outcome
 */
export function computeContractScore(caller, level, outcome) {
  if (caller === null || !level || !outcome) return [0, 0];
  const cfg = KOUT_CONTRACT_SCORES[level];
  if (!cfg) return [0, 0];
  const out = [0, 0];
  if (outcome === 'made') out[caller] = cfg.made;
  else                    out[1 - caller] = cfg.failed;
  return out;
}

/**
 * Sum a list of round-score arrays into per-entity totals.
 *
 * @param {number[][]} scores - rounds array; each round is per-entity scores
 * @param {number} n - number of entities (players or teams)
 * @returns {number[]} totals of length n
 */
export function computeTotals(scores, n) {
  const out = new Array(n).fill(0);
  scores.forEach((round) => {
    for (let i = 0; i < n; i++) out[i] += (round[i] || 0);
  });
  return out;
}

/**
 * Sebeeta helper: roll up per-player totals into per-team totals [A, B].
 *
 * @param {number[]} playerTotals - per-player totals
 * @param {number[]} playerTeam   - team index (0 or 1) per player
 * @returns {[number, number]} [teamA, teamB]
 */
export function teamTotalsFromPlayers(playerTotals, playerTeam) {
  const t = [0, 0];
  playerTeam.forEach((tIdx, pIdx) => {
    t[tIdx] += (playerTotals[pIdx] || 0);
  });
  return t;
}

/**
 * The dealer is the side that's losing relative to the win rule:
 *   winRule='highest' → dealer is the lowest score
 *   winRule='lowest'  → dealer is the highest score
 *
 * Used to highlight whose turn it is to deal next round.
 *
 * @returns {number} index into totalsArr, or -1 if empty
 */
export function dealerIndex(totalsArr, winRule) {
  if (totalsArr.length === 0) return -1;
  if (winRule === 'highest') {
    let min = Infinity, idx = 0;
    totalsArr.forEach((v, i) => { if (v < min) { min = v; idx = i; } });
    return idx;
  }
  let max = -Infinity, idx = 0;
  totalsArr.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
  return idx;
}

/**
 * Check whether the game is over.
 *
 * @param {number[]} totalsArr - per-entity totals
 * @param {{gameMode:string, threshold:number, playerTeam?:number[], winRule:string}} ctx
 * @returns {{type:'player'|'team', idx:number}|null}
 */
export function checkWinner(totalsArr, ctx) {
  const { gameMode, threshold, playerTeam, winRule } = ctx;

  if (gameMode === 'sebeeta') {
    // First player to hit threshold loses → opposing team wins.
    for (let i = 0; i < totalsArr.length; i++) {
      if (totalsArr[i] >= threshold) {
        const loserTeam = playerTeam[i];
        return { type: 'team', idx: 1 - loserTeam };
      }
    }
    return null;
  }

  if (gameMode === 'kout') {
    // First team to reach threshold wins; ties break to the higher score.
    const reached = totalsArr
      .map((v, i) => (v >= threshold ? i : -1))
      .filter((i) => i >= 0);
    if (reached.length === 0) return null;
    let max = -Infinity, idx = -1;
    reached.forEach((i) => {
      if (totalsArr[i] > max) { max = totalsArr[i]; idx = i; }
    });
    return { type: 'team', idx };
  }

  // Custom
  if (winRule === 'highest') {
    const reached = totalsArr
      .map((v, i) => (v >= threshold ? i : -1))
      .filter((i) => i >= 0);
    if (reached.length === 0) return null;
    let max = -Infinity, idx = -1;
    reached.forEach((i) => {
      if (totalsArr[i] > max) { max = totalsArr[i]; idx = i; }
    });
    return { type: 'player', idx };
  }

  // Custom + lowest-wins: trigger when anyone reaches threshold; lowest wins.
  const anyReached = totalsArr.some((v) => v >= threshold);
  if (!anyReached) return null;
  let min = Infinity, idx = -1;
  totalsArr.forEach((v, i) => { if (v < min) { min = v; idx = i; } });
  return { type: 'player', idx };
}
