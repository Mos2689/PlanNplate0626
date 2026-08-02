/**
 * Leak gate — the repo-wide counterpart to the copy-purity unit test.
 *
 * The unit test proves lib/failure/copy.ts is clean. This proves nothing
 * ELSEWHERE reintroduces a raw error into the UI, which is how every leak in
 * the original audit happened: a screen rendering `error.message`, api-router
 * interpolating an HTTP status, auth-store returning a provider string.
 *
 * Run:  node scripts/check-failure-leaks.mjs
 * Exits non-zero (and prints file:line) when a banned pattern appears in a
 * user-facing layer.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// Only the layers a user can actually see. lib/ is allowed to touch raw errors —
// that's its job — as long as it classifies rather than renders.
const UI_DIRS = ['app', 'components'];

const RULES = [
  {
    name: 'raw error message rendered or assigned to UI state',
    // `.message` on a caught error, unless it's going into a console call.
    pattern: /\b(?:error|err|e|cause)\.message\b/g,
    allow: (line) => /console\.|\/\/|\*/.test(line),
  },
  {
    name: 'stringified error',
    pattern: /String\((?:error|err|e)\)/g,
    allow: (line) => /console\.|\/\/|\*/.test(line),
  },
  {
    name: 'banned literal "Unknown error"',
    pattern: /unknown error/gi,
    allow: (line) => /\/\/|\*/.test(line),
  },
  {
    name: 'HTTP status interpolated into a string',
    pattern: /HTTP \$\{|\bstatusText\b/g,
    allow: (line) => /console\.|\/\/|\*/.test(line),
  },
  {
    name: 'internal vendor named in a user-visible string',
    pattern: /'[^']*\b(?:Supabase|OpenAI|RevenueCat|PostHog|Pexels)\b[^']*'|"[^"]*\b(?:Supabase|OpenAI|RevenueCat|PostHog|Pexels)\b[^"]*"/g,
    // Import paths, log lines, comments and analytics keys are fine.
    allow: (line) =>
      /console\.|\/\/|\*|from '|require\(|import |track\(|\.test\.|apiCall\(|apiFormCall\(|apiDelete\(/.test(line),
  },
  {
    name: 'OS alert used for a failure',
    pattern: /Alert\.alert\(\s*['"](?:Error|Failed|Unavailable|.*Failed)['"]/g,
    allow: (line) => /\/\/|\*/.test(line),
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Track whether a line sits inside a `__DEV__` guard.
 *
 * Diagnostics behind `__DEV__` are stripped from release builds and are exactly
 * what a developer needs, so they're legitimate — ErrorBoundary keeps its stack
 * trace that way. Approximated by brace depth from the opening guard, which is
 * sufficient for the shapes that appear in this codebase.
 */
function devGuardedLines(lines) {
  const guarded = new Set();
  let depth = 0;
  let active = false;
  lines.forEach((line, i) => {
    if (!active && /\b__DEV__\b/.test(line) && /[{(]\s*$|&&/.test(line)) {
      active = true;
      depth = 0;
    }
    if (active) {
      guarded.add(i);
      depth += (line.match(/[{(]/g) ?? []).length;
      depth -= (line.match(/[})]/g) ?? []).length;
      if (depth <= 0 && i > 0) active = false;
    }
  });
  return guarded;
}

const findings = [];
for (const uiDir of UI_DIRS) {
  for (const file of walk(join(SRC, uiDir))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const guarded = devGuardedLines(lines);
    lines.forEach((line, i) => {
      if (guarded.has(i)) return;
      // Explicit, auditable escape hatch. Requires a written reason on the
      // preceding line, so every exception is visible in review rather than
      // hidden behind a heuristic:
      //   // leak-gate:allow dev-only diagnostics, guarded by __DEV__
      if (/leak-gate:allow/.test(lines[i - 1] ?? '')) return;
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line) && !rule.allow(line)) {
          findings.push({
            file: relative(ROOT, file).replace(/\\/g, '/'),
            line: i + 1,
            rule: rule.name,
            text: line.trim().slice(0, 110),
          });
        }
      }
    });
  }
}

if (findings.length === 0) {
  console.log('✓ No raw failure detail reachable from app/ or components/.');
  process.exit(0);
}

console.error(`✗ ${findings.length} potential leak(s):\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.rule}`);
  console.error(`    ${f.text}\n`);
}
process.exit(1);
