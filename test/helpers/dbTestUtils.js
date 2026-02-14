const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_MODULES = [
  '../../js/db/database.js',
  '../../js/db/subscribeDB.js',
  '../../js/db/statsDB.js',
  '../../js/db/planDB.js',
  '../../js/services/planScheduler.js',
];

function createTempDatabaseSandbox() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'daily-bible-verse-bot-test-')
  );
  const dbPath = path.join(rootDir, 'bot.sqlite');
  const legacyDir = path.join(rootDir, 'legacy');
  fs.mkdirSync(legacyDir, { recursive: true });

  return {
    rootDir,
    dbPath,
    legacyDir,
  };
}

function clearProjectModuleCache() {
  for (const modulePath of PROJECT_MODULES) {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (error) {
      // Ignore modules that are not in cache yet.
    }
  }
}

function loadDbModulesForSandbox(sandbox) {
  process.env.DB_PATH = sandbox.dbPath;
  process.env.LEGACY_DB_DIR = sandbox.legacyDir;
  clearProjectModuleCache();

  const database = require('../../js/db/database.js');
  const subscribeDB = require('../../js/db/subscribeDB.js');
  const statsDB = require('../../js/db/statsDB.js');
  const planDB = require('../../js/db/planDB.js');

  return {
    database,
    subscribeDB,
    statsDB,
    planDB,
  };
}

async function cleanupSandbox(sandbox, database) {
  if (database && typeof database.closeDatabase === 'function') {
    await database.closeDatabase();
  }

  delete process.env.DB_PATH;
  delete process.env.LEGACY_DB_DIR;
  clearProjectModuleCache();

  fs.rmSync(sandbox.rootDir, { recursive: true, force: true });
}

module.exports = {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
};
