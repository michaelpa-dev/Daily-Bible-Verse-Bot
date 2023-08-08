const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { logger } = require('../logger.js');
const fs = require('fs/promises');
const sendDailyVerse = require('../verseSender');
const { addSubscribedUser, isSubscribed } = require('../db/subscribeDB.js');
const { addCommandExecution, updateSubscribedUsersCount } = require('../db/statsDB.js');

const dataFilePath = path.join(__dirname, '../../db/subscribed_users.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('subscribe')
        .setDescription('Subscribe to daily bible verses'),
    async execute(interaction) {
        await addCommandExecution();
        logger.info(`Slash command /subscribe called by ${interaction.user.username}`);
        const userID = interaction.user.id;

        try {

            if (await isSubscribed(userID)) {
                logger.debug(`${interaction.user.username} is already subscribed`);
                const embed = new EmbedBuilder()
                    .setTitle('🙏 You are already subscribed! 🙏')
                    .setColor('#FF0000')
                    .setTimestamp()
                    .setDescription('You are already subscribed to daily bible verses.')
                    .setFooter({ text: 'You can unsubscribe at any time by using the /unsubscribe command.'})
                    .setThumbnail(interaction.client.user.displayAvatarURL())

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                logger.debug(`${interaction.user.username} is not subscribed`);
                await addSubscribedUser(userID);
                await updateSubscribedUsersCount();
                const embed = new EmbedBuilder()
                    .setTitle('🙏 You have been subscribed! 🙏')
                    .setColor('#00FF00')
                    .setTimestamp()
                    .setDescription('You will now receive daily bible verses.')
                    .setFooter({ text: 'You can unsubscribe at any time by using the /unsubscribe command.'})
                    .setThumbnail(interaction.client.user.displayAvatarURL())

                await interaction.reply({ embeds: [embed], ephemeral: true });
                
                await sendDailyVerse(interaction.client, interaction.user, 'votd');
            }
        } catch (error) {
            logger.error(error);
            await interaction.reply({ content: 'An error occurred while processing your subscription request.', ephemeral: true });
        }
    }
};
