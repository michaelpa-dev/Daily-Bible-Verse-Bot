const {
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { logger } = require('../logger.js');
const { getBuildInfo } = require('./buildInfo.js');
const { issueTrackerUrl } = require('../config.js');
const {
  CHANNEL_NAMES,
  TARGET_DEV_GUILD_ID,
} = require('../constants/devServerSpec.js');
const devBotLogs = require('./devBotLogs.js');

const BOT_STATUS_MARKER = '[dbvb-status-message]';
const BOT_STATUS_TITLE = 'Daily Bible Verse Bot Status';
const DEFAULT_ISSUE_TRACKER_URL =
  'https://github.com/michaelpa-dev/Daily-Bible-Verse-Bot/issues/new';

// Discord embed limits (v14) that matter for runtime safety:
// - field.value max length: 1024
// - embed description max length: 4096
// - total embed size max: 6000
// Keep truncation conservative so operational logging never crashes the bot.
const DISCORD_EMBED_FIELD_VALUE_MAX = 1024;

function formatDiscordTimestamp(iso) {
  if (!iso) {
    return 'unknown';
  }

  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'unknown';
  }

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function truncateText(value, maxLength = 1200) {
  if (!value) {
    return '';
  }

  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeIssueTrackerUrl(rawUrl) {
  const candidate = rawUrl || DEFAULT_ISSUE_TRACKER_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.pathname.endsWith('/issues')) {
      parsed.pathname = `${parsed.pathname}/new`;
    }
    return parsed.toString();
  } catch (error) {
    return DEFAULT_ISSUE_TRACKER_URL;
  }
}

function buildIssueCreationUrl({ context, commandName, userTag, errorSummary, stackSnippet }) {
  const baseUrl = normalizeIssueTrackerUrl(issueTrackerUrl);
  const issueUrl = new URL(baseUrl);
  const title = truncateText(
    `[Bot Error] ${context || 'runtime'} - ${commandName || 'N/A'}`,
    120
  );
  const body = [
    '### Error context',
    `- Context: ${context || 'runtime'}`,
    `- Command: ${commandName || 'N/A'}`,
    `- User: ${userTag || 'N/A'}`,
    `- Timestamp (UTC): ${new Date().toISOString()}`,
    '',
    '### Summary',
    truncateText(errorSummary || 'Unknown error', 400),
    '',
    '### Stack trace',
    '_See Discord #bot-logs or container logs for stack trace._',
    '',
    '_Created from Discord #bot-logs._',
  ].join('\n');

  issueUrl.searchParams.set('title', title);
  issueUrl.searchParams.set('body', body);
  issueUrl.searchParams.set('labels', 'bug');
  return issueUrl.toString();
}

function getGuildFromClient(client, guildId = TARGET_DEV_GUILD_ID) {
  return client?.guilds?.cache?.get(guildId) || null;
}

function findTextChannelByName(guild, channelName) {
  if (!guild?.channels?.cache) {
    return null;
  }

  return (
    guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.name.toLowerCase() === channelName.toLowerCase()
    ) || null
  );
}

async function ensureChannelsFetched(guild) {
  if (!guild?.channels) {
    return;
  }

  if (typeof guild.channels.fetch !== 'function') {
    return;
  }

  try {
    await guild.channels.fetch();
  } catch {
    // ignore
  }
}

function getDefaultDevGuildId() {
  const envGuildId = String(process.env.DEV_GUILD_ID || '').trim();
  return envGuildId || TARGET_DEV_GUILD_ID;
}

async function getBotLogsChannel(client, guildId = getDefaultDevGuildId()) {
  const channelId = String(process.env.DEV_BOT_LOGS_CHANNEL_ID || '').trim();
  if (channelId) {
    const channel = await client?.channels?.fetch?.(channelId).catch(() => null);
    if (channel && typeof channel.send === 'function') {
      return channel;
    }
  }

  const guild = getGuildFromClient(client, guildId);
  if (!guild) {
    return null;
  }

  const cached = findTextChannelByName(guild, CHANNEL_NAMES.botLogs);
  if (cached) {
    return cached;
  }

  await ensureChannelsFetched(guild);
  return findTextChannelByName(guild, CHANNEL_NAMES.botLogs);
}

