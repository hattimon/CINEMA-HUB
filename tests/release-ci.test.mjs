import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const version = JSON.parse(read('package.json')).version;

test('Android TV APK matches the version included in the container build context', () => {
  const apk = `releases/CinemaHub-AndroidTV-v${version}.apk`;
  const dockerfile = read('Dockerfile');
  const dockerignore = read('.dockerignore');
  const workflow = read('.github/workflows/container.yml');
  assert.ok(existsSync(new URL(apk, root)), `Missing ${apk}`);
  assert.ok(dockerfile.includes(`COPY ${apk} ./clients/CinemaHub-AndroidTV-v${version}.apk`));
  assert.ok(dockerignore.split(/\r?\n/).includes(`!${apk}`));
  assert.ok(workflow.includes('Verify Android TV APK is available to Docker'));
  const packager = read('ops/package-server.ps1');
  assert.ok(packager.includes("'.github/workflows/container.yml'"));
  assert.ok(packager.includes("'tests/release-ci.test.mjs'"));
});

test('CI tests the full application with its dev-only TypeScript dependency before pushing', () => {
  const dockerfile = read('Dockerfile');
  const workflow = read('.github/workflows/container.yml');
  assert.match(dockerfile, /FROM runtime AS ci_test/);
  assert.match(dockerfile, /COPY --from=frontend \/app\/node_modules\/typescript \.\/node_modules\/typescript/);
  assert.match(dockerfile, /COPY tests \.\/tests/);
  assert.match(dockerfile, /COPY src \.\/src/);
  assert.match(dockerfile, /COPY Dockerfile \.dockerignore \.\//);
  assert.match(dockerfile, /COPY \.github\/workflows\/container\.yml \.\/\.github\/workflows\/container\.yml/);
  assert.match(dockerfile, /COPY ops\/package-server\.ps1 \.\/ops\/package-server\.ps1/);
  assert.ok(dockerfile.includes(`COPY releases/CinemaHub-AndroidTV-v${version}.apk ./releases/CinemaHub-AndroidTV-v${version}.apk`));
  assert.match(dockerfile, /FROM runtime AS release\s*$/);
  assert.doesNotMatch(read('.dockerignore'), /^tests\s*$/m);
  assert.match(workflow, /target: release/);
  assert.match(workflow, /--target ci_test/);
  assert.ok(workflow.indexOf('node --test tests/*.test.mjs') < workflow.indexOf('docker push "$IMAGE:$VERSION-$ARCH"'));
});
