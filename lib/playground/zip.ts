'use client';

import { Zip, ZipPassThrough } from 'fflate';

export interface ZipFile {
  name: string;
  url: string;
}

/**
 * Downloads the images and saves them as one ZIP, built in the browser. Images are already
 * compressed, so they're stored as they are (fast, no extra quality loss).
 */
export async function downloadZip(files: ZipFile[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk);
  });

  const used = new Set<string>();
  let done = 0;
  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Couldn't download ${file.name} (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let name = file.name;
    for (let i = 2; used.has(name); i++) name = file.name.replace(/(\.\w+)$/, `-${i}$1`);
    used.add(name);
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
    onProgress?.(++done, files.length);
  }
  zip.end();
  if (failure) throw failure;

  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** "01-hero-shot-of-the-tea-box-9x16.jpg" */
export function imageFileName(position: number, prompt: string, ratio: string, url: string, variation = 1): string {
  const extension = url.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase() ?? 'jpg';
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'image';
  const index = String(position + 1).padStart(2, '0');
  return `${index}-${slug}-${ratio.replace(':', 'x')}${variation > 1 ? `-v${variation}` : ''}.${extension}`;
}
