/**
 * Smoke tests for the scoring math in js/scoring.js.
 *
 * Covers the cases that would silently corrupt a real game if broken:
 *   - per-player vs per-team totals
 *   - the asymmetric Sebeeta rule (player crosses → opposing team wins)
 *   - Kout tie-break (both teams cross threshold same round → higher wins)
 *   - every contract level × outcome → score table
 *   - dealer = opposite of winRule (highest wins → lowest is dealer, etc.)
 */

import {
  KOUT_CONTRACT_SCORES,
  KOUT_LEVELS,
  computeContractScore,
  computeTotals,
  teamTotalsFromPlayers,
  dealerIndex,
  checkWinner,
} from '../js/scoring.js';

import { group, test } from './harness.js';

// =====================================================================
group('computeTotals');
// =====================================================================

test('sums per-entity scores across rounds', (t) => {
  const scores = [[10, 20, 30], [5, 0, 15]];
  t.eq(computeTotals(scores, 3), [15, 20, 45]);
});

test('returns zeros when scores is empty', (t) => {
  t.eq(computeTotals([], 4), [0, 0, 0, 0]);
});

test('treats missing slots as zero', (t) => {
  // Rare but possible: partially-filled round
  const scores = [[10, 20], [5]];
  t.eq(computeTotals(scores, 2), [15, 20]);
});

test('handles negative values (Sebeeta -10 minus button)', (t) => {
  const scores = [[10, 10, 10], [-10, 5, -10]];
  t.eq(computeTotals(scores, 3), [0, 15, 0]);
});

// =====================================================================
group('teamTotalsFromPlayers');
// =====================================================================

test('rolls up per-player totals into per-team totals', (t) => {
  const playerTotals = [10, 20, 30, 40];
  const playerTeam = [0, 1, 0, 1]; // A=10+30=40, B=20+40=60
  t.eq(teamTotalsFromPlayers(playerTotals, playerTeam), [40, 60]);
});

test('3v3 layout used in Sebeeta', (t) => {
  const totals = [50, 60, 70, 80, 90, 100];
  const teams  = [0, 1, 0, 1, 0, 1]; // A=50+70+90=210, B=60+80+100=240
  t.eq(teamTotalsFromPlayers(totals, teams), [210, 240]);
});

// =====================================================================
group('dealerIndex');
// =====================================================================

test('winRule=highest → dealer is the lowest score', (t) => {
  t.eq(dealerIndex([50, 80, 30, 90], 'highest'), 2);
});

test('winRule=lowest → dealer is the highest score', (t) => {
  t.eq(dealerIndex([50, 80, 30, 90], 'lowest'), 3);
});

test('ties take the first-seen index', (t) => {
  t.eq(dealerIndex([50, 50, 50], 'highest'), 0);
  t.eq(dealerIndex([50, 50, 50], 'lowest'), 0);
});

test('empty input returns -1', (t) => {
  t.eq(dealerIndex([], 'highest'), -1);
});

// =====================================================================
group('computeContractScore (Kout)');
// =====================================================================

test('returns [0,0] when incomplete', (t) => {
  t.eq(computeContractScore(null, null, null), [0, 0]);
  t.eq(computeContractScore(0, null, 'made'),  [0, 0]);
  t.eq(computeContractScore(0, 'bab', null),   [0, 0]);
});

test('unknown level returns [0,0]', (t) => {
  t.eq(computeContractScore(0, 'noSuchLevel', 'made'), [0, 0]);
});

// Every level × outcome, both callers — these are the numbers that decide games.
for (const level of KOUT_LEVELS) {
  const cfg = KOUT_CONTRACT_SCORES[level];
  test(`${level} made by team A → [${cfg.made}, 0]`, (t) => {
    t.eq(computeContractScore(0, level, 'made'), [cfg.made, 0]);
  });
  test(`${level} made by team B → [0, ${cfg.made}]`, (t) => {
    t.eq(computeContractScore(1, level, 'made'), [0, cfg.made]);
  });
  test(`${level} failed by team A → [0, ${cfg.failed}]`, (t) => {
    t.eq(computeContractScore(0, level, 'failed'), [0, cfg.failed]);
  });
  test(`${level} failed by team B → [${cfg.failed}, 0]`, (t) => {
    t.eq(computeContractScore(1, level, 'failed'), [cfg.failed, 0]);
  });
}

