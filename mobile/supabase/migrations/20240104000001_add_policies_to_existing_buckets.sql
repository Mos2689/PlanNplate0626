-- Add RLS Policies for Existing Storage Buckets
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- This only adds policies to your existing buckets: backupimages, Recipe Images, Public assets

-- Enable Row Level Security on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================
-- backupimages bucket policies
-- ============================================

CREATE POLICY "backupimages_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'backupimages');

CREATE POLICY "backupimages_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'backupimages' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "backupimages_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'backupimages' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "backupimages_auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'backupimages' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- Recipe Images bucket policies (note: space in name)
-- ============================================

CREATE POLICY "Recipe Images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'Recipe Images');

CREATE POLICY "Recipe Images_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'Recipe Images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Recipe Images_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'Recipe Images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Recipe Images_auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'Recipe Images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- Public assets bucket policies
-- ============================================

CREATE POLICY "Public assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'Public assets');

CREATE POLICY "Public assets_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'Public assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public assets_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'Public assets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public assets_auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'Public assets' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );