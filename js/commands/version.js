const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { addCommandExecution } = require("../db/statsDB");
const { logger } = require("../logger");
const { default: axios } = require("axios");

const REPOSITORY_OWNER = "michaelpa-dev"
const REPOSITORY_NAME = "Daily-Bible-Verse-Bot"

module.exports = {
    data: new SlashCommandBuilder()
    .setName("version")
    .setDescription("Get the current version of the bot"),

    async execute(interaction) {
        await addCommandExecution()
        logger.info(`Slash command /version called by ${interaction.user.username}`);

        try {
            const response = await axios.get(`https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/releases/latest`)
            const latestVersion = response.data.tag_name

            const embed = new EmbedBuilder()
            .setTitle("Daily Bible Verse Version")
            .setColor("#FF0000")
            .setTimestamp()
            .setDescription(`The current version is: ${"`"}${latestVersion}${"`"}`)
            .setThumbnail(interaction.client.user.displayAvatarURL())

            await interaction.reply({ embeds: [embed], ephemeral: true })
        } catch (exception) {
            logger.error(exception)
            await interaction.reply({ content: "An error occurred while getting the version of the bot.", ephemeral: true })
        }
    }
}