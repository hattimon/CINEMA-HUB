import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const { version, androidTvClientVersion: apkVersion } = JSON.parse(read('package.json'));

test('Server release keeps the existing Android TV APK and its checksum', () => {
  const apk = `releases/CinemaHub-AndroidTV-v${apkVersion}.apk`;
  const dockerfile = read('Dockerfile');
  const dockerignore = read('.dockerignore');
  const workflow = read('.github/workflows/container.yml');
  assert.ok(existsSync(new URL(apk, root)), `Missing ${apk}`);
  assert.equal(version, '1.3.27');
  assert.equal(apkVersion, '1.3.26');
  assert.ok(dockerfile.includes(`COPY ${apk} ./clients/CinemaHub-AndroidTV-v${apkVersion}.apk`));
  assert.ok(dockerignore.split(/\r?\n/).includes(`!${apk}`));
  const checksum = `releases/SHA256SUMS-AndroidTV-v${apkVersion}.txt`;
  assert.ok(dockerignore.split(/\r?\n/).includes(`!${checksum}`));
  assert.ok(dockerfile.includes(`COPY ${checksum} ./${checksum}`));
  assert.ok(workflow.includes('Verify Android TV APK is available to Docker'));
  assert.match(workflow, /APK_VERSION: \$\{\{ steps\.version\.outputs\.apk_version \}\}/);
  assert.ok(existsSync(new URL(`releases/SHA256SUMS-AndroidTV-v${apkVersion}.txt`, root)));
  const packager = read('ops/package-server.ps1');
  assert.ok(packager.includes("'.github/workflows/container.yml'"));
  assert.ok(packager.includes("'tests/release-ci.test.mjs'"));
  assert.match(packager, /androidTvClient = \[ordered\]@\{ version = \$apkVersion/);
  assert.match(packager, /Android TV client checksum mismatch/);
});

test('CI tests the full application with its dev-only TypeScript dependency before pushing', () => {
  const dockerfile = read('Dockerfile');
  const workflow = read('.github/workflows/container.yml');
  assert.match(dockerfile, /FROM runtime AS ci_test/);
  assert.match(dockerfile, /COPY --from=frontend \/app\/node_modules\/typescript \.\/node_modules\/typescript/);
  assert.match(dockerfile, /COPY tests \.\/tests/);
  assert.match(dockerfile, /COPY src \.\/src/);
  assert.match(dockerfile, /COPY install-windows\.ps1 install-raspberry-pi\.sh \.\//);
  assert.match(dockerfile, /COPY Dockerfile \.dockerignore \.\//);
  assert.match(dockerfile, /COPY \.github\/workflows\/container\.yml \.\/\.github\/workflows\/container\.yml/);
  assert.match(dockerfile, /COPY ops\/package-server\.ps1 \.\/ops\/package-server\.ps1/);
  assert.ok(dockerfile.includes(`COPY releases/CinemaHub-AndroidTV-v${apkVersion}.apk ./releases/CinemaHub-AndroidTV-v${apkVersion}.apk`));
  assert.match(dockerfile, /FROM runtime AS release\s*$/);
  assert.doesNotMatch(read('.dockerignore'), /^tests\s*$/m);
  assert.match(workflow, /target: release/);
  assert.match(workflow, /--target ci_test/);
  assert.match(workflow, /sh -n install-raspberry-pi\.sh/);
  assert.match(workflow, /timeout-minutes: 25/);
  assert.ok(workflow.indexOf('node --test --test-concurrency=1 --test-force-exit --test-timeout=900000 tests/*.test.mjs') < workflow.indexOf('push: true'));
});

test('Windows installer separates local builds from published GHCR images', () => {
  const installer = read('install-windows.ps1');
  assert.match(installer, /"INITIAL_ADMIN_PASSWORD=\$cinemaPassword"/);
  assert.match(installer, /cinema-hub:local-\$cinemaVersion/);
  assert.match(installer, /\$previousImage = \[Environment\]::GetEnvironmentVariable\('APP_IMAGE', 'Process'\)/);
  assert.match(installer, /SetEnvironmentVariable\('APP_IMAGE', \$previousImage, 'Process'\)/);
  assert.match(installer, /'compose', 'pull', 'cinema'/);
  assert.match(installer, /'compose', 'up', '-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', 'cinema'/);
  assert.ok(installer.indexOf("'compose', 'pull', 'cinema'") < installer.lastIndexOf("'compose', 'up', '-d'"));
  assert.match(installer, /if \(\$LASTEXITCODE -ne 0\) \{ throw/);
  assert.match(installer, /Set-CinemaPublishedImage -Image \$publishedImage/);
  assert.ok(installer.indexOf("'compose', 'up', '-d'") < installer.lastIndexOf('Set-CinemaPublishedImage -Image $publishedImage'));
});

test('Raspberry Pi installer pulls before replacement and retains a rollback image', () => {
  const installer = read('install-raspberry-pi.sh');
  assert.match(installer, /"INITIAL_ADMIN_PASSWORD=\$cinema_password"/);
  assert.match(installer, /compose -f compose\.pi\.yaml pull cinema/);
  assert.ok(installer.includes(`APP_IMAGE=ghcr.io/hattimon/cinema-hub:${version}`));
  assert.ok(installer.includes(`APP_IMAGE=cinema-hub:local-${version}`));
  assert.match(installer, /docker compose -f compose\.pi\.yaml build cinema/);
  assert.match(installer, /docker inspect --format '\{\{\.Image\}\}'/);
  assert.match(installer, /docker image tag "\$old_image" "\$rollback_tag"/);
  assert.match(installer, /cp -p \.env "\$backup"/);
  assert.match(installer, /awk -v image="\$APP_IMAGE"/);
  assert.match(installer, /compose -f compose\.pi\.yaml up -d --no-build --no-deps --pull never --wait cinema/);
  assert.ok(installer.indexOf('compose -f compose.pi.yaml pull cinema') < installer.indexOf('compose -f compose.pi.yaml up -d'));
});

test('ARM64 fullscreen browser test exercises playback through a VP8 WebM fixture', () => {
  const suite = read('tests/app.test.mjs');
  assert.match(suite, /'-c:v','libvpx'/);
  assert.match(suite, /if\(url\.pathname==='\/film\.webm'\)return sendVideo\(req,res,webmBuffer,'video\/webm'\)/);
  assert.match(suite, /fullscreenWebM=true/);
  assert.doesNotMatch(suite, /Hosted ARM64 Chromium cannot decode/);
  assert.match(suite, /Fullscreen WebM playback fixture did not start/);
});

test('Manual CI runs on main validate both architectures without publishing an untagged release', () => {
  const workflow = read('.github/workflows/container.yml');
  assert.match(workflow, /push:\s+branches: \['main'\]\s+tags: \['v\*'\]/);
  assert.match(workflow, /publish_arch:\s+if: github\.ref_type == 'tag'\s+needs: build/);
  assert.match(workflow, /publish:\s+if: github\.ref_type == 'tag'\s+needs: publish_arch/);
  assert.match(workflow, /publish:\s+if: github\.ref_type == 'tag'/);
});

test('GitHub Release can only be created after both native architectures publish successfully', () => {
  const workflow = read('.github/workflows/container.yml');
  assert.match(workflow, /release:\s+if: github\.ref_type == 'tag'\s+needs: publish/);
  assert.match(workflow, /gh release create "v\$version" --verify-tag/);
  const releaseStep = workflow.slice(workflow.indexOf('      - name: Publish GitHub Release'));
  assert.match(releaseStep, /apk_version=\$\(node -p "require\('\.\/package\.json'\)\.androidTvClientVersion"\)/);
  assert.match(workflow, /SHA256SUMS-AndroidTV-v\$apk_version\.txt/);
  assert.match(workflow, /SHA256SUMS-Server-v\$version\.txt/);
  assert.doesNotMatch(workflow, /"releases\/CinemaHub-AndroidTV-v\$version\.apk"/);
  assert.doesNotMatch(workflow, /"releases\/SHA256SUMS-AndroidTV-v\$version\.txt"/);
  const ghRelease = workflow.slice(workflow.indexOf('gh release create'));
  assert.match(ghRelease, /"releases\/CinemaHub-AndroidTV-v\$apk_version\.apk"/);
  assert.match(ghRelease, /"releases\/SHA256SUMS-AndroidTV-v\$apk_version\.txt"/);
  assert.doesNotMatch(ghRelease, /"releases\/CinemaHub-AndroidTV-v\$version\.apk"/);
  assert.match(workflow, /\.androidTvClient\.version/);
});
