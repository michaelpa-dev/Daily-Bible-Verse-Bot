const { SlashCommandBuilder } = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { logger } = require('../logger.js');
const { buildReadMessage, createReadSession } = require('../services/readSessions.js');
const { logCommandError } = require('../services/botOps.js');
const { buildStandardEmbed, COLORS } = require('../services/messageStyle.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('read')
    .setDescription('Read a passage in DMs with page-turner controls (WEB)')
    .addStringOption((option) =>
      option
        .setName('reference')
        .setDescription('Example: "John 3", "matt 25:31-33,46", "1 cor 13:4-7"')
        .setRequired(true)
    ),

  async execute(interaction) {
    await addCommandExecution();

    const reference = interaction.options.getString('reference');
    logger.info(`Slash command /read called by ${interaction.user.id} reference="${reference}"`);

    try {
      const session = await createReadSession({
        userId: interaction.user.id,
        reference,
      });

      const payload = buildReadMessage(session);

      if (interaction.guildId) {
        const embed = buildStandardEmbed({
          title: 'Check your DMs',
          description: 'I sent you a page-turner reader session.',
          color: COLORS.primary,
          footerText: 'Use /read again to jump to a new reference.',
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        await interaction.user.send(payload);
        return;
      }

      await interaction.reply(payload);
    } catch (error) {
      logger.error('Read command failed', error);
      await logCommandError(interaction, error, 'Read command failed');
      const message =
        error instanceof Error && error.message
          ? `Unable to start reader: ${error.message}`
          : 'Unable to start reader.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};

