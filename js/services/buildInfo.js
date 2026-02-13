const { execSync } = require('child_process');
const { version } = require('../config.js');

let cachedGitSha = null;

function resolveGitSha() {
  if (cachedGitSha !== null) {
    return cachedGitSha;
  }

  const environmentSha =
    process.env.GIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
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
  } catch (error) {
    cachedGitSha = 'unknown';
  }

  return cachedGitSha;
}

function getBuildInfo() {
  return {
    version,
    gitSha: resolveGitSha(),
  };
}

module.exports = {
  getBuildInfo,
};
