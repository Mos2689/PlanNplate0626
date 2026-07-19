#!/usr/bin/env python3
"""
check_inspired_alignment.py — enforce the INSPIRED_RECIPES image invariant.

Every "Get Inspired" recipe's id + photo is DERIVED FROM ITS NAME:

    id        == slug(name)
    imageUrl  == <BUCKET>/<slug(name)>.png

    where slug(name) = name.lower() with each run of non-alphanumerics -> "_"
    e.g. "Black Bean & Sweet Potato Tacos" -> "black_bean_sweet_potato_tacos"

This guards against the "shift"/"swap" bug where a recipe ended up carrying
another recipe's id and photo (e.g. the tacos row pointing at the quesadilla
image). It never touches name / ingredients / instructions / any other field —
only id + imageUrl, which are pure functions of the name.

Usage (run from mobile/):
    python3 scripts/check_inspired_alignment.py          # check — exits 1 on any mismatch (CI)
    python3 scripts/check_inspired_alignment.py --fix    # repair id + imageUrl in place

If two recipes reduce to the same slug, that's a NAME collision the guard cannot
auto-resolve — rename one recipe so every dish maps to a unique image.
"""
import json
import re
import sys
import pathlib

LIB = pathlib.Path(__file__).resolve().parent.parent / "src" / "lib" / "inspired-recipe-library.ts"
# Images live in one of these public Supabase buckets. Whichever bucket a recipe
# uses, its FILENAME must still be <slug(name)>.png (that's what the guard pins).
_ROOT = "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/"
BUCKETS = {_ROOT + "NewRecipeImages/", _ROOT + "New69/"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def main() -> None:
    fix = "--fix" in sys.argv[1:]
    lines = LIB.read_text().split("\n")

    out, mismatches, by_slug = [], [], {}
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('{"id":'):
            obj = json.loads(stripped.rstrip(","))
            name = obj["name"]
            s = slug(name)
            img = obj["imageUrl"]
            cur_bucket = img.rsplit("/", 1)[0] + "/"       # keep the recipe's own bucket
            bucket_ok = cur_bucket in BUCKETS
            want_url = f"{cur_bucket}{s}.png" if bucket_ok else img
            by_slug.setdefault(s, []).append(name)
            if obj["id"] != s or img != want_url or not bucket_ok:
                mismatches.append((name, obj["id"], img, s))
                if fix and bucket_ok:
                    line = (
                        line.replace(f'"id":"{obj["id"]}"', f'"id":"{s}"', 1)
                        .replace(f'"imageUrl":"{img}"', f'"imageUrl":"{want_url}"', 1)
                    )
        out.append(line)

    duplicates = {s: names for s, names in by_slug.items() if len(names) > 1}

    if fix and mismatches:
        LIB.write_text("\n".join(out))

    for name, old_id, old_img, s in mismatches:
        tag = "fixed" if fix else "MISMATCH"
        print(f"  [{tag}] {name!r}: id={old_id!r} img=.../{old_img.rsplit('/', 1)[-1]}  ->  {s!r}")

    if duplicates:
        print("\nDUPLICATE slugs (two recipes map to one image — rename one):")
        for s, names in duplicates.items():
            print(f"  {s}: {names}")

    total = sum(len(n) for n in by_slug.values())
    print(f"\n{total} recipes checked | mismatches: {len(mismatches)} | duplicate slugs: {len(duplicates)}")
    if not mismatches and not duplicates:
        print("OK — every recipe's id + image matches its name.")

    # Clean iff nothing wrong, or everything fixable was fixed and no name collisions.
    ok = (not mismatches or fix) and not duplicates
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
