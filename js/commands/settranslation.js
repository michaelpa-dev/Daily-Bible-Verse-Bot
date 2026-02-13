const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { logger } = require('../logger.js');
const { addCommandExecution } = require('../db/statsDB.js');
const {
  setUserTranslation,
  isSubscribed,
} = require('../db/subscribeDB.js');
const {
  getTranslationLabel,
  normalizeTranslationCode,
  toDiscordChoices,
} = require('../constants/translations.js');
const { logCommandError } = require('../services/botOps.js');

const translationChoices = toDiscordChoices().slice(0, 25);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settranslation')
    .setDescription('Set your default Bible translation preference')
    .addStringOption((option) => {
      option
        .setName('translation')
        .setDescription('Translation used for daily and random verses')
        .setRequired(true);
      for (const choice of translationChoices) {
        option.addChoices(choice);
      }
      return option;
    }),
  async execute(interaction) {
    await addCommandExecution();
    logger.info(`Slash command /settranslation called by ${interaction.user.username}`);

    const selectedTranslation = normalizeTranslationCode(
      interaction.options.getString('translation')
    );
    const selectedLabel = getTranslationLabel(selectedTranslation);

    try {
      await setUserTranslation(interaction.user.id, selectedTranslation);
      const subscribed = await isSubscribed(interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('Translation preference updated')
        .setColor('#00AA55')
        .setTimestamp()
        .setDescription(`Your default translation is now ${selectedLabel}.`)
        .setFooter({
          text: subscribed
            ? 'This will apply to your daily verse delivery.'
            : 'Use /subscribe to start receiving daily verses with this translation.',
        })
        .setThumbnail(interaction.client.user.displayAvatarURL());

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error(error);
      await logCommandError(interaction, error, 'Set translation command failed');
      await interaction.reply({
        content: 'An error occurred while updating your translation preference.',
        ephemeral: true,
      });
    }
  },
};
