import { setTimeout as delay } from 'node:timers/promises';
import { blockSource, parseRetryAfter } from './limits.mjs';

// This runs in the top document. A normal Filman page can contain a
// reCAPTCHA badge or a captcha on an unrelated form while signed in.
export function filmanPageState(origin) {
  if (location.origin !== origin) return 'other-origin';
  if (/Just a moment|Verify you are human|Performing security verification|Attention Required|Potwierdź.*człowiek/i.test(document.title)
      || document.querySelector('#cf-challenge-running,#challenge-form')) return 'challenge';
  const account = Array.from(document.querySelectorAll('#belt,#dropdown'));
  if (account.some(element => /Zalogowany jako\s*:/i.test(element.textContent))) return 'signed-in';
  if (/^\/logowanie\/?$/i.test(location.pathname) || /^\s*Logowanie\b/i.test(document.title)) return 'login';
  return 'unknown';
}

export const filmanNeedsVerification = () => Object.assign(
  new Error('Filman wyświetlił weryfikację. Dokończ ją w ustawieniach źródła pod „Zaloguj / CAPTCHA”.'),
  { status: 409, requiresAction: true },
);

export async function navigateFilman(page, address, source, signal) {
  const target = new URL(address);
  const options = { referer: source.url, waitUntil: 'domcontentloaded', timeout: 30000 };
  let response = await page.goto(address, options);
  let state = await page.evaluate(filmanPageState, target.origin);
  const isChallenge = () => state === 'challenge' || response?.headers()['cf-mitigated'] === 'challenge';

  if (isChallenge()) {
    // Chromium can finish a browser check on its own. Leave interactive
    // challenges alone and give the normal navigation a brief chance to finish.
    const resumed = await page.waitForNavigation({
      url: next => next.origin === target.origin,
      waitUntil: 'domcontentloaded',
      timeout: 3500,
    }).catch(() => null);
    signal?.throwIfAborted();
    state = await page.evaluate(filmanPageState, target.origin).catch(() => 'challenge');
    if (resumed) {
      if (new URL(page.url()).pathname === target.pathname || state === 'login') response = resumed;
    }
    if (isChallenge() && state === 'challenge') throw filmanNeedsVerification();
  }

  if (isChallenge() || [401, 403].includes(response?.status()) || (state === 'signed-in' && /^\/logowanie\/?$/i.test(new URL(page.url()).pathname))) {
    signal?.throwIfAborted();
    await delay(500, undefined, { signal });
    response = await page.goto(address, { ...options, timeout: 10000 });
    state = await page.evaluate(filmanPageState, target.origin);
  }
  if (response?.status() === 429) {
    const retryAfter = blockSource(source.id, parseRetryAfter(response.headers()['retry-after']));
    throw Object.assign(new Error('Filman ograniczył liczbę zapytań. Spróbuj ponownie później.'), { status: 429, retryAfter });
  }
  if (isChallenge()) throw filmanNeedsVerification();
  if (state === 'login') throw Object.assign(
    new Error('Filman wyświetlił formularz logowania. Zaloguj się w ustawieniach źródła.'),
    { status: 409, requiresAction: true },
  );
  if (state === 'other-origin' || response?.status() >= 400) throw Object.assign(
    new Error('Filman chwilowo nie udostępnia tej strony. Ponów próbę za chwilę.'),
    { status: 503 },
  );
  return response;
}
