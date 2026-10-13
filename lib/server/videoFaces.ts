import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, isSetupError } from '@/lib/server/playground/http';
import { addFacePhoto, createFaceScan, faceLibrarySetup, FACE_SCAN_MINUTES, facePhotoStatus, faceScanResult, removeFacePhoto } from '@/lib/server/faceLibrary';
import { MAX_FACE_PHOTOS, MAX_FACES, type FacesState, type VideoFace, type VideoFacePhoto } from '@/lib/video/faces';

/**
 * The user's verified faces (tables video_faces / video_face_photos), kept in step with BytePlus:
 * reading a face asks BytePlus how its scan and photos are going, so nothing needs a public
 * callback. Every function takes the signed-in user's id and only touches their rows.
 */

type Row = Record<string, unknown>;
type Db = ReturnType<typeof createServiceClient>;

export const FACES_SETUP_MESSAGE = 'Faces aren’t set up yet: run supabase/migrations/202610130001_video_faces.sql in the Supabase SQL Editor.';

function photoOf(row: Row): VideoFacePhoto {
  return {
    id: String(row.id),
    url: String(row.source_url),
    status: row.status === 'active' || row.status === 'failed' ? row.status : 'processing',
    error: (row.error as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function faceOf(row: Row, photos: Row[]): VideoFace {
  const status = row.status === 'verified' || row.status === 'failed' || row.status === 'expired' ? row.status : 'verifying';
  return {
    id: String(row.id),
    name: String(row.name),
    status,
    scanLink: status === 'verifying' ? (row.scan_link as string | null) ?? null : null,
    scanExpiresAt: status === 'verifying' ? (row.scan_expires_at as string | null) ?? null : null,
    error: (row.error as string | null) ?? null,
    photos: photos.filter((photo) => photo.face_id === row.id).map(photoOf),
    createdAt: String(row.created_at),
  };
}

function dbError(error: { code?: string; message?: string } | null): never {
  if (isSetupError(error)) throw new ApiError(503, FACES_SETUP_MESSAGE, 'setup');
  throw new ApiError(500, 'Could not read your faces.', 'db');
}

async function photosOf(db: Db, faceIds: string[]): Promise<Row[]> {
  if (!faceIds.length) return [];
  const { data, error } = await db.from('video_face_photos').select('*').in('face_id', faceIds).order('created_at', { ascending: true });
  if (error) dbError(error);
  return (data ?? []) as Row[];
}

/** Asks BytePlus about a face still being scanned, or photos still being checked, and saves the answers. */
async function sync(db: Db, face: Row, photos: Row[]): Promise<void> {
  const now = new Date().toISOString();
  if (face.status === 'verifying' && typeof face.scan_token === 'string') {
    const expired = typeof face.scan_expires_at === 'string' && Date.parse(face.scan_expires_at) < Date.now();
    const { groupId } = await faceScanResult(face.scan_token).catch(() => ({ groupId: null }));
    if (groupId) {
      Object.assign(face, { status: 'verified', group_id: groupId, scan_token: null, scan_link: null, error: null, updated_at: now });
      await db.from('video_faces').update({ status: 'verified', group_id: groupId, scan_token: null, scan_link: null, error: null, updated_at: now }).eq('id', face.id);
    } else if (expired) {
      Object.assign(face, { status: 'expired', scan_token: null, scan_link: null, updated_at: now });
      await db.from('video_faces').update({ status: 'expired', scan_token: null, scan_link: null, updated_at: now }).eq('id', face.id);
    }
  }
  await Promise.all(photos.filter((photo) => photo.face_id === face.id && photo.status === 'processing' && typeof photo.asset_id === 'string').map(async (photo) => {
    const answer = await facePhotoStatus(photo.asset_id as string).catch(() => null);
    if (!answer || answer.status === 'processing') return;
    Object.assign(photo, { status: answer.status, error: answer.error, updated_at: now });
    await db.from('video_face_photos').update({ status: answer.status, error: answer.error, updated_at: now }).eq('id', photo.id);
  }));
}

export async function listFaces(userId: string): Promise<FacesState> {
  const db = createServiceClient();
  const missing = faceLibrarySetup();
  const { data, error } = await db.from('video_faces').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) {
    if (isSetupError(error)) return { faces: [], missing, setupMessage: FACES_SETUP_MESSAGE };
    dbError(error);
  }
  const rows = (data ?? []) as Row[];
  const photos = await photosOf(db, rows.map((row) => String(row.id)));
  if (!missing.length) await Promise.all(rows.map((row) => sync(db, row, photos)));
  return { faces: rows.map((row) => faceOf(row, photos)), missing, setupMessage: null };
}

async function faceRow(db: Db, userId: string, faceId: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(faceId)) throw new ApiError(404, 'This face was not found.', 'not_found');
  const { data, error } = await db.from('video_faces').select('*').eq('id', faceId).eq('user_id', userId).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new ApiError(404, 'This face was not found.', 'not_found');
  return data as Row;
}

export async function getFace(userId: string, faceId: string): Promise<VideoFace> {
  const db = createServiceClient();
  const row = await faceRow(db, userId, faceId);
  const photos = await photosOf(db, [faceId]);
  if (!faceLibrarySetup().length) await sync(db, row, photos);
  return faceOf(row, photos);
}

/** A new face: the uploader confirms consent; BytePlus gives a one-time scan link for the person. */
export async function startFace(userId: string, name: string, callbackUrl: string): Promise<VideoFace> {
  const db = createServiceClient();
  const { count, error: countError } = await db.from('video_faces').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'failed');
  if (countError) dbError(countError);
  if ((count ?? 0) >= MAX_FACES) throw new ApiError(409, `You can keep up to ${MAX_FACES} faces. Remove one you no longer use first.`, 'limit');
  const scan = await createFaceScan(callbackUrl);
  const now = Date.now();
  const { data, error } = await db.from('video_faces').insert({
    user_id: userId,
    name,
    status: 'verifying',
    scan_token: scan.token,
    scan_link: scan.link,
    scan_expires_at: new Date(now + FACE_SCAN_MINUTES * 60_000).toISOString(),
    consent_at: new Date(now).toISOString(),
  }).select('*').single();
  if (error || !data) dbError(error);
  return faceOf(data as Row, []);
}

