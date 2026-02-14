const fs = require('fs');
const path = require('path');
const { DEFAULT_TRANSLATION } = require('./constants/translations.js');

const projectRoot = path.join(__dirname, '..');
const configFilePath = path.join(projectRoot, 'cfg', 'config.json');
const configSamplePath = path.join(projectRoot, 'cfg', 'config-sample.json');
const MANAGED_TOKEN_ENVIRONMENTS = new Set(['production', 'canary', 'staging']);

function readJsonConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

const primaryConfig = readJsonConfig(configFilePath);
const fallbackConfig = readJsonConfig(configSamplePath);

function pickConfigValue(key, defaultValue, options = {}) {
  const { environment = process.env, primary = primaryConfig, fallback = fallbackConfig } = options;
  const environmentKey = key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();

  if (Object.prototype.hasOwnProperty.call(environment, environmentKey)) {
    return environment[environmentKey];
  }

  if (Object.prototype.hasOwnProperty.call(primary, key)) {
    return primary[key];
  }

  if (Object.prototype.hasOwnProperty.call(fallback, key)) {
    return fallback[key];
  }

  return defaultValue;
}

function resolveRuntimeEnvironment(environment = process.env) {
  return String(
    environment.DEPLOY_ENVIRONMENT || environment.APP_ENV || environment.NODE_ENV || ''
  ).toLowerCase();
}

function resolveBotToken(options = {}) {
  const { environment = process.env, primary = primaryConfig } = options;
  const environmentToken = String(environment.BOT_TOKEN || '').trim();
  if (environmentToken) {
    return environmentToken;
  }

  const runtimeEnvironment = resolveRuntimeEnvironment(environment);
  const allowFileToken = String(environment.ALLOW_FILE_BOT_TOKEN || '').toLowerCase() === 'true';

  if (MANAGED_TOKEN_ENVIRONMENTS.has(runtimeEnvironment) && !allowFileToken) {
    return '';
  }

  const configToken = Object.prototype.hasOwnProperty.call(primary, 'botToken')
    ? String(primary.botToken || '').trim()
    : '';

  return configToken;
}

module.exports = {
  botToken: resolveBotToken(),
  bibleApiUrl: pickConfigValue('bibleApiUrl', 'https://labs.bible.org/api/?type=json&passage='),
  translationApiUrl: pickConfigValue('translationApiUrl', 'https://bible-api.com/'),
  issueTrackerUrl: pickConfigValue(
    'issueTrackerUrl',
    'https://github.com/michaelpa-dev/Daily-Bible-Verse-Bot/issues/new'
  ),
  version: pickConfigValue('version', '0.1.1'),
  defaultTranslation: String(
    pickConfigValue('defaultTranslation', DEFAULT_TRANSLATION)
  ).toLowerCase(),
  logLevel: pickConfigValue('logLevel', 'debug'),
  __private: {
    pickConfigValue,
    resolveBotToken,
    resolveRuntimeEnvironment,
    MANAGED_TOKEN_ENVIRONMENTS,
  },
};
