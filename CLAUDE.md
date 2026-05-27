# Qaid — Project Notes for Claude

Card game score tracker. Single-file vanilla web app, bilingual (Arabic/English),
deployed to Netlify via GitHub at https://github.com/halhouti-glitch/Qaidb3.

## File layout

```
index.html              ~3.2K lines — HTML shell + CSS + main script (ES module)
manifest.webmanifest    PWA manifest
sw.js                   Service worker (cache version qaid-v2)
icon.svg / *.png        Q-of-hearts on navy app icons
js/
  i18n.js               Translations (EN + AR)
  scoring.js            Pure: computeTotals, checkWinner, dealerIndex, contracts
  share.js              Canvas-based share-as-PNG renderer
  util.js               escapeHtml, withAlpha
test/
  runner.html           Open in browser at /test/runner.html to run tests
  harness.js            Tiny zero-dep test harness
  scoring.test.js       52 tests covering all scoring math
design/                 (gitignored) — generate-icons.ps1, share previews, SVG sources
.claude/                (gitignored) — launch.json for preview server
```

## State shape (localStorage key `cardScoreTracker_v1`)

```js
{
  gameMode: 'sebeeta' | 'kout' | 'custom',
  players: [],
  playerTeam: [],       // team idx per player (sebeeta/kout)
  teamNames: [],
  scores: [],           // per-round arrays (per-player or per-team)
  threshold, winRule,   // 'highest' | 'lowest'
  gameOver, gameLogged, // gameLogged is a one-time latch — MUST reset on new game
  lang, theme, sound,
  koutEntryMode,        // 'contract' | 'manual'
  entryStyle,           // 'pm' (Bulk) | 'numpad' — for Sebeeta + Custom
  currentScreen,
  recentGames: [],      // last 10 finished games (incl. playerTeam)
  playerProfiles: {     // keyed by name.toLowerCase().trim()
    [key]: { name, gamesPlayed, wins, lastPlayed, teammates: {} }
  },
}
```

## Game-specific scoring quirks

- **Custom**: per-player, threshold-based, winner = highest or lowest depending on winRule.
- **Sebeeta**: per-PLAYER scoring, threshold 201, winRule=lowest. When ANY player hits
  threshold, their team LOSES — `checkWinner` returns the OPPOSING team.
- **Kout**: per-TEAM scoring (only 2 entries in `scores[]`), threshold 101, winRule=highest.
  No per-player score is tracked — contracts pay the team. Tie at threshold breaks to higher.

## Module pattern (important)

The main script in `index.html` is `<script type="module">`, so:
- Everything inside is module-scoped, NOT global
- `state` is NOT accessible from browser console / `preview_eval` directly —
  read `localStorage.getItem('cardScoreTracker_v1')` and JSON.parse instead
- Any function called from inline `onclick="..."` HTML attributes MUST be added
  to the `Object.assign(window, { ... })` block near the end of `index.html`
- Functions wired via `el.onclick = () => fn()` don't need window exposure (closures)

## How to run / test

```bash
# Local server (Python is installed; no Node):
python -m http.server 8765
# App:  http://localhost:8765/
# Tests: http://localhost:8765/test/runner.html
```

Preview MCP is configured in `.claude/launch.json` for port 8765.
- `preview_screenshot` often times out (Google Fonts hang) — rely on `preview_eval`
- Large eval returns (>~1MB, e.g. share PNG base64) get auto-saved to a temp file;
  decode via PowerShell `[System.Convert]::FromBase64String(...)`

## iOS PWA gotchas

- `viewport-fit=cover` + `env(safe-area-inset-*)` to clear status bar / Dynamic Island
- `touch-action: manipulation` on buttons (already global in `button {}` rule) kills
  the 300ms double-tap-to-zoom delay
- Web Audio needs first user gesture before sound plays (handled — context lazy-inits)
- `apple-mobile-web-app-status-bar-style: black-translucent` extends content behind status bar

## Gotchas that bit us

- `state.gameLogged` is a one-time latch. `startGame()` must reset it or the next
  game's winner screen silently never appears.
- Numpad mode has NO `roundScore*` inputs — it has a `numpadValues` array + `numpadBuffer`.
  `submitRound` must route numpad mode through its own commit path.
- Sebeeta `checkWinner` returns the OPPOSING team idx, not the player who hit threshold.
- Excel destroys UTF-8 BOM on CSV save — Arabic content turns to literal `?`. Always
  write CSVs with `New-Object System.Text.UTF8Encoding($true)`.
- Per-player team chip in player tiles was removed (Sebeeta) — don't re-add unless asked.

## Done this session

- **Tier A**: PWA install, undo toast, share-as-PNG, haptics/sounds, screen transitions
- **Tier E**: Split into ES modules (scoring, i18n, share, util) + 52 scoring tests
- **Tier B (partial)**: Player profiles — data layer + typeahead + home strip + profile sheet
- **History clear UI**: per-section "Clear" links + per-item × on recent games + Remove in profile sheet
- **Bug fixes**: Sebeeta winner score, Kout winner after prior game, numpad save, iOS safe area,
  numpad lag + zoom

## Planned: Add Baloot + Trix (next session)

**Step 0** — Pluggable game registry at `js/games/index.js`. Each game declares
metadata: `{ key, i18nKey, art, defaultThreshold, winRule, isTeamMode, teamSize,
defaultPlayers, hint }`. Refactor home grid + setup + startGame to read from registry
instead of hardcoded `if (gameMode === ...)` chains. ~1 hr.

**Phase 1 — both games as score trackers**:
- **Baloot**: 4 players, 2 teams of 2 (partners across), threshold 152 (configurable
  152/252/552), winRule=highest. Mechanically = Kout without contracts.
- **Trix**: 4 players, individual scoring, configurable threshold, winRule=highest.
  Mechanically = Custom with fixed 4 players + dedicated art.
- New i18n entries + SVG art for each.
- ~3 hrs total.

**Phase 2 (later)** — game-specific depth:
- Baloot: belote helper (+20), sequence helper (+20/+50/+100), trump selector
- Trix: kingdom tracker (4 kings × 5 contracts grid), auto-rotation

## Remaining roadmap

- **Tier B continued**: per-game stats screen (line chart, biggest swing, longest streak)
- **Tier C**: Hand (third Kuwaiti/Levantine game) after Baloot+Trix prove the registry
- **Tier D**: custom domain, backup/restore (JSON export), Supabase cloud sync,
  Capacitor wrapper for App Store
- **Polish**: settings sheet (consolidate theme/sound/lang behind gear icon),
  round timestamps, rematch button

## Recent commits (most recent first)

- `f196896` History clear: per-section + per-item controls
- `0c463b9` Tier B: player profiles (lifetime stats + typeahead + home strip)
- `dfef4ab` Remove team badge from Sebeeta player tiles
- `f77de17` Tier E: split pure logic into ES modules + add scoring tests
- `810217c` Fix numpad lag + iOS double-tap zoom
- `8c79809` Fix PWA header overlap with iOS status bar / Dynamic Island
- `03e7c48` Tier A: PWA + undo toast + share-as-PNG + haptics/sound + screen transitions
