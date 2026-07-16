// Uploads a local image (file:// URI) to the shared user-uploads bucket and
// returns a public URL — used to make a user's OWN photo (e.g. a snapped photo
// of the finished dish) the recipe hero. Returns null on any failure so callers
// can fall back to Pexels. Mirrors the avatar-upload path in EditProfileModal.
import { supabase, isSupabaseConfigured } from './supabase';

export async function uploadRecipeImage(uri: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !uri) return null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? 'anon';

    const response = await fetch(uri);
    const blob = await response.blob();

    const rawExt = (uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
    const ext = rawExt === 'png' ? 'png' : 'jpg';
    const filePath = `recipe-images/${uid}-${Date.now()}.${ext}`;

    // Hermes doesn't implement blob.arrayBuffer(); read via FileReader.
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        reader.result instanceof ArrayBuffer
          ? resolve(reader.result)
          : reject(new Error('FileReader did not return an ArrayBuffer'));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });

    const { error } = await supabase.storage
      .from('user-uploads')
      .upload(filePath, arrayBuffer, {
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
    if (error) {
      console.warn('[uploadRecipeImage] upload failed:', error.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('user-uploads').getPublicUrl(filePath);
    return publicUrl || null;
  } catch (e) {
    console.warn('[uploadRecipeImage] error:', e);
    return null;
  }
}
