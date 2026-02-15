const { getVersionInfo } = require('./versionInfo.js');

function getBuildInfo(options = {}) {
  const info = getVersionInfo(options);

  // Keep backward compatibility with older call sites:
  // - version historically meant "semantic version", but in practice the deploy system is tag-driven
  //   (vX.Y.Z for production, canary-<sha> for canary). Prefer the release tag when available.
  const version = info.releaseTag || info.packageVersion || 'unknown';

  return {
    version,
    packageVersion: info.packageVersion || 'unknown',
    releaseTag: info.releaseTag || 'unknown',
    gitSha: info.gitSha || 'unknown',
    builtAt: info.builtAt,
    deployedAt: info.deployedAt,
    runtimeEnvironment: info.runtimeEnvironment || 'unknown',
  };
}

module.exports = {
  getBuildInfo,
};
