const axios = require('axios');
const { logger } = require('../logger.js');
const { bibleApiUrl, translationApiUrl, defaultTranslation } = require('../config.js');
const { normalizeTranslationCode } = require('../constants/translations.js');
const { computeBackoffDelayMs, retryAsync } = require('./retry.js');

const DEFAULT_HTTP_TIMEOUT_MS = 15000;
const DEFAULT_HTTP_MAX_ATTEMPTS = 3;

function isRetryableStatus(status) {
  if (!Number.isFinite(status)) {
    return false;
  }

  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfterMs(value) {
  if (!value) {
    return 0;
  }

  const seconds = Number(String(value).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return Math.min(60_000, Math.floor(seconds * 1000));
}

async function axiosGetWithRetry(url, axiosConfig = {}, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS);
  const maxAttempts = Number(options.maxAttempts || DEFAULT_HTTP_MAX_ATTEMPTS);

  return retryAsync(
    async () => {
      try {
        const response = await axios.get(url, {
          timeout: timeoutMs,
          validateStatus: () => true,
          ...axiosConfig,
        });

        if (response.status >= 200 && response.status < 300) {
          return response;
        }

        if (!isRetryableStatus(response.status)) {
          return response;
        }

        const retryableError = new Error(`Retryable HTTP ${response.status}`);
        retryableError.httpStatus = response.status;
        retryableError.retryAfterMs = parseRetryAfterMs(response.headers?.['retry-after']);
        throw retryableError;
      } catch (error) {
        error.retryAfterMs = Number(error.retryAfterMs || 0);
        throw error;
      }
    },
    {
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 1,
      baseDelayMs: 350,
      maxDelayMs: 8000,
      factor: 2,
      jitter: true,
      shouldRetry: (error) => {
        if (error && Number.isFinite(error.httpStatus)) {
          return isRetryableStatus(error.httpStatus);
        }

        if (error && error.isAxiosError && error.response) {
          const status = Number(error.response.status);
          return isRetryableStatus(status);
        }

        // Timeouts / transient network errors.
        const code = String(error?.code || '');
        if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
          return true;
        }

        return error && error.isAxiosError && !error.response;
      },
      computeDelayMs: ({ attempt, error }) => {
        const backoff = computeBackoffDelayMs(attempt, {
          baseDelayMs: 350,
          maxDelayMs: 8000,
          factor: 2,
          jitter: true,
        });
        const retryAfterMs = Number(error?.retryAfterMs || 0);
        return Math.max(backoff, retryAfterMs);
      },
      onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
        const statusPart = Number.isFinite(error?.httpStatus) ? ` status=${error.httpStatus}` : '';
        logger.warn(
          `Retrying verse API request (attempt ${attempt + 1}/${maxAttempts}) after ${delayMs}ms.${statusPart}`
        );
      },
    }
  );
}

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
  const response = await axiosGetWithRetry(requestUrl, { responseType: 'json' });
  if (response.status !== 200) {
    return null;
  }
  const verse = Array.isArray(response.data) ? response.data[0] : null;

  if (!verse || !verse.bookname || !verse.chapter || !verse.verse) {
    return null;
  }

  return verse;
}

async function getTranslatedVerse(reference, translation) {
  const requestUrl = buildTranslationRequestUrl(reference, translation);

  logger.debug(`Fetching translated verse from API: ${requestUrl}`);
  const response = await axiosGetWithRetry(requestUrl, { responseType: 'json' });

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
  const normalizedPassage = typeof passage === 'string' && passage.trim().length > 0
    ? passage.trim()
    : 'random';
  const normalizedTranslation = normalizeTranslationCode(
    options.translation || defaultTranslation
  );

  try {
    const verseReferenceData = await getVerseReference(normalizedPassage);
    if (!verseReferenceData) {
      return null;
    }

    const verseReference = buildReferenceFromVerse(verseReferenceData);
    const translatedVerse = await getTranslatedVerse(
      verseReference,
      normalizedTranslation
    );

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
  __private: {
    axiosGetWithRetry,
    isRetryableStatus,
    parseRetryAfterMs,
  },
};
