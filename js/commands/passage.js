const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { logger } = require('../logger.js');
const { fetchPassageForBookChapter } = require('../services/bibleApiWeb.js');
const { parseScriptureReference } = require('../services/scriptureReference.js');
const { paginateLines } = require('../services/pagination.js');
const { createPaginatedMessage } = require('../services/paginationInteractions.js');
const { buildEmbedTitle, formatPassageLines } = require('../services/passageFormatter.js');
const { buildScriptureFooter, buildStandardEmbed, COLORS } = require('../services/messageStyle.js');
const { logCommandError } = require('../services/botOps.js');

function buildEmbed(session, timestamp = new Date()) {
  // createPaginatedMessage returns an embed without a timestamp. We add it here so the
  // rendered embed matches other commands.
  const embed = EmbedBuilder.from(session.embed);
  embed.setTimestamp(timestamp);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('passage')
    .setDescription('Post a Bible passage (WEB) in-channel or via DM')
    .addStringOption((option) =>
      option
        .setName('reference')
        .setDescription('Example: "matt 25:31-33,46", "Ps 23", "1 cor 13:4-7"')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Where to send the passage')
        .addChoices(
          { name: 'Channel', value: 'channel' },
          { name: 'DM', value: 'dm' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    await addCommandExecution();

    const rawReference = interaction.options.getString('reference');
    const requestedMode = interaction.options.getString('mode') || 'channel';
    const mode = interaction.guildId ? requestedMode : 'dm';

    logger.info(
      `Slash command /passage called by ${interaction.user.id} mode=${mode} reference="${rawReference}"`
    );

    try {
      const parsed = parseScriptureReference(rawReference);
      const passage = await fetchPassageForBookChapter(
        parsed.bookId,
        parsed.chapter,
        parsed.verseSpec,
        { translation: 'web' }
      );

      const title = buildEmbedTitle(parsed.reference, passage.translationId);
      const lines = formatPassageLines(passage);
      const pages = paginateLines(lines, { maxChars: 3400 });

      const paginated = createPaginatedMessage({
        kind: 'passage',
        userId: interaction.user.id,
        pages,
        title,
        color: COLORS.primary,
        footer: buildScriptureFooter(passage),
        ttlMs: 25 * 60 * 1000,
      });

      const payload = {
        embeds: [buildEmbed(paginated, new Date())],
        components: paginated.components,
      };

      if (mode === 'dm') {
        if (interaction.guildId) {
          const embed = buildStandardEmbed({
            title: 'Check your DMs',
            description: 'I sent you the passage with pagination controls.',
            color: COLORS.primary,
          });
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          await interaction.reply(payload);
        }

        try {
          await interaction.user.send(payload);
        } catch (error) {
          logger.warn('Failed to DM passage; user may have DMs disabled.', error);
          if (interaction.guildId) {
            await interaction.followUp({
              content:
                'I could not send you a DM. Please check your DM privacy settings and try again.',
              ephemeral: true,
            });
          }
        }

        return;
      }

      await interaction.reply(payload);
    } catch (error) {
      logger.error('Passage command failed', error);
      await logCommandError(interaction, error, 'Passage command failed');

      const message =
        error instanceof Error && error.message
          ? `Unable to fetch that passage: ${error.message}`
          : 'Unable to fetch that passage.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};

