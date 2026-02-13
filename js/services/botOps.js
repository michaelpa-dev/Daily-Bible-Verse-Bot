const {
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { getBuildInfo } = require('./buildInfo.js');
const {
  CHANNEL_NAMES,
  TARGET_DEV_GUILD_ID,
} = require('../constants/devServerSpec.js');

const BOT_STATUS_MARKER = '[dbvb-status-message]';

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

function buildBotStatusMessage(client) {
  const buildInfo = getBuildInfo();
  return [
    BOT_STATUS_MARKER,
    '**Daily Bible Verse Bot Status**',
    `- Status: Online`,
    `- Uptime: ${formatDuration(client.uptime || 0)}`,
    `- Version: ${buildInfo.version}`,
    `- Git SHA: ${buildInfo.gitSha}`,
    `- Last Update: <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].join('\n');
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
        message.content.includes(BOT_STATUS_MARKER)
    ) || null;

  const nextContent = buildBotStatusMessage(client);
  if (!existingMessage) {
    return statusChannel.send({ content: nextContent });
  }

  if (existingMessage.content !== nextContent) {
    return existingMessage.edit({ content: nextContent });
  }

  return existingMessage;
}

function buildErrorLogPayload({ context, userTag, commandName, error }) {
  const errorSummary = truncateText(error?.message || String(error), 400);
  const stackSnippet = truncateText(error?.stack || 'No stack available', 900);

  const embed = new EmbedBuilder()
    .setTitle('Bot Error Event')
    .setColor('#c0392b')
    .setTimestamp()
    .addFields(
      { name: 'Context', value: context || 'runtime', inline: true },
      { name: 'Command', value: commandName || 'N/A', inline: true },
      { name: 'User', value: userTag || 'N/A', inline: true },
      { name: 'Summary', value: errorSummary || 'Unknown error' },
      { name: 'Stack', value: `\`\`\`\n${stackSnippet}\n\`\`\`` }
    );

  return { embeds: [embed] };
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
  buildBootstrapSummaryMessage,
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
