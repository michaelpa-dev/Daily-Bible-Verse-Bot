const fs = require('fs');
const path = require('path');
const { DEFAULT_TRANSLATION } = require('./constants/translations.js');

const projectRoot = path.join(__dirname, '..');
const configFilePath = path.join(projectRoot, 'cfg', 'config.json');
const configSamplePath = path.join(projectRoot, 'cfg', 'config-sample.json');

function readJsonConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {};
  }
}

const primaryConfig = readJsonConfig(configFilePath);
const fallbackConfig = readJsonConfig(configSamplePath);

function pickConfigValue(key, defaultValue) {
  const environmentKey = key
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase();

  if (Object.prototype.hasOwnProperty.call(process.env, environmentKey)) {
    return process.env[environmentKey];
  }

  if (Object.prototype.hasOwnProperty.call(primaryConfig, key)) {
    return primaryConfig[key];
  }

  if (Object.prototype.hasOwnProperty.call(fallbackConfig, key)) {
    return fallbackConfig[key];
  }

  return defaultValue;
}

module.exports = {
  botToken: pickConfigValue('botToken', process.env.BOT_TOKEN || ''),
  bibleApiUrl: pickConfigValue(
    'bibleApiUrl',
    'https://labs.bible.org/api/?type=json&passage='
  ),
  translationApiUrl: pickConfigValue('translationApiUrl', 'https://bible-api.com/'),
  version: pickConfigValue('version', '0.1.1'),
  defaultTranslation: String(
    pickConfigValue('defaultTranslation', DEFAULT_TRANSLATION)
  ).toLowerCase(),
  logLevel: pickConfigValue('logLevel', 'debug'),
};