async function getBotStatusChannel(client, guildId = getDefaultDevGuildId()) {
  const channelId = String(process.env.DEV_BOT_STATUS_CHANNEL_ID || '').trim();
  if (channelId) {
    const channel = await client?.channels?.fetch?.(channelId).catch(() => null);
    if (channel && typeof channel.send === 'function') {
      return channel;
    }
  }

  const guild = getGuildFromClient(client, guildId);
  if (!guild) {
    return null;
  }

  const cached = findTextChannelByName(guild, CHANNEL_NAMES.botStatus);
  if (cached) {
    return cached;
  }

  await ensureChannelsFetched(guild);
  return findTextChannelByName(guild, CHANNEL_NAMES.botStatus);
}

async function getChangelogChannel(guild) {
  return findTextChannelByName(guild, CHANNEL_NAMES.changelog);
}

function buildHealthEmbed(client) {
  const buildInfo = getBuildInfo();
  const logHealth = devBotLogs.getHealth();

  const devLogValue = logHealth.enabled
    ? `ok=${Boolean(logHealth.lastSuccessAt)} queue=${logHealth.queueLength} failures=${logHealth.consecutiveFailures}`
    : 'disabled';

  return new EmbedBuilder()
    .setTitle('Bot Health')
    .setColor('#1f8b4c')
    .setTimestamp()
    .addFields(
      { name: 'Status', value: 'Online', inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime || 0), inline: true },
      { name: 'Environment', value: buildInfo.runtimeEnvironment, inline: true },
      { name: 'Release Tag', value: buildInfo.releaseTag, inline: true },
      { name: 'Git SHA', value: buildInfo.gitSha, inline: true },
      { name: 'Built At', value: formatDiscordTimestamp(buildInfo.builtAt), inline: true },
      { name: 'Deployed At', value: formatDiscordTimestamp(buildInfo.deployedAt), inline: true },
      {
        name: 'Guild Count',
        value: String(client.guilds?.cache?.size || 0),
        inline: true,
      },
      { name: 'Dev #bot-logs', value: truncateText(devLogValue, 1024), inline: false }
    );
}

function buildBotStatusEmbed(client) {
  const buildInfo = getBuildInfo();
  const logHealth = devBotLogs.getHealth();

  const devLogValue = logHealth.enabled
    ? `ok=${Boolean(logHealth.lastSuccessAt)} queue=${logHealth.queueLength} failures=${logHealth.consecutiveFailures}${logHealth.circuitOpenUntil ? ` circuitUntil=${logHealth.circuitOpenUntil}` : ''}`
    : 'disabled';

  return new EmbedBuilder()
    .setTitle(BOT_STATUS_TITLE)
    .setColor('#1f8b4c')
    .setTimestamp()
    .setFooter({ text: BOT_STATUS_MARKER })
    .addFields(
      { name: 'Status', value: 'Online', inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime || 0), inline: true },
      { name: 'Environment', value: buildInfo.runtimeEnvironment, inline: true },
      { name: 'Release Tag', value: buildInfo.releaseTag, inline: true },
      { name: 'Built At', value: formatDiscordTimestamp(buildInfo.builtAt), inline: true },
      { name: 'Deployed At', value: formatDiscordTimestamp(buildInfo.deployedAt), inline: true },
      { name: 'Git SHA', value: buildInfo.gitSha, inline: true },
      { name: 'Heartbeat', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: 'Dev #bot-logs', value: truncateText(devLogValue, 1024), inline: false }
    );
}

