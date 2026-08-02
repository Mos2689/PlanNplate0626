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
// Reuses the app's own transform helper so the script and the runtime agree on
// exactly how a bucket URL becomes a resized URL.
import { optimizedImageUrl } from '../src/lib/supabase-image';

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
  // The 736-recipe Get Inspired bank. Written as one JSON object per line, so
  // it needs the JSON-style match + injection paths below — a TS-style
  // `blurhash: '...'` on its own line would break `check_inspired_alignment.py`,
  // which JSON.parses each recipe line.
  'inspired-recipe-library.ts',
];

// Match an `imageUrl:` literal. Captures the URL string itself so we can fetch
// it. The regex deliberately allows whitespace + multi-line so it handles
// formatted source files (incl. `imageUrl: IMG + 'foo.png'` style).
// Group 1 = JSON style (`"imageUrl":"…"`, the recipe library).
// Group 2 = TS object style (`imageUrl: '…'` or `imageUrl: IMG + '…'`, the plans).
const IMAGE_URL_RE =
  /"imageUrl"\s*:\s*"([^"]+)"|imageUrl:\s*(?:IMG\s*\+\s*)?['"`]([^'"`]+)['"`]/g;

// Detects whether a `blurhash:` field already follows an `imageUrl:` so we
// can skip in incremental mode. Scoped to the next 2 lines after the URL.
function hasNearbyBlurhash(source: string, urlEndIdx: number): boolean {
  const lookahead = source.slice(urlEndIdx, urlEndIdx + 200);
  return /blurhash:\s*['"`]|"blurhash"\s*:\s*"/.test(lookahead);
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function computeBlurhash(url: string): Promise<string> {
  // Fetch the 32px TRANSFORM, not the raw original. A recipe PNG in the bucket
  // is 1.5–2.1 MB; the 32px WebP is ~1.5 KB. blurhash downsamples to 32×32
  // anyway (see the resize below), so the output hash is identical either way —
  // but across 736 recipes this is ~1.5 MB of traffic instead of ~1.3 GB.
  // Falls back to the original URL for hosts we can't resize.
  const fetchUrl = optimizedImageUrl(url, { width: 32, quality: 60 });
  const bytes = await fetchImageBytes(fetchUrl);
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
function injectBlurhash(
  source: string,
  afterIdx: number,
  hash: string,
  json: boolean,
): string {
  if (json) {
    // JSON style: splice `,"blurhash":"…"` in immediately after the imageUrl
    // value, ON THE SAME LINE. The recipe library is one JSON object per line
    // and scripts/check_inspired_alignment.py JSON.parses each of those lines —
    // a newline or a single-quoted TS field here would break that guard.
    return `${source.slice(0, afterIdx)},"blurhash":"${hash}"${source.slice(afterIdx)}`;
  }
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
  const tasks: Array<{ urlEndIdx: number; absoluteUrl: string; json: boolean }> = [];
  let m: RegExpExecArray | null;
  IMAGE_URL_RE.lastIndex = 0;
  while ((m = IMAGE_URL_RE.exec(source)) !== null) {
    const urlEndIdx = m.index + m[0].length;
    if (!force && hasNearbyBlurhash(source, urlEndIdx)) continue;
    // Group 1 = JSON style, group 2 = TS object style. Which one matched tells
    // us how to write the hash back.
    const json = m[1] !== undefined;
    const captured = json ? m[1] : m[2];
    if (!captured) continue;
    // Resolve the URL — either fully qualified, or relative to IMG.
    const absoluteUrl =
      captured.startsWith('http') ? captured : (imgBase ? imgBase + captured : captured);
    tasks.push({ urlEndIdx, absoluteUrl, json });
  }

  // Bounded concurrency. Each request is now ~1.5 KB (the 32px transform), so
  // the bucket isn't stressed, but 736 sequential round trips at ~300 ms would
  // still be ~4 minutes of pure latency. Eight at a time keeps it under a minute.
  const CONCURRENCY = 8;
  const results = new Map<number, { hash: string; json: boolean }>();
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const t = tasks[cursor++];
      if (!t) return;
      try {
        const hash = await computeBlurhash(t.absoluteUrl);
        results.set(t.urlEndIdx, { hash, json: t.json });
      } catch (err) {
        console.warn(`  ! failed ${t.absoluteUrl}: ${(err as Error).message}`);
      }
      done++;
      if (done % 50 === 0 || done === tasks.length) {
        console.log(`  · ${done}/${tasks.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Apply mutations from the end of the file backwards so earlier indices
  // remain valid.
  const ordered = Array.from(results.entries()).sort((a, b) => b[0] - a[0]);
  for (const [idx, { hash, json }] of ordered) {
    source = injectBlurhash(source, idx, hash, json);
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
