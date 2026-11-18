import { setTimeout as delay } from 'node:timers/promises';
import { blockSource, parseRetryAfter } from './limits.mjs';

const loginPath = /^\/(?:(?:ajax|auth|user)\/)?(?:logowanie|login)\/?$/i;
const loginName = /^(?:login|username|user|email|login_email|login_name|nick)$/i;
const passwordName = /^(?:password|passwd|pass|login_password|haslo|hasło)$/i;
const usernameField = 'input[autocomplete="username"],input[type="email"],input[name*="login" i],input[name*="user" i],input[name*="email" i],input[name="nick" i]';
const passwordField = 'input[type="password"][name]';

// This runs in the top document. A normal Filman page can contain a
// reCAPTCHA badge or a captcha on an unrelated form while signed in.
export function filmanPageState(origin) {
  if (location.origin !== origin) return 'other-origin';
  if (/Just a moment|Verify you are human|Performing security verification|Attention Required|Potwierdź.*człowiek/i.test(document.title)
      || document.querySelector('#cf-challenge-running,#challenge-form')) return 'challenge';
  const account = Array.from(document.querySelectorAll('#belt,#dropdown'));
  if (account.some(element => /Zalogowany jako\s*:/i.test(element.textContent))) return 'signed-in';
  if (/^\/(?:(?:ajax|auth|user)\/)?(?:logowanie|login)\/?$/i.test(location.pathname) || /^\s*Logowanie\b/i.test(document.title)) return 'login';
  return 'unknown';
}

export const filmanNeedsVerification = () => Object.assign(
  new Error('Filman wymaga ręcznej weryfikacji lub logowania. Otwórz „Zaloguj / CAPTCHA” w ustawieniach źródła.'),
  { status: 409, requiresAction: true },
);

export function watchFilmanCredentials(context, origin, onCredentials) {
  function requestSent(request) {
    if (request.method() !== 'POST') return;
    try {
      const target = new URL(request.url());
      const frame = request.frame();
      const page = frame.page();
      const document = new URL(frame.url());
      if (frame !== page.mainFrame() || target.origin !== origin || document.origin !== origin
        || !loginPath.test(target.pathname) || !loginPath.test(document.pathname)) return;
      const body = request.postData();
      if (!body || body.length > 32768) return;
      const fields = Object.entries(request.postDataJSON() ?? {});
      const field = pattern => fields.find(([name]) => pattern.test(name.replace(/^.*\[([^\]]+)\]$/, '$1')))?.[1];
      const username = field(loginName), password = field(passwordName);
      if (typeof username === 'string' && username.trim().length && username.length <= 256
        && typeof password === 'string' && password.length && password.length <= 1024) {
        onCredentials(page, { username, password });
      }
    } catch { /* The browser can report a request before its frame exists. */ }
  }
  context.on('request', requestSent);
  return () => context.off('request', requestSent);
}

async function verificationControl(page, origin) {
  if (new URL(page.url()).origin !== origin) return null;
  let checkbox;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || !frame.url().startsWith('https://')) continue;
    const url = new URL(frame.url());
    let selector;
    const recaptcha = ['www.google.com','www.recaptcha.net'].includes(url.hostname) && /^\/recaptcha\/(?:api2|enterprise)\//.test(url.pathname);
    const hcaptcha = /^(?:[a-z0-9-]+\.)?hcaptcha\.com$/i.test(url.hostname) && url.pathname.startsWith('/captcha/');
    if (recaptcha && url.pathname.endsWith('/bframe') || hcaptcha && url.hash.startsWith('#frame=challenge')) {
      const frameElement = await frame.frameElement().catch(() => null);
      const bounds = await frameElement?.boundingBox().catch(() => null);
      await frameElement?.dispose().catch(() => {});
      if (bounds && bounds.width > 0 && bounds.height > 0 && bounds.y < (page.viewportSize()?.height ?? 1160) && bounds.y + bounds.height > 0) return { manual: true };
    }
    if (recaptcha && url.pathname.endsWith('/anchor')) selector = '#recaptcha-anchor[aria-checked="false"]';
    if (hcaptcha && url.hash.startsWith('#frame=checkbox')) selector = '#checkbox[aria-checked="false"]';
    if (url.hostname === 'challenges.cloudflare.com' && url.pathname.startsWith('/cdn-cgi/challenge-platform/')) {
      selector = 'label:has(input[type="checkbox"]:not(:checked)),input[type="checkbox"]:not(:checked)';
    }
    if (!selector || checkbox) continue;
    const candidate = frame.locator(selector).filter({ visible: true }).first();
    if (await candidate.isVisible().catch(() => false)) checkbox = candidate;
  }
  const ownCheckbox = page.locator('#challenge-form input[type="checkbox"]:not(:checked)').filter({ visible: true }).first();
  if (!checkbox && await ownCheckbox.isVisible().catch(() => false)) checkbox = ownCheckbox;
  return checkbox ? { checkbox } : null;
}

export async function clickFilmanCheckbox(page, origin, { timeout = 0, signal } = {}) {
  const deadline = Date.now() + timeout;
  do {
    signal?.throwIfAborted();
    const control = await verificationControl(page, origin);
    if (control?.manual) return 'manual';
    if (control?.checkbox) {
      // Only use the provider's visible checkbox. An image prompt stays open for the user.
      return await control.checkbox.click({ timeout: 1800 }).then(() => 'clicked', () => 'manual');
    }
    if (Date.now() >= deadline) break;
    await delay(200, undefined, { signal });
  } while (Date.now() < deadline);
  return 'absent';
}