async function upsertBotStatusMessage(client, guildId = getDefaultDevGuildId()) {
  devBotLogs.logEvent('info', 'statusMessage.upsert.start', { guildId });

  const statusChannel = await getBotStatusChannel(client, guildId);
  if (!statusChannel) {
    devBotLogs.logEvent('warn', 'statusMessage.upsert.skip', { guildId, reason: 'status_channel_not_found' });
    return null;
  }

  const messages = await statusChannel.messages.fetch({ limit: 50 }).catch((error) => {
    devBotLogs.logError('statusMessage.upsert.fetch.error', error, { guildId, channelId: statusChannel.id });
    return null;
  });
  if (!messages) {
    return null;
  }

  const existingMessage =
    messages.find(
      (message) =>
        message.author.id === client.user.id && (
          message.content.includes(BOT_STATUS_MARKER) ||
          message.embeds.some((embed) =>
            embed.title === BOT_STATUS_TITLE ||
            embed.footer?.text === BOT_STATUS_MARKER
          )
        )
    ) || null;

  const nextEmbed = buildBotStatusEmbed(client);
  if (!existingMessage) {
    const sent = await statusChannel.send({ embeds: [nextEmbed] }).catch((error) => {
      devBotLogs.logError('statusMessage.upsert.send.error', error, { guildId, channelId: statusChannel.id });
      return null;
    });
    if (sent) {
      devBotLogs.logEvent('info', 'statusMessage.upsert.created', { guildId, channelId: statusChannel.id, messageId: sent.id });
    }
    return sent;
  }

  const edited = await existingMessage.edit({
    content: '',
    embeds: [nextEmbed],
  }).catch((error) => {
    devBotLogs.logError('statusMessage.upsert.edit.error', error, { guildId, channelId: statusChannel.id, messageId: existingMessage.id });
    return null;
  });

  if (edited) {
    devBotLogs.logEvent('info', 'statusMessage.upsert.updated', { guildId, channelId: statusChannel.id, messageId: edited.id });
  }

  return edited;
}

function buildErrorLogPayload({ context, userTag, commandName, error }) {
  try {
    const safeValue = (value) => truncateText(value, DISCORD_EMBED_FIELD_VALUE_MAX);
    const errorSummary = safeValue(error?.message || String(error));
    const stackSnippet = truncateText(
      error?.stack || 'No stack available',
      // Keep under 1024 once we add code fences.
      850
    );

    const issueCreationUrl = buildIssueCreationUrl({
      context,
      commandName,
      userTag,
      errorSummary,
      stackSnippet,
    });

    const normalizedIssueUrl =
      issueCreationUrl && issueCreationUrl.length <= 900
        ? issueCreationUrl
        : normalizeIssueTrackerUrl(issueTrackerUrl);

    const embed = new EmbedBuilder()
      .setTitle('Bot Error Event')
      .setColor('#c0392b')
      .setTimestamp()
      .addFields(
        { name: 'Context', value: safeValue(context || 'runtime'), inline: true },
        { name: 'Command', value: safeValue(commandName || 'N/A'), inline: true },
        { name: 'User', value: safeValue(userTag || 'N/A'), inline: true },
        { name: 'Summary', value: errorSummary || 'Unknown error' },
        { name: 'Stack', value: safeValue(`\`\`\`\n${stackSnippet}\n\`\`\``) },
        { name: 'Issue', value: safeValue(`[Create GitHub issue](${normalizedIssueUrl})`) }
      );

    return { embeds: [embed] };
  } catch (buildError) {
    // Never allow operational logging to crash the bot.
    const fallback = truncateText(
      `Bot error: ${context || 'runtime'} - ${commandName || 'N/A'} - ${
        error?.message || String(error)
      }`,
      1900
    );
    return { content: fallback };
  }
}

const logCircuit = {
  consecutiveFailures: 0,
  disabledUntilMs: 0,
  lastWarningAtMs: 0,
};

