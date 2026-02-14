const fs = require('fs');
const path = require('path');
const {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const cron = require('node-cron');
const { botToken } = require('./config.js');
const { logger, scriptDirectory } = require('./logger.js');
const sendDailyVerse = require('./verseSender');
const { getSubscribedUsers } = require('./db/subscribeDB.js');
const { updateActiveGuilds } = require('./db/statsDB.js');
const { closeDatabase } = require('./db/database.js');
const {
  logCommandError,
  logRuntimeError,
  upsertBotStatusMessage,
} = require('./services/botOps.js');
const { createHttpServer } = require('./api/httpServer.js');
const { handlePaginationInteraction } = require('./services/paginationInteractions.js');
const { handleReadInteraction } = require('./services/readSessions.js');

const STATUS_ROTATION_SCHEDULE = '*/5 * * * *';
const BOT_STATUS_SCHEDULE = '*/5 * * * * *';
const DAILY_VERSE_SCHEDULE = '0 9 * * *';
const DEFAULT_STATUS = 'the Word of God';
const DELIVERY_CONCURRENCY = 5;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.commands = new Collection();
let httpServer = null;

function loadCommandModules() {
  const commandsPath = path.join(scriptDirectory, 'commands');
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command?.data || typeof command.execute !== 'function') {
      logger.warn(`Skipping invalid command module: ${filePath}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

function loadStatuses() {
  const statusesFilePath = path.join(scriptDirectory, '../assets/statuses.txt');
  if (!fs.existsSync(statusesFilePath)) {
    return [DEFAULT_STATUS];
  }

  const statuses = fs
    .readFileSync(statusesFilePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return statuses.length > 0 ? statuses : [DEFAULT_STATUS];
}

async function registerSlashCommands(guild) {
  const commandPayload = client.commands.map((command) => command.data.toJSON());

  try {
    await guild.commands.set(commandPayload);
    logger.info(
      `Slash commands registered in guild ${guild.name} (${guild.id}), owner: ${guild.ownerId}`
    );
  } catch (error) {
    logger.error(`Failed to register slash commands for guild ${guild.id}`, error);
  }
}

async function sendDailyVerseToSubscribedUsers() {
  try {
    const subscribedUsers = await getSubscribedUsers();
    logger.info(`Sending daily verse to ${subscribedUsers.length} users`);

    const batch = [];
    for (const user of subscribedUsers) {
      batch.push(
        sendDailyVerse(client, user.id, 'votd', {
          translation: user.translation,
        })
      );

      if (batch.length >= DELIVERY_CONCURRENCY) {
        await Promise.allSettled(batch.splice(0, batch.length));
      }
    }

    if (batch.length > 0) {
      await Promise.allSettled(batch);
    }
  } catch (error) {
    logger.error('Error during daily verse delivery', error);
  }
}

function scheduleRecurringJobs() {
  const statuses = loadStatuses();
  let statusIndex = 0;

  const rotateStatus = () => {
    const nextStatus = statuses[statusIndex];
    statusIndex = (statusIndex + 1) % statuses.length;
    logger.debug(`Setting status to: ${nextStatus}`);
    client.user.setActivity(nextStatus, { type: ActivityType.Listening });
  };

  rotateStatus();
  cron.schedule(STATUS_ROTATION_SCHEDULE, rotateStatus);
  upsertBotStatusMessage(client).catch((error) => {
    logger.warn(`Failed to upsert bot status message: ${error}`);
  });
  cron.schedule(BOT_STATUS_SCHEDULE, async () => {
    try {
      await upsertBotStatusMessage(client);
    } catch (error) {
      logger.warn(`Failed to refresh bot status message: ${error}`);
    }
  });
  cron.schedule(DAILY_VERSE_SCHEDULE, sendDailyVerseToSubscribedUsers, {
    timezone: 'America/New_York',
  });

  logger.info('Scheduled daily verse delivery at 09:00 America/New_York');
}

client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.username}`);

  try {
    const avatarPath = path.join(scriptDirectory, '../assets/bible_scripture_icon.png');
    if (fs.existsSync(avatarPath)) {
      const avatar = fs.readFileSync(avatarPath);
      await client.user.setAvatar(avatar);
    }
  } catch (error) {
    logger.warn(`Failed to set bot avatar: ${error}`);
  }

  await updateActiveGuilds(client);

  const guildRegistrations = [];
  for (const guild of client.guilds.cache.values()) {
    guildRegistrations.push(registerSlashCommands(guild));
  }
  await Promise.allSettled(guildRegistrations);

  scheduleRecurringJobs();
});

client.on(Events.GuildCreate, async (guild) => {
  logger.info(`Joined guild ${guild.name} (${guild.id}), owner: ${guild.ownerId}`);
  await registerSlashCommands(guild);
  await updateActiveGuilds(client);
});

client.on(Events.GuildDelete, async (guild) => {
  logger.info(`Removed from guild ${guild.name || 'unknown'} (${guild.id})`);
  await updateActiveGuilds(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    try {
      const handled =
        (interaction.isButton() ? await handlePaginationInteraction(interaction) : false) ||
        (await handleReadInteraction(interaction));
      if (handled) {
        return;
      }
    } catch (error) {
      logger.error('Component interaction handler failed', error);
      // Avoid throwing; fall through so Discord sees an error response.
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred handling that interaction.', ephemeral: true });
      }
      return;
    }
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = client.commands.get(interaction.commandName);
  logger.info(
    `Slash command received: ${interaction.commandName}, guild: ${interaction.guildId || 'DM'}, user: ${interaction.user.id}`
  );

  if (!command) {
    logger.warn(`No command handler found for: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Unhandled error in command ${interaction.commandName}`, error);
    await logCommandError(interaction, error, 'Unhandled command execution error');
    const message = 'An error occurred while executing this command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
});

async function shutdown() {
  try {
    client.destroy();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      httpServer = null;
    }
    await closeDatabase();
  } catch (error) {
    logger.warn(`Failed to close database cleanly: ${error}`);
  }
}

async function startHttpApiServer() {
  const disabled = String(process.env.DISABLE_HTTP_API || '').toLowerCase() === 'true';
  if (disabled) {
    logger.info('HTTP API server disabled via DISABLE_HTTP_API=true');
    return;
  }

  const bindHost = String(process.env.HTTP_BIND || '127.0.0.1').trim() || '127.0.0.1';
  const portRaw = process.env.HTTP_PORT || process.env.PORT || '3000';
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid HTTP port: ${portRaw}`);
  }

  httpServer = createHttpServer();
  await new Promise((resolve) => httpServer.listen(port, bindHost, resolve));
  logger.info(`HTTP API server listening on http://${bindHost}:${port}`);
}

async function runBot() {
  if (!botToken) {
    throw new Error(
      'Missing bot token. Set BOT_TOKEN in the runtime environment. In managed environments (production/canary), file-based botToken values are disabled by default.'
    );
  }

  loadCommandModules();
  await startHttpApiServer();
  await client.login(botToken);
}

runBot().catch((error) => {
  logger.error('Bot failed to start', error);
  process.exitCode = 1;
});

process.once('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('unhandledRejection', async (reason) => {
  const error =
    reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
  logger.error('Unhandled promise rejection', error);
  await logRuntimeError(client, error, 'unhandledRejection');
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception', error);
  await logRuntimeError(client, error, 'uncaughtException');
});
