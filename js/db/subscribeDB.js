const { logger } = require('../logger.js');
const { getDatabase } = require('./database.js');
const {
  DEFAULT_TRANSLATION,
  normalizeTranslationCode,
} = require('../constants/translations.js');

function normalizeTranslation(rawTranslation) {
  return normalizeTranslationCode(rawTranslation);
}

function normalizeUserId(userId) {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return null;
  }

  return userId.trim();
}

async function getSubscribedUsers() {
  try {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT s.user_id AS id, COALESCE(p.translation, ?) AS translation
       FROM subscriptions s
       LEFT JOIN user_preferences p ON p.user_id = s.user_id
       ORDER BY s.subscribed_at ASC`,
      DEFAULT_TRANSLATION
    );

    return rows.map((row) => ({
      id: row.id,
      translation: normalizeTranslation(row.translation),
    }));
  } catch (error) {
    logger.error('Error fetching subscribed users:', error);
    return [];
  }
}

async function getSubscribedUsersCount() {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT COUNT(*) AS count FROM subscriptions');
    return Number(row?.count || 0);
  } catch (error) {
    logger.error('Error fetching subscribed users count:', error);
    return 0;
  }
}

async function addSubscribedUser(userId, translation = DEFAULT_TRANSLATION) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error('User ID is required to subscribe.');
  }

  try {
    const db = await getDatabase();
    const normalizedTranslation = normalizeTranslation(translation);

    await db.run(
      `INSERT INTO user_preferences (user_id, translation)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         translation = excluded.translation,
         updated_at = CURRENT_TIMESTAMP`,
      normalizedUserId,
      normalizedTranslation
    );

    await db.run(
      `INSERT INTO subscriptions (user_id)
       VALUES (?)
       ON CONFLICT(user_id) DO NOTHING`,
      normalizedUserId
    );

    logger.debug(
      `Subscribed user added/updated successfully: ${normalizedUserId} (${normalizedTranslation}).`
    );
  } catch (error) {
    logger.error('Error adding subscribed user:', error);
    throw error;
  }
}

async function removeSubscribedUser(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return;
  }

  try {
    const db = await getDatabase();
    await db.run('DELETE FROM subscriptions WHERE user_id = ?', normalizedUserId);
    logger.debug(`Subscribed user removed successfully: ${normalizedUserId}.`);
  } catch (error) {
    logger.error('Error removing subscribed user:', error);
    throw error;
  }
}

async function isSubscribed(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return false;
  }

  try {
    const db = await getDatabase();
    const row = await db.get(
      'SELECT 1 AS subscribed FROM subscriptions WHERE user_id = ? LIMIT 1',
      normalizedUserId
    );
    return Boolean(row);
  } catch (error) {
    logger.error('Error checking if user is subscribed:', error);
    return false;
  }
}

async function removeAllSubscribedUsers() {
  try {
    const db = await getDatabase();
    await db.run('DELETE FROM subscriptions');
    logger.debug('All subscribed users removed successfully.');
  } catch (error) {
    logger.error('Error removing all subscribed users:', error);
    throw error;
  }
}

async function setUserTranslation(userId, translation) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error('User ID is required to set translation.');
  }

  try {
    const db = await getDatabase();
    const normalizedTranslation = normalizeTranslation(translation);
    await db.run(
      `INSERT INTO user_preferences (user_id, translation)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         translation = excluded.translation,
         updated_at = CURRENT_TIMESTAMP`,
      normalizedUserId,
      normalizedTranslation
    );

    return {
      id: normalizedUserId,
      translation: normalizedTranslation,
    };
  } catch (error) {
    logger.error('Error setting user translation:', error);
    throw error;
  }
}

async function getUserPreferences(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  try {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT user_id AS id, translation
       FROM user_preferences
       WHERE user_id = ?`,
      normalizedUserId
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      translation: normalizeTranslation(row.translation),
    };
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    return null;
  }
}

module.exports = {
  DEFAULT_TRANSLATION,
  addSubscribedUser,
  getSubscribedUsers,
  getSubscribedUsersCount,
  getUserPreferences,
  isSubscribed,
  removeAllSubscribedUsers,
  removeSubscribedUser,
  setUserTranslation,
};
