// Screenshot attachment — pick, shrink, upload.
//
// User-initiated ONLY. The app never captures the screen on its own, even
// though react-native-view-shot is installed and it would produce a better
// bug report. Silently photographing someone's screen because they tapped
// "something's not working" is the kind of thing that is defensible in a
// privacy policy and indefensible to a person who finds out about it.
//
// Everything here degrades to "no screenshot" rather than to an error. A
// screenshot is a nice-to-have on a message that is already sendable; a picker
// that throws would block a report we'd rather receive without the picture.

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { apiFormCall } from '../api-router';
import { classifyFailure, err, makeFailure, ok, type Result } from '../failure';
import type { SupportAttachment } from './types';

/**
 * Longest edge, in pixels, after shrinking.
 *
 * A modern phone screenshot is ~1290×2796 and 3–5 MB. UI text stays legible
 * well below that, and the upload happens on whatever connection just failed
 * the user — so this trades pixels we don't need for a send that completes.
 * Result lands around 200–300 KB.
 */
const MAX_EDGE = 1400;
const QUALITY = 0.6;

const FEATURE = 'support-attachment';

interface UploadResponse {
  path: string;
  bucket: string;
}

/**
 * Ask for a screenshot from the photo library.
 *
 * Deliberately the library and not the camera: the thing the user wants to show
 * us is already a screenshot they took. `allowsEditing` is off — cropping a bug
 * report usually removes the surrounding context that makes it diagnosable.
 *
 * Returns null when the user backs out, which is not a failure.
 */
export async function pickScreenshot(): Promise<Result<{ uri: string; width: number; height: number } | null>> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1, // Compression happens below, after the resize.
      allowsEditing: false,
      allowsMultipleSelection: false,
    });

    if (result.canceled) return ok(null);

    const asset = result.assets[0];
    if (!asset?.uri) return ok(null);

    return ok({ uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 });
  } catch (cause) {
    // The one case worth naming: photo permission was refused at the OS level.
    const denied =
      cause instanceof Error && /permission|denied/i.test(cause.message);
    return err(
      denied
        ? makeFailure('permission-denied', { feature: 'photo' })
        : classifyFailure(cause, { feature: FEATURE }),
    );
  }
}

/** Shrink the longest edge to MAX_EDGE and re-encode as JPEG. */
async function shrink(uri: string, width: number, height: number) {
  const longest = Math.max(width, height);
  const context = ImageManipulator.manipulate(uri);

  if (longest > MAX_EDGE) {
    // Only one dimension is given; the other is derived, preserving ratio.
    if (width >= height) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }

  const rendered = await context.renderAsync();
  return rendered.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
}

/**
 * Shrink and upload, returning the stored path.
 *
 * Rides the existing `upload-file` edge function, which already writes to
 * `{user_id}/{filename}` — the prefix the support-attachments bucket's RLS
 * keys on. No new upload path was needed.
 */
export async function uploadScreenshot(picked: {
  uri: string;
  width: number;
  height: number;
}): Promise<Result<SupportAttachment>> {
  try {
    const image = await shrink(picked.uri, picked.width, picked.height);

    const formData = new FormData();
    formData.append('file', {
      uri: image.uri,
      type: 'image/jpeg',
      name: `screenshot-${Date.now()}.jpg`,
    } as unknown as Blob);
    formData.append('bucket', 'support-attachments');

    const response = await apiFormCall<UploadResponse>('upload-file', formData, {
      feature: FEATURE,
    });

    if (response.failure) return err(response.failure);
    if (!response.data?.path) {
      return err(classifyFailure('no path returned', { feature: FEATURE }));
    }

    return ok({
      path: response.data.path,
      width: image.width,
      height: image.height,
      // The edge function reports the byte count it stored; fall back to 0
      // rather than guessing, since this is only ever shown to an agent.
      bytes: (response.data as UploadResponse & { sizeBytes?: number }).sizeBytes ?? 0,
    });
  } catch (cause) {
    return err(classifyFailure(cause, { feature: FEATURE }));
  }
}