/** A fresh scan link for a face whose link expired or whose scan failed. */
export async function rescanFace(userId: string, faceId: string, callbackUrl: string): Promise<VideoFace> {
  const db = createServiceClient();
  const row = await faceRow(db, userId, faceId);
  if (row.status === 'verified') return getFace(userId, faceId);
  const scan = await createFaceScan(callbackUrl);
  const patch = { status: 'verifying', scan_token: scan.token, scan_link: scan.link, scan_expires_at: new Date(Date.now() + FACE_SCAN_MINUTES * 60_000).toISOString(), error: null, updated_at: new Date().toISOString() };
  await db.from('video_faces').update(patch).eq('id', faceId);
  return faceOf({ ...row, ...patch }, await photosOf(db, [faceId]));
}

/** Adds a photo of the verified person (our own public storage URL); BytePlus checks it. */
export async function addPhoto(userId: string, faceId: string, url: string): Promise<VideoFace> {
  const db = createServiceClient();
  const row = await faceRow(db, userId, faceId);
  if (row.status !== 'verified' || typeof row.group_id !== 'string') throw new ApiError(409, 'Finish the face scan first.', 'not_verified');
  const photos = await photosOf(db, [faceId]);
  if (photos.filter((photo) => photo.status !== 'failed').length >= MAX_FACE_PHOTOS) {
    throw new ApiError(409, `Up to ${MAX_FACE_PHOTOS} photos per face. Remove one first.`, 'limit');
  }
  const { assetId } = await addFacePhoto({ groupId: row.group_id, url, name: String(row.name) });
  const { error } = await db.from('video_face_photos').insert({ face_id: faceId, user_id: userId, asset_id: assetId, source_url: url, status: 'processing' });
  if (error) dbError(error);
  return getFace(userId, faceId);
}

export async function deletePhoto(userId: string, faceId: string, photoId: string): Promise<VideoFace> {
  const db = createServiceClient();
  await faceRow(db, userId, faceId);
  const { data } = await db.from('video_face_photos').select('*').eq('id', photoId).eq('face_id', faceId).eq('user_id', userId).maybeSingle();
  const photo = data as Row | null;
  if (!photo) throw new ApiError(404, 'This photo was not found.', 'not_found');
  if (typeof photo.asset_id === 'string') await removeFacePhoto(photo.asset_id).catch(() => undefined);
  await db.from('video_face_photos').delete().eq('id', photoId);
  return getFace(userId, faceId);
}

export async function deleteFace(userId: string, faceId: string): Promise<void> {
  const db = createServiceClient();
  await faceRow(db, userId, faceId);
  const photos = await photosOf(db, [faceId]);
  await Promise.all(photos.map((photo) => (typeof photo.asset_id === 'string' ? removeFacePhoto(photo.asset_id).catch(() => undefined) : undefined)));
  await db.from('video_faces').delete().eq('id', faceId).eq('user_id', userId);
}

/** What a video sends for a face: its accepted photos as asset:// ids (newest BytePlus check first). */
export async function readyFaceAssets(userId: string, faceId: string): Promise<{ name: string; assets: Array<{ url: string; preview: string }> }> {
  const face = await getFace(userId, faceId);
  if (face.status !== 'verified') throw new ApiError(409, `${face.name}’s face scan isn’t finished yet.`, 'not_verified');
  const db = createServiceClient();
  const { data } = await db.from('video_face_photos').select('asset_id, source_url').eq('face_id', faceId).eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: true });
  const assets = ((data ?? []) as Row[])
    .filter((row) => typeof row.asset_id === 'string')
    .map((row) => ({ url: `asset://${row.asset_id as string}`, preview: String(row.source_url) }));
  if (!assets.length) throw new ApiError(409, `Add a photo of ${face.name} and wait until BytePlus has checked it.`, 'no_photos');
  return { name: face.name, assets };
}

/** Whether these asset:// urls are the user's own accepted face photos (the render route checks before sending). */
export async function ownFaceAssets(userId: string, urls: string[]): Promise<boolean> {
  const ids = urls.map((url) => url.replace(/^asset:\/\//, ''));
  if (!ids.length) return true;
  const { data } = await createServiceClient().from('video_face_photos').select('asset_id').eq('user_id', userId).eq('status', 'active').in('asset_id', ids);
  return new Set(((data ?? []) as Row[]).map((row) => String(row.asset_id))).size === new Set(ids).size;
}
