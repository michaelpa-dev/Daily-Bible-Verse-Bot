const DEFAULT_TRANSLATION = 'web';

const SUPPORTED_TRANSLATIONS = [
  { label: 'World English Bible', value: 'web' },
  { label: 'King James Version', value: 'kjv' },
  { label: 'American Standard Version (1901)', value: 'asv' },
  { label: 'Bible in Basic English', value: 'bbe' },
  { label: 'Darby Bible', value: 'darby' },
  { label: 'Douay-Rheims 1899 American Edition', value: 'dra' },
  { label: 'World English Bible, British Edition', value: 'webbe' },
  { label: "Young's Literal Translation (NT only)", value: 'ylt' },
];

const supportedTranslationSet = new Set(
  SUPPORTED_TRANSLATIONS.map((translation) => translation.value)
);

function normalizeTranslationCode(rawCode) {
  if (typeof rawCode !== 'string' || rawCode.trim().length === 0) {
    return DEFAULT_TRANSLATION;
  }

  const normalizedCode = rawCode.trim().toLowerCase();
  return supportedTranslationSet.has(normalizedCode) ? normalizedCode : DEFAULT_TRANSLATION;
}

function isSupportedTranslation(rawCode) {
  if (typeof rawCode !== 'string') {
    return false;
  }

  return supportedTranslationSet.has(rawCode.trim().toLowerCase());
}

function getTranslationLabel(code) {
  const normalizedCode = normalizeTranslationCode(code);
  const match = SUPPORTED_TRANSLATIONS.find((translation) => translation.value === normalizedCode);
  return match ? match.label : 'World English Bible';
}

function toDiscordChoices() {
  return SUPPORTED_TRANSLATIONS.map((translation) => ({
    name: translation.label,
    value: translation.value,
  }));
}

module.exports = {
  DEFAULT_TRANSLATION,
  SUPPORTED_TRANSLATIONS,
  getTranslationLabel,
  isSupportedTranslation,
  normalizeTranslationCode,
  toDiscordChoices,
};
