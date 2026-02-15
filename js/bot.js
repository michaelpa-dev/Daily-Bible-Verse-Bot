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
const { runCommandSafely } = require('./services/commandRunner.js');
const { startDiscordWatchdog } = require('./services/discordWatchdog.js');
const { createHttpServer } = require('./api/httpServer.js');
const devBotLogs = require('./services/devBotLogs.js');
const { generateCorrelationId, runWithCorrelationId } = require('./services/correlation.js');
const { handlePaginationInteraction } = require('./services/paginationInteractions.js');
const { handleReadInteraction } = require('./services/readSessions.js');
const { handlePlanInteraction } = require('./services/planInteractions.js');
const { initializePlanScheduler } = require('./services/planScheduler.js');
const runtimeHealth = require('./services/runtimeHealth.js');
const { sleep } = require('./services/retry.js');

const STATUS_ROTATION_SCHEDULE = '*/5 * * * *';
// Avoid updating Discord messages too frequently; this can trigger rate limits and cascade into failures.
const BOT_STATUS_SCHEDULE = '*/15 * * * *';
const DAILY_VERSE_SCHEDULE = '0 9 * * *';
const DEFAULT_STATUS = 'the Word of God';
const DELIVERY_CONCURRENCY = 5;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.commands = new Collection();
let httpServer = null;
let watchdog = null;

function loadCommandModules() {
  const commandsPath = path.join(scriptDirectory, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

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
  const start = Date.now();
  try {
    const subscribedUsers = await getSubscribedUsers();
    logger.info(`Sending daily verse to ${subscribedUsers.length} users`);
    devBotLogs.logEvent('info', 'job.dailyVerse.start', {
      subscribedUsers: subscribedUsers.length,
    });

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

    devBotLogs.logEvent('info', 'job.dailyVerse.end', {
      durationMs: Date.now() - start,
      subscribedUsers: subscribedUsers.length,
    });
  } catch (error) {
    logger.error('Error during daily verse delivery', error);
    devBotLogs.logError('job.dailyVerse.error', error, {
      durationMs: Date.now() - start,
    });
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
  runtimeHealth.markDiscordReady(client);
  watchdog = startDiscordWatchdog(client);

  // Dev Discord logging (best-effort). This should never crash startup.
  try {
    devBotLogs.start(client);
    const validated = await devBotLogs.validateStartup();
    if (!validated.ok) {
      logger.warn(`Dev #bot-logs startup validation failed: ${validated.reason}`);
      // If logs are failing, make sure the status message is still maintained so we can debug.
      await upsertBotStatusMessage(client);
    }
  } catch (error) {
    logger.warn(`Dev #bot-logs initialization failed: ${error?.message || error}`);
  }

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

  // Register commands sequentially to avoid hitting burst rate limits on startup.
  for (const guild of client.guilds.cache.values()) {
    await registerSlashCommands(guild);
    // Small delay keeps startups stable when in many guilds.
    if (client.guilds.cache.size > 1) {
      await sleep(1200);
    }
  }

  scheduleRecurringJobs();

  try {
    await initializePlanScheduler(client);
  } catch (error) {
    logger.error('Failed to initialize reading plan scheduler', error);
    devBotLogs.logError('planScheduler.init.error', error);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  logger.info(`Joined guild ${guild.name} (${guild.id}), owner: ${guild.ownerId}`);
  devBotLogs.logEvent('info', 'guild.join', { guildId: guild.id, guildName: guild.name });
  await registerSlashCommands(guild);
  await updateActiveGuilds(client);
});

client.on(Events.GuildDelete, async (guild) => {
  logger.info(`Removed from guild ${guild.name || 'unknown'} (${guild.id})`);
  devBotLogs.logEvent('info', 'guild.leave', {
    guildId: guild.id,
    guildName: guild.name || 'unknown',
  });
  await updateActiveGuilds(client);
});

client.on(Events.ShardDisconnect, (event) => {
  runtimeHealth.markDiscordDisconnect(client, event?.reason || event?.code || 'disconnect');
});

client.on(Events.ShardReconnecting, () => {
  runtimeHealth.markDiscordDisconnect(client, 'reconnecting');
});

client.on(Events.ShardReady, () => {
  runtimeHealth.markDiscordReady(client);
});

client.on(Events.ShardResume, () => {
  runtimeHealth.markDiscordReady(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  runtimeHealth.markInteraction(interaction);

  const correlationId = generateCorrelationId();

  await runWithCorrelationId(correlationId, async () => {
    const baseFields = {
      type: interaction.type,
      userId: interaction.user?.id,
      guildId: interaction.guildId || null,
      channelId: interaction.channelId || null,
    };

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      devBotLogs.logEvent('info', 'interaction.component', {
        ...baseFields,
        kind: interaction.isButton()
          ? 'button'
          : interaction.isStringSelectMenu()
            ? 'select'
            : 'modal',
        customId: interaction.customId,
      });

      try {
        const handled =
          (interaction.isButton() ? await handlePaginationInteraction(interaction) : false) ||
          (interaction.isButton() ? await handlePlanInteraction(interaction) : false) ||
          (await handleReadInteraction(interaction));
        if (handled) {
          return;
        }
      } catch (error) {
        logger.error('Component interaction handler failed', error);
        devBotLogs.logError('interaction.component.error', error, {
          ...baseFields,
          customId: interaction.customId,
        });
        // Avoid throwing; fall through so Discord sees an error response.
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred handling that interaction.',
            ephemeral: true,
          });
        }
      }

      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);
    logger.info(
      `Slash command received: ${interaction.commandName}, guild: ${interaction.guildId || 'DM'}, user: ${interaction.user.id}`
    );

    devBotLogs.logEvent('info', 'command.start', {
      ...baseFields,
      command: interaction.commandName,
    });

    if (!command) {
      logger.warn(`No command handler found for: ${interaction.commandName}`);
      devBotLogs.logEvent('warn', 'command.missing', {
        ...baseFields,
        command: interaction.commandName,
      });
      return;
    }

    const result = await runCommandSafely(interaction, command, {
      logger,
      logCommandErrorFn: logCommandError,
      friendlyMessage: 'An error occurred while executing this command.',
    });

    devBotLogs.logEvent(result.ok ? 'info' : 'warn', 'command.end', {
      ...baseFields,
      command: interaction.commandName,
      ok: result.ok,
      durationMs: result.durationMs,
    });
  });
});

