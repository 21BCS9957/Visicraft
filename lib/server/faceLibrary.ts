import 'server-only';

import axios from 'axios';
import { signBytePlusRequest } from '@/lib/server/byteplus/sign';

/**
 * Verified faces for Seedance 2.x, through BytePlus ModelArk's real-person portrait library.
 * Seedance 2.x refuses a real person's face in an uploaded image; a face registered here is
 * accepted as `asset://<id>`. The person scans their own face once (a liveness check on their
 * phone, which creates a portrait group), and every photo added to the group must show that
 * same person. It needs the BytePlus Access Key / Secret Key (BYTEPLUS_ACCESS_KEY_ID,
 * BYTEPLUS_SECRET_ACCESS_KEY, with ArkFullAccess), company verification and the Advanced
 * Creation Rights package (the free Entry tier allows 50 faces); assets must be in the same
 * ModelArk project as ARK_API_KEY (BYTEPLUS_ARK_PROJECT, else "default").
 */

const HOST = 'ark.ap-southeast-1.byteplusapi.com';
const REGION = 'ap-southeast-1';
const SERVICE = 'ark';
const VERSION = '2024-01-01';
/** A scan link works once and lasts 30 minutes. */
export const FACE_SCAN_MINUTES = 30;

export class FaceLibraryError extends Error {
  constructor(readonly code: string, message: string, readonly status = 502) {
    super(message);
    this.name = 'FaceLibraryError';
  }
}

/** What still has to be set up before faces can be verified (empty when it is ready). */
export function faceLibrarySetup(): string[] {
  const missing: string[] = [];
  if (!process.env.BYTEPLUS_ACCESS_KEY_ID) missing.push('BYTEPLUS_ACCESS_KEY_ID');
  if (!process.env.BYTEPLUS_SECRET_ACCESS_KEY) missing.push('BYTEPLUS_SECRET_ACCESS_KEY');
  return missing;
}

const projectName = () => process.env.BYTEPLUS_ARK_PROJECT || 'default';

/** BytePlus's answer, in words someone setting this up can act on. */
function explain(code: string, message: string): string {
  if (/Unauthorized|SignatureDoesNotMatch|InvalidAccessKey|InvalidCredential/i.test(code)) return 'BytePlus did not accept the Access Key / Secret Key. Check BYTEPLUS_ACCESS_KEY_ID and BYTEPLUS_SECRET_ACCESS_KEY.';
  if (/AccessDenied|Forbidden|NoPermission/i.test(code)) return 'The BytePlus key has no permission for the portrait library. Give it ArkFullAccess on the ModelArk project, and check that Advanced Creation Rights are active.';
  if (/NotInvited|Whitelist|NotEnabled|NotOpen|NotActivated|Unsupported/i.test(code)) return 'Real-person faces are not switched on for this BytePlus account yet. Subscribe to Advanced Creation Rights (Entry tier is free) and ask BytePlus support to enable real-human portrait assets via API.';
  if (/Quota|Limit|Throttl/i.test(code)) return 'BytePlus’s limit for faces was reached (the free tier allows 50, and 3 photos a minute). Wait a minute, or remove faces you no longer use.';
  return `BytePlus: ${message || code}`;
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const missing = faceLibrarySetup();
  if (missing.length) throw new FaceLibraryError('NotConfigured', `Verified faces aren’t set up yet (set ${missing.join(' and ')}).`, 503);
  const signed = signBytePlusRequest({
    accessKeyId: process.env.BYTEPLUS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.BYTEPLUS_SECRET_ACCESS_KEY as string,
    host: HOST,
    region: REGION,
    service: SERVICE,
    query: { Action: action, Version: VERSION },
    body: { ...body, ProjectName: projectName() },
  });
  // The HTTP client sets Host itself, from the same URL that was signed.
  const { Host: _host, ...headers } = signed.headers;
  void _host;
  try {
    const response = await axios.post<{ ResponseMetadata?: { Error?: { Code?: string; Message?: string } }; Result?: T }>(signed.url, signed.body, {
      headers,
      timeout: 30000,
      validateStatus: () => true,
    });
    const error = response.data?.ResponseMetadata?.Error;
    if (error?.Code || response.status >= 400) {
      const code = error?.Code ?? `HTTP${response.status}`;
      throw new FaceLibraryError(code, explain(code, error?.Message ?? ''), response.status >= 500 ? 502 : 400);
    }
    return (response.data?.Result ?? {}) as T;
  } catch (error) {
    if (error instanceof FaceLibraryError) throw error;
    throw new FaceLibraryError('Network', `BytePlus could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/** A one-time link for the person to scan their face on their phone (English page). */
export async function createFaceScan(callbackUrl: string): Promise<{ token: string; link: string }> {
  const result = await call<{ BytedToken?: string; H5Link?: string }>('CreateVisualValidateSession', { CallbackURL: callbackUrl });
  if (!result.BytedToken || !result.H5Link) throw new FaceLibraryError('NoSession', 'BytePlus did not return a face-scan link. Try again.');
  const link = /[?&]lng=/.test(result.H5Link) ? result.H5Link : `${result.H5Link}${result.H5Link.includes('?') ? '&' : '?'}lng=en`;
  return { token: result.BytedToken, link };
}

/** The portrait group a finished scan created; null while the person hasn't finished it. */
export async function faceScanResult(token: string): Promise<{ groupId: string | null }> {
  try {
    const result = await call<{ GroupId?: string }>('GetVisualValidateResult', { BytedToken: token });
    return { groupId: result.GroupId || null };
  } catch (error) {
    // Not finished yet reads as an error from BytePlus; anything about setup or keys is real.
    if (error instanceof FaceLibraryError && !/NotConfigured|Unauthorized|Signature|AccessDenied|Forbidden|NoPermission|Network/i.test(error.code)) return { groupId: null };
    throw error;
  }
}

/** Registers a photo of the verified person (a public URL); BytePlus checks it is the same person. */
export async function addFacePhoto(options: { groupId: string; url: string; name: string }): Promise<{ assetId: string }> {
  const result = await call<{ Id?: string }>('CreateAsset', { GroupId: options.groupId, URL: options.url, AssetType: 'Image', Name: options.name.slice(0, 60) });
  if (!result.Id) throw new FaceLibraryError('NoAsset', 'BytePlus did not accept the photo. Try another photo of the same person.');
  return { assetId: result.Id };
}

export type FacePhotoStatus = 'processing' | 'active' | 'failed';

export async function facePhotoStatus(assetId: string): Promise<{ status: FacePhotoStatus; error: string | null }> {
  const result = await call<{ Status?: string; FailedReason?: string; ErrorMessage?: string }>('GetAsset', { Id: assetId });
  const status = (result.Status ?? '').toLowerCase();
  if (status === 'active') return { status: 'active', error: null };
  if (status === 'failed') return { status: 'failed', error: result.FailedReason || result.ErrorMessage || 'BytePlus could not use this photo (it may show another person, or more than one face).' };
  return { status: 'processing', error: null };
}

export async function removeFacePhoto(assetId: string): Promise<void> {
  await call('DeleteAsset', { Id: assetId });
}
