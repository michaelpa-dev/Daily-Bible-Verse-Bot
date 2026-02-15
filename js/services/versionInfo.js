const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', '..', 'build', 'version.json');
const DEFAULT_PACKAGE_JSON_PATH = path.join(__dirname, '..', '..', 'package.json');

let cachedPackageVersion = null;
let cachedGitSha = null;

function readJsonFile(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeIsoTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  // Allow build/deploy scripts to provide either ISO timestamps or epoch seconds.
  if (/^\d+$/.test(raw)) {
    const epochSeconds = Number(raw);
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) {
      return null;
    }

    return new Date(epochSeconds * 1000).toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveRuntimeEnvironment(environment = process.env) {
  return String(
    environment.DEPLOY_ENVIRONMENT || environment.APP_ENV || environment.NODE_ENV || ''
  )
    .trim()
    .toLowerCase();
}

function resolvePackageVersion(options = {}) {
  if (cachedPackageVersion !== null && !options.packageJsonPath) {
    return cachedPackageVersion;
  }

  const packageJsonPath = options.packageJsonPath || DEFAULT_PACKAGE_JSON_PATH;
  const packageJson = readJsonFile(packageJsonPath);
  const version = String(packageJson?.version || '').trim() || null;

  if (!options.packageJsonPath) {
    cachedPackageVersion = version;
  }

  return version;
}

function resolveGitSha(options = {}) {
  if (cachedGitSha !== null && !options.disableCache) {
    return cachedGitSha;
  }

  const environment = options.environment || process.env;

  const environmentSha =
    environment.GIT_SHA ||
    environment.COMMIT_SHA ||
    environment.GITHUB_SHA ||
    '';
  if (environmentSha) {
    cachedGitSha = String(environmentSha).slice(0, 12);
    return cachedGitSha;
  }

  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    cachedGitSha = sha || 'unknown';
  } catch {
    cachedGitSha = 'unknown';
  }

  return cachedGitSha;
}

function resolveManifest(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = readJsonFile(manifestPath);
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  const tag = String(manifest.tag || manifest.releaseTag || '').trim() || null;
  const sha = String(manifest.sha || '').trim() || null;
  const builtAt = normalizeIsoTimestamp(manifest.builtAt);

  return {
    tag,
    sha,
    builtAt,
    raw: manifest,
  };
}

function resolveReleaseTag(environment = process.env, manifest) {
  const fromEnv =
    String(environment.RELEASE_TAG || environment.APP_VERSION || '').trim() ||
    String(environment.GITHUB_REF_NAME || '').trim();

  if (fromEnv) {
    return fromEnv;
  }

  if (manifest?.tag) {
    return manifest.tag;
  }

  return null;
}

function resolveDeployedAt(environment = process.env) {
  const deployedAt =
    normalizeIsoTimestamp(environment.DEPLOYED_AT) ||
    normalizeIsoTimestamp(environment.DEPLOY_TIME) ||
    null;
  return deployedAt;
}

function getVersionInfo(options = {}) {
  const environment = options.environment || process.env;
  const runtimeEnvironment = resolveRuntimeEnvironment(environment);
  const manifest = resolveManifest(options);
  const packageVersion = resolvePackageVersion(options);

  const releaseTag = resolveReleaseTag(environment, manifest);
  const gitSha = resolveGitSha({ ...options, environment });
  const builtAt = manifest?.builtAt || null;
  const deployedAt = resolveDeployedAt(environment);

  return {
    runtimeEnvironment,
    packageVersion,
    releaseTag,
    gitSha,
    builtAt,
    deployedAt,
    manifest,
  };
}

module.exports = {
  getVersionInfo,
  __private: {
    DEFAULT_MANIFEST_PATH,
    DEFAULT_PACKAGE_JSON_PATH,
    normalizeIsoTimestamp,
    readJsonFile,
    resolveDeployedAt,
    resolveGitSha,
    resolveManifest,
    resolvePackageVersion,
    resolveReleaseTag,
    resolveRuntimeEnvironment,
  },
};
