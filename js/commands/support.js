const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { version } = require('../../cfg/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Get support and report issues'),
    execute(interaction) {
        const supportEmbed = new EmbedBuilder()
            .setTitle('Need Support or Found a Bug?')
            .setColor('#FF0000')
            .setTimestamp()
            .setDescription(`If you need support, found a bug, or want to make a feature request, please visit our [Issue Tracker](https://github.com/michaelpa-dev/Daily-Bible-Verse-Bot/issues) to report the issue or request.`)
            .setFooter({ text: `Bot Version: ${version}` })
            .setThumbnail(interaction.client.user.displayAvatarURL());

        interaction.reply({ embeds: [supportEmbed], ephemeral: true });
    },
};
