/**
 * Tiny test harness for the browser. No deps.
 *
 *   group('name')      — start a section
 *   test('name', fn)   — register a test; fn is called with `t` (asserts)
 *
 * Asserts inside the test fn:
 *   t.eq(actual, expected)        — deep equality (JSON-stringify compare)
 *   t.is(actual, expected)        — strict ===
 *   t.truthy(v)
 *   t.throws(fn)
 *
 * Call _runAll() once everything is registered. Results render into
 * #summary and #results in runner.html.
 */

const _cases = [];
let _currentGroup = '(default)';

export function group(name) {
  _currentGroup = name;
}

export function test(name, fn) {
  _cases.push({ group: _currentGroup, name, fn });
}

function _mkAsserts() {
  const failures = [];
  return {
    failures,
    eq(actual, expected, msg) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) failures.push((msg || 'eq') + `\n  expected: ${e}\n  actual:   ${a}`);
    },
    is(actual, expected, msg) {
      if (actual !== expected) failures.push((msg || 'is') + `\n  expected: ${expected}\n  actual:   ${actual}`);
    },
    truthy(v, msg) {
      if (!v) failures.push((msg || 'truthy') + `\n  value: ${v}`);
    },
    throws(fn, msg) {
      let threw = false;
      try { fn(); } catch (_) { threw = true; }
      if (!threw) failures.push((msg || 'throws') + ' — did not throw');
    },
  };
}

export function _runAll() {
  const root = document.getElementById('results');
  const summary = document.getElementById('summary');
  let passed = 0;
  let failed = 0;
  let lastGroup = null;

  for (const c of _cases) {
    if (c.group !== lastGroup) {
      const g = document.createElement('div');
      g.className = 'group';
      g.textContent = c.group;
      root.appendChild(g);
      lastGroup = c.group;
    }
    const a = _mkAsserts();
    let runtimeError = null;
    try {
      c.fn(a);
    } catch (e) {
      runtimeError = (e && e.stack) || String(e);
    }
    const ok = !runtimeError && a.failures.length === 0;
    const row = document.createElement('div');
    row.className = 'case ' + (ok ? 'pass' : 'fail');
    row.innerHTML = `<span class="badge"></span><span class="name"></span>`;
    row.querySelector('.name').textContent = c.name;
    if (!ok) {
      const diff = document.createElement('div');
      diff.className = 'diff';
      diff.textContent = runtimeError
        ? `runtime: ${runtimeError}`
        : a.failures.join('\n\n');
      row.appendChild(diff);
    }
    root.appendChild(row);
    if (ok) passed++; else failed++;
  }

  summary.className = 'summary ' + (failed === 0 ? 'pass' : 'fail');
  summary.textContent = failed === 0
    ? `All ${passed} tests passed.`
    : `${failed} of ${passed + failed} failed.`;
}
