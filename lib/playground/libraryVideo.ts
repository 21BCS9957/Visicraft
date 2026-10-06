/** Limits for Library videos, shared by the browser (upload checks) and the server. */

/** The source-video bucket's upload limit. */
export const MAX_LIBRARY_VIDEO_BYTES = 50 * 1024 * 1024;
/** Longest reference video, in seconds. */
export const MAX_LIBRARY_VIDEO_SECONDS = 180;
/** Evenly spaced stills taken from each video at upload (Claude sees the ones nearest each shot). */
export const VIDEO_FRAME_COUNT = 12;
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const VIDEO_ACCEPT = { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'], 'video/quicktime': ['.mov'] };
/** Reference videos per video. */
export const MAX_REFERENCE_VIDEOS = 3;
/** The folder uploads from the Video Studio go into. */
export const REFERENCE_VIDEO_FOLDER = 'Reference videos';
