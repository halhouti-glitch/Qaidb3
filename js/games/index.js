/**
 * Game registry — single source of truth for game metadata. The home grid,
 * setup screen, and `startGame()` defaults all read from here so that adding
 * a new game (Baloot, Trix, Hand, …) is a single-file change instead of a
 * hunt through index.html.
 *
 * What lives here:
 *   - identity         (key, i18n labels, art template id)
 *   - shape            (isTeamMode, teamSize, numPlayers, scoreScope)
 *   - defaults         (threshold, winRule)
 *   - setup UI flags   (configurable threshold/winRule, contracts UI)
 *
 * What does NOT live here:
 *   - scoring math     → js/scoring.js (still switches on `gameMode` string)
 *   - share rendering  → js/share.js   (same)
 *   - play-screen UI   → index.html `renderPlay` (same)
 *
 * Those layers continue to switch on the `key` string. The registry just
 * means the *home/setup* layer no longer hardcodes which keys exist.
 */

export const GAMES = {
  sebeeta: {
    key: 'sebeeta',
    // i18n keys (resolved at render time so language switches still work)
    i18nKey:  'gameSebeeta',
    descKey:  'gameSebeetaDesc',
    metaKey:  'gameSebeetaMeta',
    hintKey:  'sebeetaHint',
    // Art template lives in index.html as `<template id="art-sebeeta">`
    artId: 'art-sebeeta',
    // Defaults applied by startGame() when this mode is picked
    defaultThreshold: 201,
    winRule: 'lowest',
    // Shape
    isTeamMode: true,
    teamSize: 3,
    numPlayers: 6,
    scoreScope: 'player', // scores[] is per-player; team totals derived
    // Setup UI flags
    configurable: false,  // threshold + winRule are fixed
    contractsEnabled: false,
  },
  kout: {
    key: 'kout',
    i18nKey:  'gameKout',
    descKey:  'gameKoutDesc',
    metaKey:  'gameKoutMeta',
    hintKey:  'koutHint',
    artId: 'art-kout',
    defaultThreshold: 101,
    winRule: 'highest',
    isTeamMode: true,
    teamSize: 3,
    numPlayers: 6,
    scoreScope: 'team',   // only 2 entries in scores[] (one per team)
    configurable: false,
    contractsEnabled: true,
  },
  custom: {
    key: 'custom',
    i18nKey:  'gameCustom',
    descKey:  'gameCustomDesc',
    metaKey:  'gameCustomMeta',
    hintKey:  null,
    artId: 'art-custom',
    defaultThreshold: 201,
    winRule: 'highest',
    isTeamMode: false,
    teamSize: null,
    numPlayers: null,     // user-chosen 2–6
    scoreScope: 'player',
    configurable: true,   // setup screen exposes threshold + winRule
    contractsEnabled: false,
  },
};

/** Display order on the home grid. */
export const GAME_ORDER = ['sebeeta', 'kout', 'custom'];

/** Lookup helper. Returns `null` for unknown keys so callers can guard. */
export function getGame(key) {
  return GAMES[key] || null;
}

/** Convenience: does this mode use the team-scoring UI? */
export function isTeamMode(key) {
  return !!GAMES[key]?.isTeamMode;
}

/** Convenience: how many score entries per round for this mode. */
export function scoreEntityCount(key, playerCount) {
  const g = GAMES[key];
  if (!g) return playerCount;
  return g.scoreScope === 'team' ? 2 : playerCount;
}
