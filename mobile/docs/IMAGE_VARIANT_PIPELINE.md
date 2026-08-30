# Stored recipe image variants

This pipeline replaces Supabase's metered on-demand Image Transformations with
ordinary, immutable WebP objects generated on a developer computer.

## Safety contract

- Dry-run is the default. Uploads require `--apply`.
- Only the static recipe bucket allowlist in the script is processed.
- `user-uploads`, support attachments, and unknown buckets are excluded.
- Originals are never overwritten or deleted.
- Existing variants are skipped unless `--force` is explicitly supplied.
- The script refuses to operate on a Supabase project other than PlanNplate.
- The service-role/secret key must never be committed or shipped in the app.

## Local setup

1. Copy `.env.image-pipeline.example` to `.env.image-pipeline`.
2. In Supabase, open **Project Settings → API Keys** and copy the service-role
   key (or a server-side secret key) into the local file.
3. Never paste the key into source code, a ticket, or chat. The real environment
   file and generated reports are ignored by Git.

## Commands

Plan a ten-image canary without downloading or uploading files:

```powershell
npm run images:variants:plan -- --bucket NewRecipeImages --limit 10
```

Generate and upload that canary:

```powershell
npm run images:variants:apply -- --bucket NewRecipeImages --limit 10
```

After visual approval, process every allowlisted static bucket:

```powershell
npm run images:variants:apply
```

The default concurrency is three. On a constrained connection it can be lowered:

```powershell
npm run images:variants:apply -- --concurrency 1
```

Each applied run writes a JSON audit report under `.image-pipeline/`.

## Storage layout

For an original such as:

```text
NewRecipeImages/aloo_gobi.png
```

the script creates:

```text
NewRecipeImages/_optimized/v1/340/aloo_gobi.webp
NewRecipeImages/_optimized/v1/800/aloo_gobi.webp
NewRecipeImages/_optimized/v1/1200/aloo_gobi.webp
```

Uploads use `image/webp` and `cacheControl: 31536000`. Versioning the path means
these files can be cached for one year without stale-image ambiguity.

## Rollout verification

1. Inspect the ten-image canary in Supabase Storage.
2. Open its public object URLs and compare visual quality and byte size.
3. Run the app tests and test Explore on iOS and Android with a cold cache.
4. Confirm requests use `/storage/v1/object/public/` and never
   `/storage/v1/render/image/public/`.
5. Confirm missing variants fall back to their original images.
6. Run the full pipeline and review its JSON report before release.
