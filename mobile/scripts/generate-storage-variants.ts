/**
 * Generate immutable WebP variants without using Supabase Image Transformations.
 *
 * Safe defaults:
 * - dry-run unless --apply is present
 * - explicit static-recipe bucket allowlist
 * - originals are never overwritten or deleted
 * - existing variants are skipped unless --force is present
 * - user uploads and support attachments are never selected
 *
 * Examples:
 *   npm run images:variants:plan -- --bucket NewRecipeImages --limit 10
 *   npm run images:variants:apply -- --bucket NewRecipeImages --limit 10
 *   npm run images:variants:apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import sharp from "sharp";

const EXPECTED_PROJECT_HOST = "wcjsrhdlnmfugdjtvadj.supabase.co";
const OPTIMIZED_ROOT = "_optimized/v1";
const REPORT_DIR = ".image-pipeline";
const LIST_PAGE_SIZE = 1000;

const STATIC_RECIPE_BUCKETS = [
  "NewRecipeImages",
  "Recipe Images",
  "backupimages",
  "New69",
  "Solo Active Professional",
  "Smart Family Budget",
  "Vegeterian Delight Meal Plan",
  "Light & Easy Meal Plan",
  "High Protein Gym Meal Plan",
] as const;

const VARIANTS = [
  { width: 340, quality: 75 },
  { width: 800, quality: 78 },
  { width: 1200, quality: 82 },
] as const;

const IMAGE_EXTENSION = /\.(?:avif|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;

type ListedObject = {
  id?: string | null;
  name: string;
  metadata?: { mimetype?: string; size?: number } | null;
};

type SourceObject = {
  bucket: string;
  path: string;
  size: number;
};

type Failure = {
  bucket: string;
  path: string;
  error: string;
};

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Expected a positive integer, received: ${raw}`);
  }
  return value;
}

function validateCredential(key: string): void {
  if (key.startsWith("sb_secret_")) return;
  const parts = key.split(".");
  if (parts.length !== 3) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not a service-role or secret key.",
    );
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as {
      role?: string;
      ref?: string;
    };
    if (payload.role !== "service_role") {
      throw new Error("The supplied JWT is not a service_role key.");
    }
    if (payload.ref && `${payload.ref}.supabase.co` !== EXPECTED_PROJECT_HOST) {
      throw new Error(
        `The supplied key belongs to a different Supabase project (${payload.ref}).`,
      );
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Could not validate SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function variantPath(sourcePath: string, width: number): string {
  const extension = posix.extname(sourcePath);
  const stem = extension ? sourcePath.slice(0, -extension.length) : sourcePath;
  return `${OPTIMIZED_ROOT}/${width}/${stem}.webp`;
}

async function listFiles(
  client: SupabaseClient<any, "public", "public", any, any>,
  bucket: string,
  prefix = "",
  includeOptimized = false,
): Promise<SourceObject[]> {
  const output: SourceObject[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error)
      throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    const entries = (data ?? []) as ListedObject[];

    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isFolder = !entry.id && !entry.metadata;
      if (isFolder) {
        if (!includeOptimized && fullPath === "_optimized") continue;
        output.push(
          ...(await listFiles(client, bucket, fullPath, includeOptimized)),
        );
        continue;
      }
      if (!IMAGE_EXTENSION.test(entry.name)) continue;
      output.push({
        bucket,
        path: fullPath,
        size: Number(entry.metadata?.size ?? 0),
      });
    }

    if (entries.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return output;
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const selectedBucket = argument("--bucket");
  const limit = positiveInteger(argument("--limit"), Number.MAX_SAFE_INTEGER);
  const concurrency = positiveInteger(argument("--concurrency"), 3);

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.image-pipeline before running.",
    );
  }

  const parsedUrl = new URL(supabaseUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== EXPECTED_PROJECT_HOST
  ) {
    throw new Error(
      `Refusing to operate on unexpected project URL: ${parsedUrl.hostname}`,
    );
  }
  validateCredential(serviceKey);

  if (
    selectedBucket &&
    !(STATIC_RECIPE_BUCKETS as readonly string[]).includes(selectedBucket)
  ) {
    throw new Error(
      `Bucket is not in the static-recipe allowlist: ${selectedBucket}`,
    );
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: available, error: bucketError } =
    await client.storage.listBuckets();
  if (bucketError)
    throw new Error(`Could not list buckets: ${bucketError.message}`);
  const availableNames = new Set(
    (available ?? []).map((bucket) => bucket.name),
  );
  const requested = selectedBucket
    ? [selectedBucket]
    : [...STATIC_RECIPE_BUCKETS];
  const buckets = requested.filter((bucket) => availableNames.has(bucket));
  const missing = requested.filter((bucket) => !availableNames.has(bucket));
  if (missing.length)
    console.warn(`Missing allowlisted buckets: ${missing.join(", ")}`);
  if (!buckets.length)
    throw new Error("No allowlisted static recipe buckets are available.");

  console.log(
    `${apply ? "APPLY" : "DRY RUN"} — ${buckets.length} bucket(s), concurrency ${concurrency}`,
  );
  if (!apply)
    console.log("No files will be downloaded or uploaded without --apply.");

  const sources: SourceObject[] = [];
  const existingByBucket = new Map<string, Set<string>>();
  for (const bucket of buckets) {
    const bucketSources = await listFiles(client, bucket);
    sources.push(...bucketSources);

    const existing = new Set<string>();
    for (const variant of VARIANTS) {
      const prefix = `${OPTIMIZED_ROOT}/${variant.width}`;
      const files = await listFiles(client, bucket, prefix, true).catch(
        (error) => {
          // A missing prefix is represented as an empty listing, but retain a
          // defensive fallback in case Storage changes its response shape.
          console.warn(
            `Could not inspect ${bucket}/${prefix}: ${(error as Error).message}`,
          );
          return [];
        },
      );
      files.forEach((file) => existing.add(file.path));
    }
    existingByBucket.set(bucket, existing);
    console.log(
      `  ${bucket}: ${bucketSources.length} original image(s), ${existing.size} variant(s)`,
    );
  }

  const selectedSources = sources.slice(0, limit);
  const planned = selectedSources.flatMap((source) =>
    VARIANTS.filter(
      (variant) =>
        force ||
        !existingByBucket
          .get(source.bucket)
          ?.has(variantPath(source.path, variant.width)),
    ).map((variant) => ({ source, variant })),
  );

  console.log(
    `Plan: ${selectedSources.length}/${sources.length} original(s), ${planned.length} variant upload(s).`,
  );
  if (!apply) return;

  const failures: Failure[] = [];
  let sourceCursor = 0;
  let completedSources = 0;
  let uploadedVariants = 0;
  let skippedSources = 0;
  let downloadedBytes = 0;
  let uploadedBytes = 0;

  async function processSource(source: SourceObject): Promise<void> {
    const pending = VARIANTS.filter(
      (variant) =>
        force ||
        !existingByBucket
          .get(source.bucket)
          ?.has(variantPath(source.path, variant.width)),
    );
    if (!pending.length) {
      skippedSources++;
      return;
    }

    try {
      const { data, error } = await client.storage
        .from(source.bucket)
        .download(source.path);
      if (error || !data)
        throw new Error(error?.message ?? "Download returned no data");
      const original = Buffer.from(await data.arrayBuffer());
      downloadedBytes += original.byteLength;

      for (const variant of pending) {
        const output = await sharp(original, { animated: false })
          .rotate()
          .resize({ width: variant.width, withoutEnlargement: true })
          .webp({ quality: variant.quality, effort: 4 })
          .toBuffer();
        const destination = variantPath(source.path, variant.width);
        const { error: uploadError } = await client.storage
          .from(source.bucket)
          .upload(destination, output, {
            cacheControl: "31536000",
            contentType: "image/webp",
            upsert: force,
          });
        if (uploadError)
          throw new Error(`${destination}: ${uploadError.message}`);
        uploadedVariants++;
        uploadedBytes += output.byteLength;
      }
    } catch (error) {
      failures.push({
        bucket: source.bucket,
        path: source.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      completedSources++;
      if (
        completedSources % 25 === 0 ||
        completedSources === selectedSources.length
      ) {
        console.log(
          `  Progress: ${completedSources}/${selectedSources.length}`,
        );
      }
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const source = selectedSources[sourceCursor++];
      if (!source) return;
      await processSource(source);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const report = {
    generatedAt: new Date().toISOString(),
    projectHost: EXPECTED_PROJECT_HOST,
    buckets,
    force,
    originalsDiscovered: sources.length,
    originalsSelected: selectedSources.length,
    originalsSkippedAsComplete: skippedSources,
    variantsUploaded: uploadedVariants,
    downloadedBytes,
    uploadedBytes,
    failures,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  const reportPath = `${REPORT_DIR}/image-variant-report-${Date.now()}.json`;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Uploaded ${uploadedVariants} variant(s); ${failures.length} original(s) failed.`,
  );
  console.log(`Report: ${reportPath}`);
  if (failures.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(
    `Image variant pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
