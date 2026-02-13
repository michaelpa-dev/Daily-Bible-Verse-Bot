const { SlashCommandBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { TARGET_DEV_GUILD_ID } = require('../constants/devServerSpec.js');
const { requireOwnerOrMaintainer } = require('../services/permissionUtils.js');
const { bootstrapDevServer } = require('../services/bootstrapDevServer.js');
const {
  buildBootstrapSummaryMessage,
  sendBotLogMessage,
} = require('../services/botOps.js');

function splitMessage(content, maxChunkLength = 1800) {
  if (content.length <= maxChunkLength) {
    return [content];
  }

  const lines = content.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
      }
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bootstrap-dev-server')
    .setDescription('Create/repair Discord dev server roles, channels, and permissions')
    .addBooleanOption((option) =>
      option
        .setName('dry_run')
        .setDescription('Preview changes without applying them (default: true)')
    )
    .addBooleanOption((option) =>
      option
        .setName('apply')
        .setDescription('Apply the bootstrap changes (default: false)')
    ),
  async execute(interaction) {
    await addCommandExecution();

    if (!interaction.guildId || interaction.guildId !== TARGET_DEV_GUILD_ID) {
      await interaction.reply({
        content:
          `This command is only allowed in the configured dev guild (${TARGET_DEV_GUILD_ID}).`,
        ephemeral: true,
      });
      return;
    }

    const authorized = await requireOwnerOrMaintainer(interaction);
    if (!authorized) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const applyOption = interaction.options.getBoolean('apply') === true;
    const dryRunOption = interaction.options.getBoolean('dry_run');
    const applyChanges = applyOption;
    const mode = applyChanges ? 'apply' : (dryRunOption === false ? 'inspect' : 'dry-run');

    const report = await bootstrapDevServer(interaction.guild, { applyChanges });
    const summary = buildBootstrapSummaryMessage(mode, report);
    const replyChunks = splitMessage(summary, 1800);

    await interaction.editReply({ content: replyChunks[0] });
    for (let i = 1; i < replyChunks.length; i += 1) {
      await interaction.followUp({ content: replyChunks[i], ephemeral: true });
    }

    const logChunks = splitMessage(summary, 1800);
    let sentToBotLogs = false;
    for (const chunk of logChunks) {
      const sent = await sendBotLogMessage(interaction.client, interaction.guildId, {
        content: chunk,
      });
      sentToBotLogs = sentToBotLogs || sent;
    }

    if (!sentToBotLogs) {
      await interaction.followUp({
        content:
          'Summary could not be posted to #bot-logs because that channel was not found.',
        ephemeral: true,
      });
    }
  },
};
