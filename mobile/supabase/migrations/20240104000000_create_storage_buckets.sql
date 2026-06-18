-- Supabase Storage Buckets Migration
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Create storage buckets (if they don't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('recipe-images', 'recipe-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('uploads', 'uploads', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for avatars bucket
-- Users can only access their own avatar
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view avatars" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      true  -- Avatars are public for display purposes
    )
  );

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policies for recipe-images bucket
-- Users can only manage their own recipe images
CREATE POLICY "Users can upload recipe images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'recipe-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view recipe images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'recipe-images' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      true  -- Recipe images are public for recipe sharing
    )
  );

CREATE POLICY "Users can update own recipe images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own recipe images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policies for uploads bucket (private)
-- Users can only manage their own uploads
CREATE POLICY "Users can upload to uploads" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own uploads" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own uploads" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own uploads" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create indexes for storage queries
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id ON storage.objects(bucket_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_name ON storage.objects(name);