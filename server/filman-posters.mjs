import { networkURL } from './net.mjs';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const maxBytes = 8 * 1024 * 1024;

export function filmanPosterURL(source, address) {
  if (source.type !== 'filman') return null;
  const target = networkURL(address);
  if (target.origin !== networkURL(source.url).origin) return null;
  return /^\/public\/static\/poster\/.+\.(?:jpe?g|png|webp|gif|avif)$/i.test(target.pathname) ? target : null;
}

export async function openFilmanPosterPage(context, origin) {
  const page = await context.newPage();
  const address = new URL('/', origin).href;
  try {
    // Give Chromium a same-origin document for image requests without loading the portal a second time.
    await page.route(address, route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': "default-src 'none'; connect-src 'self'; base-uri 'none'" },
      body: '<!doctype html><title>Cinema Hub</title>',
    }), { times: 1 });
    await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 6000 });
    return page;
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

export async function readFilmanPoster(page, address) {
  const result = await page.evaluate(async ({ address, imageTypes, maxBytes }) => {
    try {
      const response = await fetch(address, {
        mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (response.status !== 200 || !response.body || !imageTypes.includes(type) || Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        return null;
      }

      const stream = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await stream.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await stream.cancel();
          return null;
        }
        chunks.push(value);
      }
      if (!bytes) return null;
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(new Blob(chunks, { type }));
      });
      return { type, data };
    } catch {
      return null;
    }
  }, { address, imageTypes, maxBytes }).catch(error => {
    if (page.isClosed()) return null;
    throw error;
  });
  return result ? { type: result.type, body: Buffer.from(result.data, 'base64') } : null;
}