async function filmanLoginForm(page, origin) {
  if (new URL(page.url()).origin !== origin || !loginPath.test(new URL(page.url()).pathname)) return null;
  const forms = page.locator('form').filter({ has: page.locator(passwordField) }).filter({ visible: true });
  if (await forms.count() !== 1) return null;
  const form = await forms.elementHandle({ timeout: 1000 }).catch(() => null);
  if (!form) return null;
  const action = await form.evaluate(element => {
    const submit = element.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
    return {
      origin: location.origin, action: submit?.hasAttribute('formaction') ? submit.formAction : element.action,
      method: submit?.hasAttribute('formmethod') ? submit.formMethod : element.method,
    };
  });
  const destination = new URL(action.action);
  if (action.origin === origin && destination.origin === origin && loginPath.test(destination.pathname) && action.method === 'post') return form;
  await form.dispose();
  return null;
}

export async function navigateFilman(page, address, source, signal, recovery = {}) {
  const target = new URL(address);
  const { origin } = target;
  const options = { referer: source.url, waitUntil: 'domcontentloaded', timeout: 30000 };
  let clicked = false;
  const pageState = () => page.evaluate(filmanPageState, origin).catch(() => 'challenge');
  const navigation = timeout => page.waitForNavigation({
    url: next => next.origin === origin, waitUntil: 'domcontentloaded', timeout,
  }).catch(() => null);
  const rateLimit = response => {
    if (response?.status() !== 429) return;
    const retryAfter = blockSource(source.id, parseRetryAfter(response.headers()['retry-after']));
    throw Object.assign(new Error('Filman ograniczył liczbę zapytań. Spróbuj ponownie później.'), { status: 429, retryAfter });
  };
  async function verify(response) {
    rateLimit(response);
    let state = await pageState();
    if (state !== 'challenge' && response?.headers()['cf-mitigated'] !== 'challenge') return { response, state };

    // A browser check can finish by itself. Give it time before touching a checkbox.
    response = await navigation(2200) ?? response;
    rateLimit(response);
    signal?.throwIfAborted();
    state = await pageState();
    if (state !== 'challenge' && response?.headers()['cf-mitigated'] !== 'challenge') return { response, state };
    if (recovery.disabled || clicked) throw filmanNeedsVerification();
    const resumed = navigation(8500);
    recovery.attempted = true;
    const control = await clickFilmanCheckbox(page, origin, { timeout: 1800, signal });
    if (control === 'manual') throw filmanNeedsVerification();
    if (control === 'clicked') clicked = true;
    const resolved = control === 'clicked' ? await resumed : null;
    signal?.throwIfAborted();
    response = resolved ?? response;
    rateLimit(response);
    state = await pageState();
    if (state === 'challenge' || state === 'other-origin' || resolved?.headers()['cf-mitigated'] === 'challenge') throw filmanNeedsVerification();
    return { response, state, verified: true };
  }
  const visit = async (url, timeout = options.timeout) => {
    signal?.throwIfAborted();
    return verify(await page.goto(url, { ...options, timeout }));
  };

  let result = await visit(address);
  const credentials = result.state === 'login' && !recovery.disabled ? recovery.loadCredentials?.() : undefined;
  if (credentials) {
    if (!loginPath.test(new URL(page.url()).pathname)) result = await visit(new URL('/logowanie', origin).href, 10000);
    if (result.state !== 'signed-in') {
      const form = await filmanLoginForm(page, origin);
      if (!form) throw filmanNeedsVerification();
      try {
        const username = await form.$(':is('+usernameField+'):not([type="password"],[type="hidden"])');
        const password = await form.$(passwordField);
        const submit = await form.$('button[type="submit"],input[type="submit"],button:not([type])');
        if (!username || !password || !submit) throw filmanNeedsVerification();
        recovery.attempted = true;
        await username.fill(credentials.username, { timeout: 1500 });
        await password.fill(credentials.password, { timeout: 1500 });
        if (!clicked) {
          const control = await clickFilmanCheckbox(page, origin, { timeout: 600, signal });
          if (control === 'manual') throw filmanNeedsVerification();
          if (control === 'clicked') {
            clicked = true;
            // The checkbox can open a second step before the login form is ready.
            await delay(650, undefined, { signal });
            if ((await verificationControl(page, origin))?.manual) throw filmanNeedsVerification();
          }
        }
        const submitted = navigation(7500);
        await submit.click({ timeout: 2000 });
        result = await verify(await submitted);
        if (result.state !== 'signed-in') throw filmanNeedsVerification();
      } catch (error) {
        signal?.throwIfAborted();
        if (error.status === 429) throw error;
        throw filmanNeedsVerification();
      } finally {
        await form.dispose().catch(() => {});
      }
    }
    result = await visit(address, 10000);
  }
  if (result.state !== 'login' && ([401,403].includes(result.response?.status())
    || result.verified && new URL(page.url()).pathname !== target.pathname
    || result.state === 'signed-in' && loginPath.test(new URL(page.url()).pathname))) {
    await delay(500, undefined, { signal });
    result = await visit(address, 10000);
  }
  if (result.state === 'login') throw filmanNeedsVerification();
  if (result.state === 'other-origin' || result.response?.status() >= 400) throw Object.assign(
    new Error('Filman chwilowo nie udostępnia tej strony. Ponów próbę za chwilę.'),
    { status: 503 },
  );
  return result.response;
}
