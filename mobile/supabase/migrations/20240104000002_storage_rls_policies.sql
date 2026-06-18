-- RLS Policies for Storage Buckets
-- Run this in Supabase Dashboard > SQL Editor (or via `supabase db push` with migration)

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- backupimages bucket policies
CREATE POLICY "backupimages_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'backupimages');

CREATE POLICY "backupimages_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'backupimages' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Recipe Images bucket policies
CREATE POLICY "recipe_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'Recipe Images');

CREATE POLICY "recipe_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'Recipe Images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );