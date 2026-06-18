// Upload File Edge Function
// Handles file uploads to Supabase Storage

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Initialize Supabase client with service role for storage operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // POST /upload-file - Upload a file
    if (req.method === 'POST') {
      const formData = await req.formData();
      const file = formData.get('file');
      // Use existing buckets: 'Public assets' (public) or 'backupimages' (for user files)
      const bucket = formData.get('bucket') || 'backupimages';

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate unique filename
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const originalName = file instanceof File ? file.name : 'file';
      const extension = originalName.split('.').pop() || '';
      const filename = `${timestamp}-${randomStr}${extension ? '.' + extension : ''}`;

      // Get file content
      let fileContent;
      let contentType;

      if (file instanceof File) {
        fileContent = await file.arrayBuffer();
        contentType = file.type || 'application/octet-stream';
      } else {
        return new Response(
          JSON.stringify({ error: 'Invalid file format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Upload to Supabase Storage
      const bucketName = String(bucket);
      const filePath = `${user.id}/${filename}`;

      console.log('[Upload] Uploading file to Supabase Storage:', { bucket: bucketName, path: filePath });

      const { data, error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(filePath, fileContent, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('[Upload] Storage upload error:', uploadError);
        return new Response(
          JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(filePath);

      console.log('[Upload] File uploaded successfully:', urlData.publicUrl);

      return new Response(
        JSON.stringify({
          data: {
            id: `${bucketName}/${filePath}`,
            url: urlData.publicUrl,
            filename: originalName,
            bucket: bucketName,
            path: filePath,
            contentType,
            sizeBytes: fileContent.byteLength,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE /upload-file - Delete a file
    if (req.method === 'DELETE') {
      const body = await req.json();
      const { id } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: 'File ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse bucket and path from ID (format: "bucket/path")
      const parts = id.split('/');
      const bucketName = parts[0];
      const filePath = parts.slice(1).join('/');

      // Security: Only allow deletion of files in user's folder
      if (!filePath.startsWith(`${user.id}/`)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: cannot delete files outside your folder' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[Upload] Deleting file:', { bucket: bucketName, path: filePath });

      const { error: deleteError } = await supabaseAdmin.storage
        .from(bucketName)
        .remove([filePath]);

      if (deleteError) {
        console.error('[Upload] Delete error:', deleteError);
        return new Response(
          JSON.stringify({ error: `Delete failed: ${deleteError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[Upload] File deleted successfully:', id);

      return new Response(
        JSON.stringify({ data: { success: true } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Upload] Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});