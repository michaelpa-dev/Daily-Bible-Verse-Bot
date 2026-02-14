const { ChannelType, EmbedBuilder } = require('discord.js');
const { getBuildInfo } = require('./buildInfo.js');
const { issueTrackerUrl } = require('../config.js');
const { CHANNEL_NAMES, TARGET_DEV_GUILD_ID } = require('../constants/devServerSpec.js');
const { logger } = require('../logger.js');

const BOT_STATUS_MARKER = '[dbvb-status-message]';
const BOT_STATUS_TITLE = 'Daily Bible Verse Bot Status';
const DEFAULT_ISSUE_TRACKER_URL =
  'https://github.com/michaelpa-dev/Daily-Bible-Verse-Bot/issues/new';
const EMBED_FIELD_VALUE_LIMIT = 1024;

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
  } catch {
    return DEFAULT_ISSUE_TRACKER_URL;
  }
}

function buildIssueCreationUrl({ context, commandName, userTag, errorSummary, correlationId }) {
  const baseUrl = normalizeIssueTrackerUrl(issueTrackerUrl);
  const issueUrl = new URL(baseUrl);
  const title = truncateText(`[Bot Error] ${context || 'runtime'} - ${commandName || 'N/A'}`, 120);
  const body = [
    '### Error context',
    `- Context: ${context || 'runtime'}`,
    `- Command: ${commandName || 'N/A'}`,
    `- User: ${userTag || 'N/A'}`,
    correlationId ? `- CorrelationId: ${correlationId}` : null,
    `- Timestamp (UTC): ${new Date().toISOString()}`,
    '',
    '### Summary',
    truncateText(errorSummary || 'Unknown error', 400),
    '',
    '_Created from Discord #bot-logs._',
  ]
    .filter(Boolean)
    .join('\n');

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

async function getBotLogsChannel(client, guildId = TARGET_DEV_GUILD_ID) {
  const guild = getGuildFromClient(client, guildId);
  if (!guild) {
    return null;
  }

  return findTextChannelByName(guild, CHANNEL_NAMES.botLogs);
}

async function getBotStatusChannel(client, guildId = TARGET_DEV_GUILD_ID) {
  const guild = getGuildFromClient(client, guildId);
  if (!guild) {
    return null;
  }

  return findTextChannelByName(guild, CHANNEL_NAMES.botStatus);
}

async function getChangelogChannel(guild) {
  return findTextChannelByName(guild, CHANNEL_NAMES.changelog);
}

function buildHealthEmbed(client) {
  const buildInfo = getBuildInfo();
  return new EmbedBuilder()
    .setTitle('Bot Health')
    .setColor('#1f8b4c')
    .setTimestamp()
    .addFields(
      { name: 'Status', value: 'Online', inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime || 0), inline: true },
      { name: 'Version', value: buildInfo.version, inline: true },
      { name: 'Git SHA', value: buildInfo.gitSha, inline: true },
      {
        name: 'Guild Count',
        value: String(client.guilds?.cache?.size || 0),
        inline: true,
      }
    );
}

function buildBotStatusEmbed(client) {
  const buildInfo = getBuildInfo();
  return new EmbedBuilder()
    .setTitle(BOT_STATUS_TITLE)
    .setColor('#1f8b4c')
    .setTimestamp()
    .setFooter({ text: BOT_STATUS_MARKER })
    .addFields(
      { name: 'Status', value: 'Online', inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime || 0), inline: true },
      { name: 'Version', value: buildInfo.version, inline: true },
      { name: 'Git SHA', value: buildInfo.gitSha, inline: true },
      { name: 'Last Update', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    );
}

