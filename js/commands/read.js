const { SlashCommandBuilder } = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { getBookById } = require('../constants/books.js');
const { logger } = require('../logger.js');
const { buildReadMessage, buildReadResolutionMessage, createReadSession } = require('../services/readSessions.js');
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
      const result = await createReadSession({
        userId: interaction.user.id,
        reference,
      });

      if (result.kind === 'needs_confirmation') {
        const payload = buildReadResolutionMessage(result.session);
        await interaction.reply({
          ...payload,
          ephemeral: Boolean(interaction.guildId),
        });
        return;
      }

      const session = result.session;
      const payload = buildReadMessage(session);

      if (interaction.guildId) {
        const book = getBookById(session.bookId);
        const resolvedDisplay = book
          ? `${book.name} (${book.id}) ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`
          : `${session.bookId} ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`;

        const embed = buildStandardEmbed({
          title: 'Check your DMs',
          description: `Resolved: **${resolvedDisplay}**\n\nI sent you a page-turner reader session.`,
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
