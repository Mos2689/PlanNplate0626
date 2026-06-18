/**
 * generate-blurhashes.ts — one-time offline tooling.
 *
 * Walks every curated-plan and recipe-bank data file, fetches each `imageUrl`
 * once, computes a small (4×3 component) blurhash, and writes the result back
 * into the source file as a new `blurhash` field next to `imageUrl`.
 *
 * Why offline: blurhash generation needs the image bytes + a decoder. At
 * runtime we want the hash already embedded so the placeholder paints in the
 * very first frame; computing client-side would defeat the point.
 *
 * Setup (one-time, devDeps only — neither package ships to the app binary):
 *   bun add -d blurhash sharp tsx
 *
 * Run:
 *   bunx tsx scripts/generate-blurhashes.ts            # incremental, skips images already done
 *   bunx tsx scripts/generate-blurhashes.ts --force    # regenerate everything
 *
 * After it finishes, commit the modified data files. The DishImage wrapper
 * picks up the new `blurhash` field automatically — no further code changes
 * required for the hashes to start painting.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encode } from 'blurhash';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = resolve(__dirname, '..', 'src', 'lib');

// Every file the walker should scan + rewrite.
const DATA_FILES = [
  'curated-meal-plans.ts',
  'vegetarian-plan.ts',
  'high-protein-plan.ts',
  'light-easy-plan.ts',
  'family-budget-plan.ts',
  'solo-active-plan.ts',
];

// Match an `imageUrl:` literal. Captures the URL string itself so we can fetch
// it. The regex deliberately allows whitespace + multi-line so it handles
// formatted source files (incl. `imageUrl: IMG + 'foo.png'` style).
const IMAGE_URL_RE = /imageUrl:\s*(?:IMG\s*\+\s*)?['"`]([^'"`]+)['"`]/g;

// Detects whether a `blurhash:` field already follows an `imageUrl:` so we
// can skip in incremental mode. Scoped to the next 2 lines after the URL.
function hasNearbyBlurhash(source: string, urlEndIdx: number): boolean {
  const lookahead = source.slice(urlEndIdx, urlEndIdx + 200);
  return /blurhash:\s*['"`]/.test(lookahead);
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function computeBlurhash(url: string): Promise<string> {
  const bytes = await fetchImageBytes(url);
  // Resize to a small canvas — blurhash is computed on the downsampled image
  // so detail is wasted; 32×32 is plenty for a 4×3 component hash.
  const { data, info } = await sharp(bytes)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'cover' })
    .toBuffer({ resolveWithObject: true });

  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4, // componentX — horizontal complexity
    3, // componentY — vertical complexity
  );
}

// Resolve `IMG + 'foo.png'` patterns to absolute URLs by reading the file's
// `const IMG = '…'` declaration once per file.
function findImgConst(source: string): string | null {
  const m = source.match(/const\s+IMG\s*=\s*['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

// Replace one specific imageUrl occurrence (by absolute char index) with the
// same line plus an inserted `blurhash: '...'` field. The insertion point is
// the comma/newline immediately after the URL literal closes.
function injectBlurhash(source: string, afterIdx: number, hash: string): string {
  // Find the comma that terminates the imageUrl field.
  const rest = source.slice(afterIdx);
  const commaIdx = rest.search(/,/);
  if (commaIdx === -1) return source;
  const insertAt = afterIdx + commaIdx + 1;
  // Detect indent from the line that holds the URL.
  const lineStart = source.lastIndexOf('\n', afterIdx) + 1;
  const indentMatch = source.slice(lineStart, afterIdx).match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '    ';
  return `${source.slice(0, insertAt)}\n${indent}blurhash: '${hash}',${source.slice(insertAt)}`;
}

async function processFile(filename: string, force: boolean): Promise<number> {
  const path = resolve(LIB_DIR, filename);
  let source = readFileSync(path, 'utf8');
  const imgBase = findImgConst(source);
  let updatedCount = 0;

  // Collect work in a first pass so we can mutate the source from the end
  // backwards (preserving offsets for earlier matches).
  const tasks: Array<{ urlEndIdx: number; absoluteUrl: string }> = [];
  let m: RegExpExecArray | null;
  IMAGE_URL_RE.lastIndex = 0;
  while ((m = IMAGE_URL_RE.exec(source)) !== null) {
    const urlEndIdx = m.index + m[0].length;
    if (!force && hasNearbyBlurhash(source, urlEndIdx)) continue;
    // Resolve the URL — either fully qualified, or relative to IMG.
    const captured = m[1];
    const absoluteUrl =
      captured.startsWith('http') ? captured : (imgBase ? imgBase + captured : captured);
    tasks.push({ urlEndIdx, absoluteUrl });
  }

  // Run sequentially to be polite to the bucket. Could be parallelised if
  // it becomes too slow (5 plans × ~25 images each = 125 reqs at ~300ms each
  // = ~40s, acceptable for an offline pass).
  const results = new Map<number, string>();
  for (const t of tasks) {
    try {
      process.stdout.write(`  · ${t.absoluteUrl} `);
      const hash = await computeBlurhash(t.absoluteUrl);
      results.set(t.urlEndIdx, hash);
      console.log(`→ ${hash}`);
    } catch (err) {
      console.warn(`! failed: ${(err as Error).message}`);
    }
  }

  // Apply mutations from the end of the file backwards so earlier indices
  // remain valid.
  const ordered = Array.from(results.entries()).sort((a, b) => b[0] - a[0]);
  for (const [idx, hash] of ordered) {
    source = injectBlurhash(source, idx, hash);
    updatedCount++;
  }

  writeFileSync(path, source, 'utf8');
  return updatedCount;
}

async function main() {
  const force = process.argv.includes('--force');
  console.log(`generate-blurhashes — ${force ? 'FORCE re-gen' : 'incremental'}`);

  let total = 0;
  for (const file of DATA_FILES) {
    console.log(`\n${file}`);
    try {
      const count = await processFile(file, force);
      total += count;
      console.log(`  ✓ ${count} hashes written`);
    } catch (err) {
      console.error(`  ✗ ${(err as Error).message}`);
    }
  }
  console.log(`\nDone. Total: ${total} hashes written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
