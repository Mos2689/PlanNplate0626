import * as ImagePicker from "expo-image-picker";
import { apiCall, apiFormCall } from './api-router';

export type UploadResult = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  bucket: string;
  path: string;
};

export type PickedFile = {
  uri: string;
  filename: string;
  mimeType: string;
};

export async function uploadFile(uri: string, filename: string, mimeType: string, bucket: string = 'backupimages'): Promise<UploadResult> {
  console.log('[Upload] Uploading file via Supabase Edge Function...');

  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: filename } as any);
  formData.append('bucket', bucket);

  const result = await apiFormCall<UploadResult>('upload-file', formData);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    throw new Error('No response from upload service');
  }

  console.log('[Upload] File uploaded successfully:', result.data.url);
  return result.data;
}

export async function pickImage(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    filename: asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  console.log('[Upload] Deleting file via Supabase Edge Function...');

  const result = await apiCall<{ success: boolean }>('upload-file', { id: fileId });

  if (result.error) {
    throw new Error(result.error);
  }

  console.log('[Upload] File deleted successfully:', fileId);
}