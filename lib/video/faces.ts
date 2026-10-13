/**
 * Verified faces (BytePlus real-person portrait library), as the Video Studio sees them. A
 * face is a person who scanned their own face once; its photos, once BytePlus has checked
 * them, can be in any Seedance 2.x video (with sound), which otherwise refuses real faces.
 */

export type FaceStatus = 'verifying' | 'verified' | 'failed' | 'expired';
export type FacePhotoStatus = 'processing' | 'active' | 'failed';

export interface VideoFacePhoto {
  id: string;
  url: string;
  status: FacePhotoStatus;
  error: string | null;
  createdAt: string;
}

export interface VideoFace {
  id: string;
  name: string;
  status: FaceStatus;
  /** While verifying: the one-time link the person opens on their phone, and when it stops working. */
  scanLink: string | null;
  scanExpiresAt: string | null;
  error: string | null;
  photos: VideoFacePhoto[];
  createdAt: string;
}

export interface FacesState {
  faces: VideoFace[];
  /** What still has to be set up in BytePlus (env names); empty when faces can be verified. */
  missing: string[];
  /** The faces tables don't exist yet (the migration hasn't been run). */
  setupMessage: string | null;
}

/** Photos per face (each must show the same person). */
export const MAX_FACE_PHOTOS = 3;
/** Faces per account (BytePlus's free tier holds 50 for the whole company). */
export const MAX_FACES = 5;

/** A face a video can use: verified, with at least one photo BytePlus accepted. */
export function faceIsReady(face: VideoFace): boolean {
  return face.status === 'verified' && face.photos.some((photo) => photo.status === 'active');
}

export function readFace(raw: unknown): VideoFace | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.id !== 'string' || typeof f.name !== 'string') return null;
  const status = (['verifying', 'verified', 'failed', 'expired'] as FaceStatus[]).find((s) => s === f.status) ?? 'failed';
  return {
    id: f.id,
    name: f.name,
    status,
    scanLink: typeof f.scanLink === 'string' ? f.scanLink : null,
    scanExpiresAt: typeof f.scanExpiresAt === 'string' ? f.scanExpiresAt : null,
    error: typeof f.error === 'string' ? f.error : null,
    photos: Array.isArray(f.photos)
      ? (f.photos as Array<Record<string, unknown>>)
        .filter((p) => typeof p?.id === 'string' && typeof p?.url === 'string')
        .map((p) => ({
          id: p.id as string,
          url: p.url as string,
          status: (['processing', 'active', 'failed'] as FacePhotoStatus[]).find((s) => s === p.status) ?? 'processing',
          error: typeof p.error === 'string' ? p.error : null,
          createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
        }))
      : [],
    createdAt: typeof f.createdAt === 'string' ? f.createdAt : '',
  };
}
