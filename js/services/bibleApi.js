const axios = require('axios');
const { logger } = require('../logger.js');
const { bibleApiUrl, translationApiUrl, defaultTranslation } = require('../config.js');
const { normalizeTranslationCode } = require('../constants/translations.js');

function buildReferenceRequestUrl(passage) {
  return `${bibleApiUrl}${encodeURIComponent(passage)}`;
}

function buildTranslationRequestUrl(reference, translation) {
  const trimmedBaseUrl = translationApiUrl.endsWith('/')
    ? translationApiUrl
    : `${translationApiUrl}/`;
  const encodedReference = encodeURIComponent(reference);
  return `${trimmedBaseUrl}${encodedReference}?translation=${translation}`;
}

function buildReferenceFromVerse(verse) {
  return `${verse.bookname} ${verse.chapter}:${verse.verse}`;
}

async function getVerseReference(passage) {
  const requestUrl = buildReferenceRequestUrl(passage);

  logger.debug(`Fetching verse reference from API: ${requestUrl}`);
  const response = await axios.get(requestUrl, { timeout: 15000 });
  const verse = Array.isArray(response.data) ? response.data[0] : null;

  if (!verse || !verse.bookname || !verse.chapter || !verse.verse) {
    return null;
  }

  return verse;
}

async function getTranslatedVerse(reference, translation) {
  const requestUrl = buildTranslationRequestUrl(reference, translation);

  logger.debug(`Fetching translated verse from API: ${requestUrl}`);
  const response = await axios.get(requestUrl, {
    timeout: 15000,
    validateStatus: (status) => status < 500,
  });

  if (response.status !== 200 || !response.data || !Array.isArray(response.data.verses)) {
    return null;
  }

  const verse = response.data.verses[0];
  if (!verse) {
    return null;
  }

  return {
    reference: response.data.reference,
    bookname: verse.book_name,
    chapter: String(verse.chapter),
    verse: String(verse.verse),
    text: verse.text,
    translation: response.data.translation_id || translation,
    translationName: response.data.translation_name || translation.toUpperCase(),
  };
}

async function getRandomBibleVerse(passage, options = {}) {
  const normalizedPassage =
    typeof passage === 'string' && passage.trim().length > 0 ? passage.trim() : 'random';
  const normalizedTranslation = normalizeTranslationCode(options.translation || defaultTranslation);

  try {
    const verseReferenceData = await getVerseReference(normalizedPassage);
    if (!verseReferenceData) {
      return null;
    }

    const verseReference = buildReferenceFromVerse(verseReferenceData);
    const translatedVerse = await getTranslatedVerse(verseReference, normalizedTranslation);

    if (translatedVerse) {
      logger.info(
        `Bible verse fetched successfully for ${verseReference} (${translatedVerse.translation}).`
      );
      return translatedVerse;
    }

    logger.warn(
      `Falling back to source verse text because translation request failed: ${normalizedTranslation}`
    );
    return {
      ...verseReferenceData,
      reference: verseReference,
      translation: 'net',
      translationName: 'New English Translation',
    };
  } catch (error) {
    logger.error('Error fetching Bible verse:', error);
    return null;
  }
}

module.exports = {
  getRandomBibleVerse,
};