async function sendBotLogMessage(client, guildId, payload) {
  const now = Date.now();
  if (logCircuit.disabledUntilMs > now) {
    return false;
  }

  try {
    const botLogsChannel = await getBotLogsChannel(client, guildId);
    if (!botLogsChannel) {
      return false;
    }

    await botLogsChannel.send(payload);
    logCircuit.consecutiveFailures = 0;
    return true;
  } catch (error) {
    logCircuit.consecutiveFailures += 1;
    if (logCircuit.consecutiveFailures >= 3) {
      const exponent = Math.min(6, logCircuit.consecutiveFailures - 3);
      const cooldownMs = Math.min(30 * 60_000, 60_000 * 2 ** exponent);
      logCircuit.disabledUntilMs = now + cooldownMs;
    }

    if (now - logCircuit.lastWarningAtMs > 60_000) {
      logCircuit.lastWarningAtMs = now;
      const until = logCircuit.disabledUntilMs > now
        ? `; circuit open for ${Math.round((logCircuit.disabledUntilMs - now) / 1000)}s`
        : '';
      logger.warn(
        `Failed to send bot log message to Discord (${logCircuit.consecutiveFailures} consecutive failures)${until}: ${error?.message || error}`
      );
    }

    return false;
  }
}

async function logCommandError(interaction, error, summary) {
  devBotLogs.logError('command.error', error, {
    context: summary || 'command',
    command: `/${interaction.commandName || 'unknown'}`,
    userId: interaction.user?.id,
    guildId: interaction.guildId || null,
    channelId: interaction.channelId || null,
  });

  // Optional embed payload (best-effort). Keep it disabled in production by default.
  const logHealth = devBotLogs.getHealth();
  if (!logHealth.enabled) {
    return false;
  }

  const userTag = `${interaction.user.username} (${interaction.user.id})`;
  const commandName = `/${interaction.commandName || 'unknown'}`;
  return sendBotLogMessage(interaction.client, getDefaultDevGuildId(), buildErrorLogPayload({
    context: summary || 'command',
    userTag,
    commandName,
    error,
  }));
}

async function logRuntimeError(client, error, context = 'runtime') {
  devBotLogs.logError('runtime.error', error, { context });

  const logHealth = devBotLogs.getHealth();
  if (!logHealth.enabled) {
    return false;
  }

  return sendBotLogMessage(client, getDefaultDevGuildId(), buildErrorLogPayload({
    context,
    userTag: 'N/A',
    commandName: 'N/A',
    error,
  }));
}

function buildBootstrapSummaryMessage(mode, report) {
  const lines = [
    `**/bootstrap-dev-server ${mode.toUpperCase()} summary**`,
    `- Created: ${report.created.length}`,
    `- Updated: ${report.updated.length}`,
    `- Unchanged: ${report.unchanged.length}`,
    `- Warnings: ${report.warnings.length}`,
  ];

  const addSection = (label, items) => {
    if (!items.length) {
      return;
    }

    lines.push(`\n**${label}**`);
    for (const item of items.slice(0, 25)) {
      lines.push(`- ${item}`);
    }
    if (items.length > 25) {
      lines.push(`- ...and ${items.length - 25} more`);
    }
  };

  addSection('Created', report.created);
  addSection('Updated', report.updated);
  addSection('Warnings', report.warnings);
  return truncateText(lines.join('\n'), 3900);
}

module.exports = {
  BOT_STATUS_MARKER,
  BOT_STATUS_TITLE,
  buildBotStatusEmbed,
  buildBootstrapSummaryMessage,
  buildIssueCreationUrl,
  buildHealthEmbed,
  findTextChannelByName,
  formatDuration,
  getBotLogsChannel,
  getBotStatusChannel,
  getChangelogChannel,
  getGuildFromClient,
  logCommandError,
  logRuntimeError,
  sendBotLogMessage,
  truncateText,
  upsertBotStatusMessage,
};
