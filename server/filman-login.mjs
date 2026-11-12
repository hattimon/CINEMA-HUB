import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const closeWindowScript = fileURLToPath(new URL('./close-chromium-window.py', import.meta.url));

export async function launchFilmanLogin(executable, profile, url) {
  const browser = spawn(executable, [
    '--no-sandbox',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,1160',
    '--window-position=0,0',
    url,
  ], { stdio: 'ignore' });
  const exited = new Promise(resolve => browser.once('close', (code, signal) => resolve({ code, signal })));
  browser.on('error', error => console.error('filman_login_browser', error.code));
  try {
    await once(browser, 'spawn');
  } catch {
    throw Object.assign(new Error('Nie udało się uruchomić przeglądarki logowania Filmana.'), { status: 503 });
  }

  return {
    exited,
    async close() {
      if (browser.exitCode !== null || browser.signalCode !== null) return;
      // The normal window close flushes recently received login cookies before exiting.
      const closeRequest = spawn('python3', [closeWindowScript, String(browser.pid)], {
        stdio: 'ignore', signal: AbortSignal.timeout(2000),
      });
      const [sent] = await once(closeRequest, 'close').catch(() => [1]);
      if (sent === 0 && await Promise.race([exited.then(() => true), delay(5000, false, { ref: false })])) return;

      if (browser.exitCode !== null || browser.signalCode !== null) return;
      browser.kill('SIGTERM');
      const deadline = setTimeout(() => browser.kill('SIGKILL'), 7000);
      try {
        await exited;
        throw Object.assign(new Error('Nie udało się potwierdzić zapisu sesji Filmana. Otwórz logowanie ponownie.'), { status: 503 });
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
