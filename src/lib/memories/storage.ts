'use client'

/**
 * Firebase Storage helpers for trip photo memories (Phase 7B).
 *
 * Layout: trips/{tripId}/memories/{memoryId}/{safeFileName}
 * Access is governed by storage.rules — trip members only, never public.
 *
 * Uploads are always user-triggered (a file the user explicitly selected); we
 * never read the camera or filesystem automatically.
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { storage } from '@/lib/firebase'

/** Image MIME types we accept. HEIC/HEIF allowed for upload even if the
 *  browser cannot render a preview. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

/** Accept attribute string for the file input. */
export const IMAGE_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Max upload size (15 MB) — keeps Storage costs and load times sane. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export interface UploadResult {
  photoUrl: string
  storagePath: string
  contentType: string
  sizeBytes: number
  originalFileName: string
}

export function isAcceptedImage(file: File): boolean {
  // Some browsers report an empty type for HEIC; fall back to extension check.
  if (file.type && ACCEPTED_IMAGE_TYPES.includes(file.type)) return true
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
}

/** Strip anything risky from a filename so the Storage path stays predictable. */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return cleaned || 'photo'
}

/**
 * Upload a single image to Storage under a given memory id. Reports progress
 * (0–100) via the optional callback. Resolves with the download URL and the
 * storage path needed for later deletion.
 */
export function uploadMemoryPhoto(
  tripId: string,
  memoryId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const safeName = sanitizeFileName(file.name)
  const storagePath = `trips/${tripId}/memories/${memoryId}/${safeName}`
  const storageRef = ref(storage, storagePath)

  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  })

  return new Promise<UploadResult>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const photoUrl = await getDownloadURL(task.snapshot.ref)
          resolve({
            photoUrl,
            storagePath,
            contentType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            originalFileName: file.name,
          })
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/**
 * Best-effort delete of a Storage object. Never throws — callers delete the
 * Firestore doc first; if the binary is already gone we treat it as success.
 */
export async function deleteMemoryPhoto(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath))
  } catch {
    // Object already removed or rules transient — ignore so the metadata
    // delete still counts as a successful removal from the user's view.
  }
}
