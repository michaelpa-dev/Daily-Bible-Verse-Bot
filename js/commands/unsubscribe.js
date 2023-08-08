const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { logger } = require('../logger.js');
const fs = require('fs/promises');
const { removeSubscribedUser, isSubscribed } = require('../db/subscribeDB.js');
const { addCommandExecution, updateSubscribedUsersCount } = require('../db/statsDB.js');



const dataFilePath = path.join(__dirname, '../../db/subscribed_users.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsubscribe')
        .setDescription('Unsubscribe from daily bible verses'),
    async execute(interaction) {
        await addCommandExecution();
        logger.info(`Slash command /unsubscribe called by ${interaction.user.username}`);
        const userID = interaction.user.id;

        try {
            if (isSubscribed(userID)) {
                await removeSubscribedUser(userID);
                await updateSubscribedUsersCount();
                const embed = new EmbedBuilder()
                    .setTitle('You have been unsubscribed!')
                    .setColor('#FF0000')
                    .setTimestamp()
                    .setDescription('You will no longer receive daily bible verses.')
                    .setFooter({ text: 'You can subscribe again anytime using the /subscribe command.' })
                    .setThumbnail(interaction.client.user.displayAvatarURL());

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                logger.debug(`${interaction.user.username} is not subscribed`);
                const embed = new EmbedBuilder()
                    .setTitle('You are not subscribed!')
                    .setColor('#FF0000')
                    .setTimestamp()
                    .setDescription('You are not currently subscribed to daily bible verses.')
                    .setFooter({ text: 'You can subscribe using the /subscribe command.' })
                    .setThumbnail(interaction.client.user.displayAvatarURL());

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            logger.error(error);
            await interaction.reply({ content: 'An error occurred while processing your unsubscription request.', ephemeral: true });
        }
    }
};
