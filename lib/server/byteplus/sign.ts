import 'server-only';

import { createHash, createHmac } from 'node:crypto';

/**
 * BytePlus OpenAPI request signing (HMAC-SHA256, the "V4" scheme): the Access Key / Secret Key
 * pair signs the method, path, query, a few headers and the body's hash. ModelArk's control
 * API (ark.<region>.byteplusapi.com, e.g. the portrait asset library) takes only signed
 * requests; the ARK_API_KEY used for video tasks does not work there.
 */

const hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding, as the canonical query string needs. */
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function signBytePlusRequest(options: {
  accessKeyId: string;
  secretAccessKey: string;
  host: string;
  region: string;
  service: string;
  query: Record<string, string>;
  body: unknown;
  method?: 'POST' | 'GET';
  now?: Date;
}): SignedRequest {
  const method = options.method ?? 'POST';
  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  // 20261013T091530Z and 20261013
  const xDate = (options.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const shortDate = xDate.slice(0, 8);
  const payloadHash = hex(body);
  const contentType = 'application/json';

  const query = Object.keys(options.query).sort().map((key) => `${encode(key)}=${encode(options.query[key])}`).join('&');
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: options.host,
    'x-content-sha256': payloadHash,
    'x-date': xDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name].trim()}\n`).join('');
  const canonicalRequest = [method, '/', query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${shortDate}/${options.region}/${options.service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, scope, hex(canonicalRequest)].join('\n');
  const kDate = hmac(options.secretAccessKey, shortDate);
  const kRegion = hmac(kDate, options.region);
  const kService = hmac(kRegion, options.service);
  const kSigning = hmac(kService, 'request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    url: `https://${options.host}/?${query}`,
    headers: {
      'Content-Type': contentType,
      Host: options.host,
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate,
      Authorization: `HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  };
}