async function upsertBotStatusMessage(client, guildId = TARGET_DEV_GUILD_ID) {
  const statusChannel = await getBotStatusChannel(client, guildId);
  if (!statusChannel) {
    return null;
  }

  const messages = await statusChannel.messages.fetch({ limit: 50 });
  const existingMessage =
    messages.find(
      (message) =>
        message.author.id === client.user.id &&
        (message.content.includes(BOT_STATUS_MARKER) ||
          message.embeds.some(
            (embed) => embed.title === BOT_STATUS_TITLE || embed.footer?.text === BOT_STATUS_MARKER
          ))
    ) || null;

  const nextEmbed = buildBotStatusEmbed(client);
  if (!existingMessage) {
    return statusChannel.send({ embeds: [nextEmbed] });
  }

  return existingMessage.edit({
    content: '',
    embeds: [nextEmbed],
  });
}

function buildErrorLogPayload({ context, userTag, commandName, error, correlationId }) {
  const errorSummary = truncateText(error?.message || String(error), 400);
  const stackSnippet = truncateText(error?.stack || 'No stack available', 960);
  const issueCreationUrl = buildIssueCreationUrl({
    context,
    commandName,
    userTag,
    errorSummary,
    correlationId,
  });

  try {
    const fields = [
      {
        name: 'Context',
        value: truncateText(context || 'runtime', EMBED_FIELD_VALUE_LIMIT),
        inline: true,
      },
      {
        name: 'Command',
        value: truncateText(commandName || 'N/A', EMBED_FIELD_VALUE_LIMIT),
        inline: true,
      },
      {
        name: 'User',
        value: truncateText(userTag || 'N/A', EMBED_FIELD_VALUE_LIMIT),
        inline: true,
      },
      correlationId
        ? {
            name: 'CorrelationId',
            value: truncateText(String(correlationId), EMBED_FIELD_VALUE_LIMIT),
            inline: false,
          }
        : null,
      { name: 'Summary', value: truncateText(errorSummary || 'Unknown error', 800) },
      { name: 'Stack', value: `\`\`\`\n${stackSnippet}\n\`\`\`` },
      {
        name: 'Issue',
        value: truncateText(`[Create GitHub issue](${issueCreationUrl})`, EMBED_FIELD_VALUE_LIMIT),
      },
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle('Bot Error Event')
      .setColor('#c0392b')
      .setTimestamp()
      .addFields(...fields);

    return { embeds: [embed] };
  } catch (embedError) {
    const fallbackLines = [
      '**Bot Error Event**',
      `- Context: ${context || 'runtime'}`,
      `- Command: ${commandName || 'N/A'}`,
      `- User: ${userTag || 'N/A'}`,
      correlationId ? `- CorrelationId: ${correlationId}` : null,
      `- Summary: ${errorSummary || 'Unknown error'}`,
      `- Issue: ${issueCreationUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    logger.warn('Failed to build error embed payload; falling back to text.', embedError);
    return { content: truncateText(fallbackLines, 1900) };
  }
}

async function sendBotLogMessage(client, guildId, payload) {
  try {
    const botLogsChannel = await getBotLogsChannel(client, guildId);
    if (!botLogsChannel) {
      return false;
    }

    await botLogsChannel.send(payload);
    return true;
  } catch (error) {
    logger.warn(
      `Failed to send bot log message to guild ${guildId || 'unknown'} (missing perms/channel?).`,
      error
    );
    return false;
  }
}

async function logCommandError(interaction, error, summary) {
  const userTag = `${interaction.user.username} (${interaction.user.id})`;
  const commandName = `/${interaction.commandName || 'unknown'}`;

  return sendBotLogMessage(
    interaction.client,
    interaction.guildId || TARGET_DEV_GUILD_ID,
    buildErrorLogPayload({
      context: summary || 'command',
      userTag,
      commandName,
      error,
    })
  );
}

async function logRuntimeError(client, error, context = 'runtime') {
  return sendBotLogMessage(
    client,
    TARGET_DEV_GUILD_ID,
    buildErrorLogPayload({
      context,
      userTag: 'N/A',
      commandName: 'N/A',
      error,
    })
  );
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
  __private: {
    buildErrorLogPayload,
  },
};
