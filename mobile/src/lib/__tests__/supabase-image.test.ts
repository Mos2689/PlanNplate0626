import {
  optimizedImageUrl,
  previewImageUrl,
  recipeImageUrl,
  storedVariantUrl,
  storedVariantWidth,
} from "../supabase-image";

const BASE =
  "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/";

describe("stored Supabase image variants", () => {
  test("selects the 340px object for recipe cards", () => {
    expect(
      recipeImageUrl(`${BASE}NewRecipeImages/aloo_gobi.png`, { width: 170 }),
    ).toBe(`${BASE}NewRecipeImages/_optimized/v1/340/aloo_gobi.webp`);
  });

  test("selects the nearest larger stored width", () => {
    expect(storedVariantWidth(341)).toBe(800);
    expect(storedVariantWidth(801)).toBe(1200);
    expect(storedVariantWidth(4000)).toBe(1200);
  });

  test("supports URL-encoded static bucket names and nested paths", () => {
    expect(
      storedVariantUrl(
        `${BASE}Light%20%26%20Easy%20Meal%20Plan/week-1/soup.jpeg`,
        600,
      ),
    ).toBe(
      `${BASE}Light%20%26%20Easy%20Meal%20Plan/_optimized/v1/800/week-1/soup.webp`,
    );
  });

  test("does not target user uploads or unknown buckets", () => {
    const upload = `${BASE}user-uploads/recipe-images/user-photo.jpg`;
    expect(optimizedImageUrl(upload, { width: 340 })).toBe(upload);
    expect(storedVariantUrl(`${BASE}unrelated/image.png`, 340)).toBeNull();
  });

  test("normalizes a legacy render URL without issuing another render request", () => {
    const legacy =
      "https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/render/image/public/NewRecipeImages/salad.png?width=340&quality=75";
    expect(optimizedImageUrl(legacy, { width: 800 })).toBe(
      `${BASE}NewRecipeImages/_optimized/v1/800/salad.webp`,
    );
  });

  test("is idempotent for an existing optimized object", () => {
    const optimized = `${BASE}backupimages/_optimized/v1/340/carbonara.webp`;
    expect(optimizedImageUrl(optimized, { width: 1200 })).toBe(optimized);
  });

  test("uses embedded blurhash or tone tile instead of a Supabase preview request", () => {
    expect(
      previewImageUrl(`${BASE}NewRecipeImages/aloo_gobi.png`),
    ).toBeUndefined();
  });

  test("retains third-party CDN sizing", () => {
    expect(
      recipeImageUrl(
        "https://images.pexels.com/photos/123/food.jpeg?w=900&h=600",
        {
          width: 300,
        },
      ),
    ).toBe("https://images.pexels.com/photos/123/food.jpeg?w=340");
  });
});
