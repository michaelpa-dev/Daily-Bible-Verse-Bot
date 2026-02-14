const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { getVersionInfo, __private } = require('../js/services/versionInfo.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dbvb-version-'));
}

test('getVersionInfo prefers env RELEASE_TAG over manifest tag', () => {
  const dir = createTempDir();
  const manifestPath = path.join(dir, 'version.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ tag: 'v1.2.3', sha: 'abc', builtAt: '2024-01-01T00:00:00Z' })
  );

  const packageJsonPath = path.join(dir, 'package.json');
  fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'x', version: '9.9.9' }));

  const info = getVersionInfo({
    environment: {
      RELEASE_TAG: 'canary-deadbeef',
      GIT_SHA: 'deadbeefcafebabe',
      DEPLOY_ENVIRONMENT: 'canary',
      DEPLOYED_AT: '2025-02-01T12:00:00Z',
    },
    manifestPath,
    packageJsonPath,
    disableCache: true,
  });

  assert.equal(info.releaseTag, 'canary-deadbeef');
  assert.equal(info.packageVersion, '9.9.9');
  assert.equal(info.gitSha, 'deadbeefcafe');
  assert.equal(info.builtAt, '2024-01-01T00:00:00.000Z');
  assert.equal(info.deployedAt, '2025-02-01T12:00:00.000Z');
  assert.equal(info.runtimeEnvironment, 'canary');
});

test('normalizeIsoTimestamp converts epoch seconds to ISO', () => {
  assert.equal(__private.normalizeIsoTimestamp('0'), null);
  assert.equal(__private.normalizeIsoTimestamp('1700000000'), new Date(1700000000 * 1000).toISOString());
});
