const fs = require('fs');
const path = require('path');
const { logger } = require('../logger.js');
const { normalizeTranslationCode } = require('../constants/translations.js');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (error) {
  throw new Error(
    'SQLite persistence requires a Node.js runtime with support for node:sqlite.'
  );
}

const DEFAULT_DB_PATH = path.join(__dirname, '../../db/bot.sqlite');
const DEFAULT_LEGACY_DB_DIR = path.join(__dirname, '../../db');

let dbPromise = null;

class SQLiteAdapter {
  constructor(database) {
    this.database = database;
  }

  async exec(sql) {
    this.database.exec(sql);
  }

  async run(sql, ...params) {
    return this.database.prepare(sql).run(...params);
  }

  async get(sql, ...params) {
    return this.database.prepare(sql).get(...params);
  }

  async all(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async close() {
    this.database.close();
  }
}

function getDatabasePath() {
  return process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : DEFAULT_DB_PATH;
}

function getLegacyDatabaseDirectory() {
  return process.env.LEGACY_DB_DIR
    ? path.resolve(process.env.LEGACY_DB_DIR)
    : DEFAULT_LEGACY_DB_DIR;
}

function normalizeTranslation(rawTranslation) {
  return normalizeTranslationCode(rawTranslation);
}

async function migrateSubscriptionsFromJson(db) {
  const legacyFilePath = path.join(
    getLegacyDatabaseDirectory(),
    'subscribed_users.json'
  );
  if (!fs.existsSync(legacyFilePath)) {
    return;
  }

  try {
    const fileContents = fs.readFileSync(legacyFilePath, 'utf8').trim();
    if (!fileContents) {
      return;
    }

    const users = JSON.parse(fileContents);
    if (!Array.isArray(users)) {
      logger.warn(`Legacy subscribers file has invalid format: ${legacyFilePath}`);
      return;
    }

    for (const user of users) {
      if (!user || typeof user.id !== 'string' || user.id.trim().length === 0) {
        continue;
      }

      const userId = user.id.trim();
      const translation = normalizeTranslation(user.translation);

      await db.run(
        `INSERT INTO user_preferences (user_id, translation)
         VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           translation = excluded.translation,
           updated_at = CURRENT_TIMESTAMP`,
        userId,
        translation
      );
      await db.run(
        `INSERT INTO subscriptions (user_id)
         VALUES (?)
         ON CONFLICT(user_id) DO NOTHING`,
        userId
      );
    }
  } catch (error) {
    logger.error(`Failed to migrate legacy subscribers file: ${legacyFilePath}`, error);
  }
}

async function migrateStatsFromJson(db) {
  const legacyFilePath = path.join(getLegacyDatabaseDirectory(), 'stats.json');
  if (!fs.existsSync(legacyFilePath)) {
    return;
  }

  try {
    const fileContents = fs.readFileSync(legacyFilePath, 'utf8').trim();
    if (!fileContents) {
      return;
    }

    const legacyStats = JSON.parse(fileContents);
    if (!legacyStats || typeof legacyStats !== 'object') {
      logger.warn(`Legacy stats file has invalid format: ${legacyFilePath}`);
      return;
    }

    const currentStats = await db.get(
      `SELECT total_verses_sent, total_commands_executed, active_guilds
       FROM stats
       WHERE id = 1`
    );

    const mergedTotalVerses = Math.max(
      Number(currentStats?.total_verses_sent || 0),
      Number(legacyStats.totalVersesSent || 0)
    );
    const mergedTotalCommands = Math.max(
      Number(currentStats?.total_commands_executed || 0),
      Number(legacyStats.totalCommandsExecuted || 0)
    );
    const mergedActiveGuilds = Math.max(
      Number(currentStats?.active_guilds || 0),
      Number(legacyStats.activeGuilds || 0)
    );

    await db.run(
      `UPDATE stats
       SET total_verses_sent = ?,
           total_commands_executed = ?,
           active_guilds = ?
       WHERE id = 1`,
      mergedTotalVerses,
      mergedTotalCommands,
      mergedActiveGuilds
    );
  } catch (error) {
    logger.error(`Failed to migrate legacy stats file: ${legacyFilePath}`, error);
  }
}

async function initializeDatabase() {
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  const db = new SQLiteAdapter(database);

  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      translation TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user_preferences(user_id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_verses_sent INTEGER NOT NULL DEFAULT 0,
      total_commands_executed INTEGER NOT NULL DEFAULT 0,
      active_guilds INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS reading_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('guild', 'user')),
      owner_id TEXT NOT NULL,
      channel_id TEXT,
      plan_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      books_json TEXT NOT NULL DEFAULT '[]',
      pace_type TEXT NOT NULL CHECK (pace_type IN ('chapters', 'verses', 'minutes')),
      pace_value INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      post_time TEXT NOT NULL,
      start_date TEXT NOT NULL,
      day_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
      last_posted_on TEXT,
      last_completed_on TEXT,
      streak INTEGER NOT NULL DEFAULT 0,
      catchup_mode TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(owner_type, owner_id)
    );
  `);

  await db.run(
    `INSERT INTO stats (id, total_verses_sent, total_commands_executed, active_guilds)
     VALUES (1, 0, 0, 0)
     ON CONFLICT(id) DO NOTHING;`
  );

  await migrateSubscriptionsFromJson(db);
  await migrateStatsFromJson(db);

  logger.debug(`Database initialized at: ${databasePath}`);
  return db;
}

async function getDatabase() {
  if (!dbPromise) {
    dbPromise = initializeDatabase();
  }

  return dbPromise;
}

async function closeDatabase() {
  if (!dbPromise) {
    return;
  }

  const db = await dbPromise;
  await db.close();
  dbPromise = null;
}

module.exports = {
  getDatabase,
  closeDatabase,
  getDatabasePath,
  getLegacyDatabaseDirectory,
};
