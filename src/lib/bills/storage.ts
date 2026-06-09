'use client'

/**
 * Firebase Storage helpers for trip bill/receipt images (Phase 14).
 *
 * Layout: trips/{tripId}/bills/{billKey}/{safeFileName}
 *   billKey is the expense id (attach-to-existing) or a generated draft id.
 *
 * Access is governed by storage.rules — trip members only, never public. Bills
 * are PRIVATE and are never included in public share snapshots.
 *
 * Uploads are always user-triggered (a file the user explicitly selected).
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { storage } from '@/lib/firebase'

/** Accepted bill file MIME types — images first, plus PDF. */
export const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

/** Accept attribute string for the bill file input. */
export const BILL_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,application/pdf'

/** Max bill upload size (10 MB). */
export const MAX_BILL_BYTES = 10 * 1024 * 1024

export interface BillUploadResult {
  billImageUrl: string
  billStoragePath: string
  billContentType: string
  billSizeBytes: number
  billOriginalFileName: string
}

export function isAcceptedBill(file: File): boolean {
  if (file.type && ACCEPTED_BILL_TYPES.includes(file.type)) return true
  return /\.(jpe?g|png|webp|pdf)$/i.test(file.name)
}

/** Strip anything risky from a filename so the Storage path stays predictable. */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return cleaned || 'bill'
}

/**
 * Upload a single bill image/PDF to Storage under a given bill key (expense id
 * or draft id). Reports progress (0–100) via the optional callback. Resolves
 * with the download URL and the storage path needed for later deletion.
 */
export function uploadBillImage(
  tripId: string,
  billKey: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<BillUploadResult> {
  const safeName = sanitizeFileName(file.name)
  const storagePath = `trips/${tripId}/bills/${billKey}/${safeName}`
  const storageRef = ref(storage, storagePath)

  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  })

  return new Promise<BillUploadResult>((resolve, reject) => {
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
          const billImageUrl = await getDownloadURL(task.snapshot.ref)
          resolve({
            billImageUrl,
            billStoragePath: storagePath,
            billContentType: file.type || 'application/octet-stream',
            billSizeBytes: file.size,
            billOriginalFileName: file.name,
          })
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/**
 * Best-effort delete of a bill Storage object. Never throws — if the binary is
 * already gone we treat it as success.
 */
export async function deleteBillImage(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath))
  } catch {
    // Object already removed or rules transient — ignore.
  }
}
