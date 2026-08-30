/**
 * Curl-backed recovery for the seven variants interrupted during the initial
 * full-library run on 2026-08-29. Node's fetch transport became unavailable,
 * while direct HTTPS remained healthy. This script is deliberately narrow,
 * idempotent, and never deletes or overwrites an object.
 */

import { spawn } from "node:child_process";
import sharp from "sharp";

const PROJECT_HOST = "wcjsrhdlnmfugdjtvadj.supabase.co";
const BASE = `https://${PROJECT_HOST}/storage/v1/object`;

const RECOVERY = [
  { bucket: "NewRecipeImages", source: "coq_au_vin.png", widths: [1200] },
  { bucket: "Recipe Images", source: "fish_chips_night.png", widths: [1200] },
  {
    bucket: "Recipe Images",
    source: "microwave_scrambled_eggs.png",
    widths: [800, 1200],
  },
  {
    bucket: "Recipe Images",
    source: "oatmeal_with_cinnamon_sugar.png",
    widths: [340, 800, 1200],
  },
] as const;

const QUALITY: Record<number, number> = { 340: 75, 800: 78, 1200: 82 };

function encoded(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function publicUrl(bucket: string, path: string): string {
  return `${BASE}/public/${encodeURIComponent(bucket)}/${encoded(path)}`;
}

function uploadUrl(bucket: string, path: string): string {
  return `${BASE}/${encodeURIComponent(bucket)}/${encoded(path)}`;
}

function variantPath(source: string, width: number): string {
  return `_optimized/v1/${width}/${source.replace(/\.[^./]+$/, "")}.webp`;
}

async function curl(
  args: string[],
  input?: Buffer,
  allowFailure = false,
): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const child = spawn("curl.exe", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout);
      if (code === 0 || allowFailure) return resolve(output);
      const message = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(message || `curl exited with code ${code}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function exists(url: string): Promise<boolean> {
  const status = (
    await curl(
      ["-sS", "-o", "NUL", "-w", "%{http_code}", "-I", url],
      undefined,
      true,
    )
  )
    .toString("utf8")
    .trim();
  if (status === "200") return true;
  // Supabase Storage returns 400 (rather than 404) for a missing public object
  // when the object key is valid but absent.
  if (status === "400" || status === "404") return false;
  throw new Error(`Unexpected public object status ${status || "<empty>"}`);
}

async function run(): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configuredUrl = process.env.SUPABASE_URL;
  if (!key || !configuredUrl)
    throw new Error("Missing local pipeline credentials.");
  if (new URL(configuredUrl).hostname !== PROJECT_HOST) {
    throw new Error("Refusing to operate on an unexpected Supabase project.");
  }

  let uploaded = 0;
  let skipped = 0;

  for (const item of RECOVERY) {
    const pending: number[] = [];
    for (const width of item.widths) {
      const destination = variantPath(item.source, width);
      if (await exists(publicUrl(item.bucket, destination))) skipped++;
      else pending.push(width);
    }
    if (!pending.length) continue;

    const original = await curl(["-fsSL", publicUrl(item.bucket, item.source)]);
    for (const width of pending) {
      const output = await sharp(original)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY[width], effort: 4 })
        .toBuffer();
      const destination = variantPath(item.source, width);
      await curl(
        [
          "-fsS",
          "-X",
          "POST",
          uploadUrl(item.bucket, destination),
          "-H",
          `Authorization: Bearer ${key}`,
          "-H",
          `apikey: ${key}`,
          "-H",
          "Content-Type: image/webp",
          "-H",
          "Cache-Control: max-age=31536000",
          "-H",
          "x-upsert: false",
          "--data-binary",
          "@-",
        ],
        output,
      );
      uploaded++;
      console.log(`Uploaded ${item.bucket}/${destination}`);
    }
  }

  console.log(
    `Recovery complete: ${uploaded} uploaded, ${skipped} already present.`,
  );
}

run().catch((error) => {
  console.error(
    `Variant recovery failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
