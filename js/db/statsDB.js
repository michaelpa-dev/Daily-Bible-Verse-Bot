const { logger } = require('../logger.js');
const { getDatabase } = require('./database.js');
const { getSubscribedUsersCount } = require('./subscribeDB.js');

async function updateSubscribedUsersCount() {
  return getSubscribedUsersCount();
}

async function addVerseSent() {
  try {
    const db = await getDatabase();
    await db.run(
      `UPDATE stats
       SET total_verses_sent = total_verses_sent + 1
       WHERE id = 1`
    );
  } catch (error) {
    logger.error('Error updating total verses sent:', error);
  }
}

async function addCommandExecution() {
  try {
    const db = await getDatabase();
    await db.run(
      `UPDATE stats
       SET total_commands_executed = total_commands_executed + 1
       WHERE id = 1`
    );
  } catch (error) {
    logger.error('Error updating total commands executed:', error);
  }
}

async function updateActiveGuilds(client) {
  try {
    const activeGuilds = Number(client?.guilds?.cache?.size || 0);
    const db = await getDatabase();
    await db.run(
      `UPDATE stats
       SET active_guilds = ?
       WHERE id = 1`,
      activeGuilds
    );
  } catch (error) {
    logger.error('Error updating active guilds:', error);
  }
}

async function getStats() {
  try {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT total_verses_sent, total_commands_executed, active_guilds
       FROM stats
       WHERE id = 1`
    );
    const subscribedUsersCount = await getSubscribedUsersCount();

    return {
      subscribedUsersCount,
      totalVersesSent: Number(row?.total_verses_sent || 0),
      totalCommandsExecuted: Number(row?.total_commands_executed || 0),
      activeGuilds: Number(row?.active_guilds || 0),
    };
  } catch (error) {
    logger.error('Error getting stats:', error);
    return {
      subscribedUsersCount: 0,
      totalVersesSent: 0,
      totalCommandsExecuted: 0,
      activeGuilds: 0,
    };
  }
}

module.exports = {
  updateSubscribedUsersCount,
  addVerseSent,
  addCommandExecution,
  updateActiveGuilds,
  getStats,
};

