/**
 * Share game summary as a PNG.
 *
 * Two entry points:
 *   shareGameImage(state)       — full pipeline: render → Web Share / download
 *   renderGameSummaryPNG(state) — render only, returns a PNG Blob
 *
 * The renderer is self-contained: it derives everything (totals, winner,
 * standings rows) from `state` so it works both from the winner screen and
 * mid-game (mid-game suppresses the score subtitle for Sebeeta on purpose).
 *
 * Layout is 1080×1350 portrait (4:5, Instagram/WhatsApp-friendly).
 */

import { computeTotals, teamTotalsFromPlayers, checkWinner } from './scoring.js';
import { I18N } from './i18n.js';
import { withAlpha } from './util.js';

// ---------- Tiny per-state helpers ----------

function t(state, key) {
  return I18N[state.lang][key];
}

function teamName(state, i) {
  const custom = state.teamNames && state.teamNames[i] && state.teamNames[i].trim();
  if (custom) return custom;
  return i === 0 ? t(state, 'teamAFull') : t(state, 'teamBFull');
}

function _stateTotals(state) {
  const n = state.gameMode === 'kout' ? 2 : state.players.length;
  return computeTotals(state.scores, n);
}

// ---------- Public API ----------

export async function shareGameImage(state) {
  try {
    const blob = await renderGameSummaryPNG(state);
    if (!blob) throw new Error('no blob');
    const filename = `qaid-${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    // Prefer the native share sheet (WhatsApp / iMessage / etc.).
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t(state, 'shareTitle') });
        return;
      } catch (e) {
        // User cancelled — abort silently. Any other error → fall through.
        if (e && e.name === 'AbortError') return;
      }
    }

    // Desktop / unsupported: download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error('shareGameImage failed:', e);
    alert(t(state, 'shareError'));
  }
}

export async function renderGameSummaryPNG(state) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }
  const W = 1080, H = 1350;
  const isDark = state.theme === 'dark';
  const rtl = state.lang === 'ar';

  const C = isDark ? {
    bgTop: '#1a233e', bgBottom: '#0a0a0c',
    surface: 'rgba(36,36,40,0.85)',
    line:    'rgba(255,255,255,0.14)',
    ink:     '#f5f5f7',
    inkSoft: '#d6d6d8',
    muted:   '#9b9b9f',
    gold:    '#ffd60a',
    onGold:  '#1a1100',
    glow1:   'rgba(110,80,40,0.55)',
    glow2:   'rgba(40,80,140,0.5)',
  } : {
    bgTop: '#fff3d6', bgBottom: '#f0eee9',
    surface: 'rgba(255,255,255,0.92)',
    line:    'rgba(0,0,0,0.10)',
    ink:     '#0a0a0a',
    inkSoft: '#2a2a2a',
    muted:   '#6e6e72',
    gold:    '#f5b800',
    onGold:  '#1a1100',
    glow1:   'rgba(255,210,170,0.7)',
    glow2:   'rgba(150,200,255,0.55)',
  };

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // --- Background gradient + soft glow blobs ---
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, C.bgTop);
  grad.addColorStop(1, C.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  _softBlob(ctx, W * 0.82, 120, 420, C.glow1);
  _softBlob(ctx, W * 0.12, 260, 360, C.glow2);
  _softBlob(ctx, W * 0.5,  H - 140, 380, C.glow1);

  // Font helpers — fall back to system if web fonts haven't loaded yet.
  const fbody = (size, weight) => `${weight || 600} ${size}px Geist, "IBM Plex Sans Arabic", system-ui, -apple-system, sans-serif`;
  const fmono = (size, weight) => `${weight || 600} ${size}px "Geist Mono", ui-monospace, monospace`;

  const PAD = 72;
  ctx.textBaseline = 'top';
  ctx.direction = rtl ? 'rtl' : 'ltr';

  // --- Header: brand eyebrow + mode title + date ---
  ctx.textAlign = rtl ? 'right' : 'left';
  const headX = rtl ? W - PAD : PAD;

  ctx.fillStyle = C.muted;
  ctx.font = fbody(28, 600);
  const brand = rtl ? 'قيد بلوك ٣' : 'QAID · BLOCK 3';
  ctx.fillText(brand, headX, PAD);

  const modeKey = state.gameMode === 'kout' ? 'gameKout'
                : state.gameMode === 'sebeeta' ? 'gameSebeeta' : 'gameCustom';
  ctx.fillStyle = C.ink;
  ctx.font = fbody(72, 700);
  ctx.fillText(t(state, modeKey), headX, PAD + 44);

  const date = new Date().toLocaleDateString(rtl ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  ctx.textAlign = rtl ? 'left' : 'right';
  ctx.fillStyle = C.muted;
  ctx.font = fbody(24, 500);
  ctx.fillText(date, rtl ? PAD : W - PAD, PAD + 12);

  // --- Compute winner + standings ---
  const totalsArr = _stateTotals(state);
  const winner = checkWinner(totalsArr, state);

  // Build {name, score|null} entries for the players on a team. Pass
  // playerTotals=null when per-player scores aren't meaningful (Kout).
  function _teamPlayersWithScores(teamIdx, playerTotals) {
    const out = [];
    (state.playerTeam || []).forEach((tIdx, pIdx) => {
      if (tIdx === teamIdx && state.players[pIdx]) {
        out.push({
          name: state.players[pIdx],
          score: playerTotals ? playerTotals[pIdx] : null,
        });
      }
    });
    return out;
  }

  let rows = [];
  if (state.gameMode === 'kout') {
    rows = [
      { name: teamName(state, 0), score: totalsArr[0], isTeam: true, idx: 0, showHeaderScore: true,  players: _teamPlayersWithScores(0, null) },
      { name: teamName(state, 1), score: totalsArr[1], isTeam: true, idx: 1, showHeaderScore: true,  players: _teamPlayersWithScores(1, null) },
    ];
  } else if (state.gameMode === 'sebeeta') {
    const tT = teamTotalsFromPlayers(totalsArr, state.playerTeam);
    rows = [
      { name: teamName(state, 0), score: tT[0], isTeam: true, idx: 0, showHeaderScore: false, players: _teamPlayersWithScores(0, totalsArr) },
      { name: teamName(state, 1), score: tT[1], isTeam: true, idx: 1, showHeaderScore: false, players: _teamPlayersWithScores(1, totalsArr) },
    ];
  } else {
    rows = state.players.map((nm, i) => ({
      name: nm, score: totalsArr[i], isTeam: false, idx: i, showHeaderScore: true, players: [],
    }));
  }

  rows = rows.slice().sort((a, b) =>
    state.winRule === 'highest' ? (b.score - a.score) : (a.score - b.score)
  );

  // Resolve the winner card text. Sebeeta hides the numeric subtitle.
  let winnerName, winnerScoreText;
  if (winner && winner.type === 'team' && state.gameMode === 'kout') {
    winnerName = teamName(state, winner.idx);
    winnerScoreText = `${totalsArr[winner.idx]}–${totalsArr[1 - winner.idx]}`;
  } else if (winner && winner.type === 'team' && state.gameMode === 'sebeeta') {
    winnerName = teamName(state, winner.idx);
    winnerScoreText = '';
  } else if (winner && winner.type === 'team') {
    winnerName = teamName(state, winner.idx);
    winnerScoreText = String((rows.find((r) => r.idx === winner.idx) || rows[0]).score);
  } else if (winner && winner.type === 'player') {
    winnerName = state.players[winner.idx];
    winnerScoreText = String(totalsArr[winner.idx]);
  } else {
    // Mid-game: leader from rows. Sebeeta still suppresses the score subtitle.
    winnerName = rows[0].name || '—';
    winnerScoreText = state.gameMode === 'sebeeta' ? '' : String(rows[0].score);
  }

  // --- Winner card ---
  const cardX = PAD, cardY = PAD + 160;
  const cardW = W - PAD * 2, cardH = 360;
  _drawRoundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '140px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('🏆', W / 2, cardY + 32);

  ctx.fillStyle = C.ink;
  ctx.font = fbody(72, 700);
  ctx.fillText(winnerName, W / 2, cardY + 190);

  ctx.fillStyle = C.muted;
  ctx.font = fmono(40, 600);
  ctx.fillText(winnerScoreText, W / 2, cardY + 282);

  // --- Standings ---
  let listY = cardY + cardH + 60;
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.muted;
  ctx.font = fbody(22, 600);
  const eyebrow = (t(state, 'finalStandings') || 'Final Standings').toUpperCase();
  ctx.fillText(eyebrow, headX, listY);
  listY += 38;

  // Row metrics — height adapts to player count.
  const HEADER_LINE = 50;
  const PLAYER_LINE = 32;
  const ROW_PAD_TOP = 22;
  const ROW_PAD_BOT = 22;
  const SOLO_ROW_H  = 88;

  function _rowHeight(r) {
    if (!r.isTeam) return SOLO_ROW_H;
    const n = (r.players && r.players.length) || 0;
    return ROW_PAD_TOP + HEADER_LINE + (n > 0 ? n * PLAYER_LINE : 0) + ROW_PAD_BOT;
  }

  const rowGap = 14;
  let cursorY = listY;
  rows.forEach((r, i) => {
    const rh = _rowHeight(r);
    const ry = cursorY;
    cursorY += rh + rowGap;

    _drawRoundRect(ctx, PAD, ry, W - PAD * 2, rh, 26);
    ctx.fillStyle = i === 0 ? withAlpha(C.gold, 0.18) : C.surface;
    ctx.fill();
    ctx.strokeStyle = i === 0 ? withAlpha(C.gold, 0.45) : C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rank chip — anchored to the header line so it doesn't drift on tall rows.
    const chipR = 22;
    const chipCX = rtl ? W - PAD - 40 : PAD + 40;
    const chipCY = r.isTeam ? ry + ROW_PAD_TOP + HEADER_LINE / 2 : ry + rh / 2;
    ctx.beginPath();
    ctx.arc(chipCX, chipCY, chipR, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? C.gold : withAlpha(C.ink, 0.10);
    ctx.fill();
    ctx.fillStyle = i === 0 ? C.onGold : C.ink;
    ctx.font = fbody(22, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), chipCX, chipCY + 1);

    ctx.textAlign = rtl ? 'right' : 'left';
    const nameX     = rtl ? W - PAD - 80 : PAD + 80;
    const scoreEdge = rtl ? PAD + 28      : W - PAD - 28;

    if (r.isTeam) {
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.ink;
      ctx.font = fbody(34, 700);
      ctx.fillText(r.name || '—', nameX, chipCY);

      if (r.showHeaderScore) {
        ctx.textAlign = rtl ? 'left' : 'right';
        ctx.fillStyle = C.inkSoft;
        ctx.font = fmono(36, 600);
        ctx.fillText(String(r.score), scoreEdge, chipCY);
      }

      if (r.players && r.players.length > 0) {
        // Faint divider between team header and player list.
        ctx.beginPath();
        const divY = ry + ROW_PAD_TOP + HEADER_LINE;
        ctx.moveTo(PAD + 28, divY);
        ctx.lineTo(W - PAD - 28, divY);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.stroke();

        r.players.forEach((p, pi) => {
          const py = ry + ROW_PAD_TOP + HEADER_LINE + (pi + 0.5) * PLAYER_LINE;
          ctx.textAlign = rtl ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.inkSoft;
          ctx.font = fbody(22, 500);
          ctx.fillText(p.name || '—', nameX, py);
          if (p.score !== null && p.score !== undefined) {
            ctx.textAlign = rtl ? 'left' : 'right';
            ctx.fillStyle = C.muted;
            ctx.font = fmono(22, 600);
            ctx.fillText(String(p.score), scoreEdge, py);
          }
        });
      }
    } else {
      // Solo row (Custom): single line, name + score.
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.ink;
      ctx.font = fbody(34, 600);
      ctx.fillText(r.name || '—', nameX, ry + rh / 2);
      ctx.textAlign = rtl ? 'left' : 'right';
      ctx.fillStyle = C.inkSoft;
      ctx.font = fmono(36, 600);
      ctx.fillText(String(r.score), scoreEdge, ry + rh / 2);
    }
  });

  // --- Footer: rounds played ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = C.muted;
  ctx.font = fbody(24, 500);
  const footer = t(state, 'roundsPlayed')
    ? t(state, 'roundsPlayed')(state.scores.length)
    : `${state.scores.length} rounds`;
  ctx.fillText(footer, W / 2, H - PAD);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

// ---------- Canvas primitives ----------

function _drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _softBlob(ctx, cx, cy, radius, color) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}
