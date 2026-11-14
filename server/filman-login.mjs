import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const closeWindowScript = fileURLToPath(new URL('./close-chromium-window.py', import.meta.url));

async function availableLoopbackPort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}

export async function launchFilmanBrowser(executable, profile, url, { display, background = false } = {}) {
  const port = await availableLoopbackPort();
  const browser = spawn(executable, [
    '--no-sandbox',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    '--window-size=1600,1160',
    '--window-position=0,0',
    ...(background ? ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] : []),
    url,
  ], {
    env: display ? { ...process.env, DISPLAY: display } : process.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = new Promise(resolve => browser.once('close', resolve));
  browser.on('error', error => console.error('filman_browser', error.code));

  // Only attach to the endpoint announced by this Chromium process. No
  // debugging port is forwarded out of the container.
  const announced = Promise.withResolvers();
  let stderr = '';
  function readEndpoint(chunk) {
    stderr = (stderr + chunk).slice(-4096);
    const endpoint = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f\d-]+)/.exec(stderr)?.[1];
    if (!endpoint || Number(new URL(endpoint).port) !== port) return;
    browser.stderr.off('data', readEndpoint);
    browser.stderr.resume();
    announced.resolve(endpoint);
  }
  browser.stderr.setEncoding('utf8').on('data', readEndpoint);
  try {
    await once(browser, 'spawn');
  } catch {
    throw Object.assign(new Error('Nie udało się uruchomić przeglądarki Filmana.'), { status: 503 });
  }

  return {
    exited,
    async endpoint() {
      const url = await Promise.race([announced.promise, exited.then(() => null), delay(6000, null, { ref: false })]);
      if (!url) throw Object.assign(new Error('Przeglądarka Filmana nie udostępniła połączenia lokalnego.'), { status: 503 });
      return url;
    },
    async close() {
      if (browser.exitCode !== null || browser.signalCode !== null) return;
      // A normal window close flushes recently received login cookies.
      const closeRequest = spawn('python3', [closeWindowScript, String(browser.pid)], {
        env: display ? { ...process.env, DISPLAY: display } : process.env,
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
