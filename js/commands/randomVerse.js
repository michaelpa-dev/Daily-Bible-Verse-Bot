const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const sendDailyVerse = require('../verseSender');
const { logger } = require('../logger.js');
const { addCommandExecution } = require('../db/statsDB.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomverse')
        .setDescription('Get a random bible verse via DM'),
    async execute(interaction) {
        await addCommandExecution();
        logger.info(`Slash command /randomverse called by ${interaction.user.username}`);
        const user = interaction.user; // Fetch the user to ensure accurate information

        try {
            const embed = new EmbedBuilder()
            .setTitle('A random Bible verse has been sent to your DMs!')
            .setColor('#FF0000')
            .setTimestamp()
            .setDescription('You will receive a random Bible verse in your DMs.')
            .setFooter({ text: 'You can subscribe at any time by using the /subscribe command.'})
            .setThumbnail(interaction.client.user.displayAvatarURL())
            await interaction.reply({ embeds: [embed], ephemeral: true });      

            await sendDailyVerse(interaction.client, user, 'random');
        } catch (error) {
            logger.error(error);
            await interaction.reply({ content: 'An error occurred while sending the random Bible verse.', ephemeral: true });
        }
    }
};