test('Malzoom is symmetric: same number both directions', (t) => {
  const cfg = KOUT_CONTRACT_SCORES.malzoom;
  t.is(cfg.made, cfg.failed, 'malzoom made/failed should be equal');
});

// =====================================================================
group('checkWinner — Custom');
// =====================================================================

const custom = (winRule, threshold = 100) => ({
  gameMode: 'custom', winRule, threshold,
});

test('custom + highest: returns player who crossed threshold', (t) => {
  t.eq(checkWinner([60, 105, 90], custom('highest')), { type: 'player', idx: 1 });
});

test('custom + highest: ties → highest score wins', (t) => {
  t.eq(checkWinner([105, 100, 110], custom('highest')), { type: 'player', idx: 2 });
});

test('custom + highest: no one reached → null', (t) => {
  t.eq(checkWinner([50, 80, 30], custom('highest')), null);
});

test('custom + lowest: anyone reaches → lowest player wins', (t) => {
  t.eq(checkWinner([95, 105, 60], custom('lowest')), { type: 'player', idx: 2 });
});

test('custom + lowest: nobody reached → null', (t) => {
  t.eq(checkWinner([50, 80, 30], custom('lowest')), null);
});

// =====================================================================
group('checkWinner — Sebeeta');
// =====================================================================

const sebeeta = (playerTeam, threshold = 201) => ({
  gameMode: 'sebeeta',
  winRule: 'lowest',
  threshold,
  playerTeam,
});

test('player on team A crosses 201 → team B wins', (t) => {
  const totals = [205, 100, 90, 60];
  const teams  = [0, 1, 0, 1];
  t.eq(checkWinner(totals, sebeeta(teams)), { type: 'team', idx: 1 });
});

test('player on team B crosses 201 → team A wins', (t) => {
  const totals = [100, 205, 90, 60];
  const teams  = [0, 1, 0, 1];
  t.eq(checkWinner(totals, sebeeta(teams)), { type: 'team', idx: 0 });
});

test('threshold exactly hit (201) still triggers', (t) => {
  const totals = [201, 100, 90, 60];
  const teams  = [0, 1, 0, 1];
  t.eq(checkWinner(totals, sebeeta(teams)), { type: 'team', idx: 1 });
});

test('nobody reached → null', (t) => {
  t.eq(checkWinner([100, 100, 100, 100], sebeeta([0, 1, 0, 1])), null);
});

// =====================================================================
group('checkWinner — Kout');
// =====================================================================

const kout = (threshold = 101) => ({
  gameMode: 'kout', winRule: 'highest', threshold,
});

test('team A reaches 101 → team A wins', (t) => {
  t.eq(checkWinner([105, 80], kout()), { type: 'team', idx: 0 });
});

test('team B reaches 101 → team B wins', (t) => {
  t.eq(checkWinner([80, 105], kout()), { type: 'team', idx: 1 });
});

test('exact 101 still triggers', (t) => {
  t.eq(checkWinner([101, 50], kout()), { type: 'team', idx: 0 });
});

test('tie at threshold same round → higher score wins', (t) => {
  // Both crossed; team B is higher
  t.eq(checkWinner([108, 120], kout()), { type: 'team', idx: 1 });
});

test('tie when both crossed AND scores equal → first-seen wins', (t) => {
  t.eq(checkWinner([105, 105], kout()), { type: 'team', idx: 0 });
});

test('nobody reached → null', (t) => {
  t.eq(checkWinner([50, 80], kout()), null);
});