async function shutdown(signal = 'shutdown') {
  try {
    devBotLogs.logEvent('info', 'bot.shutdown', { signal });
    await devBotLogs.flush().catch(() => null);
    devBotLogs.stop();
    watchdog?.stop?.();
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

  httpServer = createHttpServer({
    getHealthSnapshot: () => runtimeHealth.getSnapshot(client),
    isReady: () => (typeof client.isReady === 'function' ? client.isReady() : false),
  });
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
  process.exit(1);
});

process.once('SIGINT', async () => {
  await shutdown('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await shutdown('SIGTERM');
  process.exit(0);
});

process.on('unhandledRejection', async (reason) => {
  const error =
    reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
  logger.error('Unhandled promise rejection', error);
  try {
    await logRuntimeError(client, error, 'unhandledRejection');
  } catch {
    // ignore secondary failures
  }

  const fatal =
    String(process.env.FATAL_ON_UNHANDLED_REJECTION || '')
      .trim()
      .toLowerCase() !== 'false';
  if (fatal) {
    logger.error(
      'Exiting process due to unhandledRejection (FATAL_ON_UNHANDLED_REJECTION != false)'
    );
    process.exit(1);
  }
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception', error);
  try {
    await logRuntimeError(client, error, 'uncaughtException');
  } catch {
    // ignore secondary failures
  }

  // Treat uncaught exceptions as fatal; rely on Docker restart policy for recovery.
  process.exit(1);
});
