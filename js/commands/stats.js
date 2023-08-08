const { SlashCommandBuilder } = require('@discordjs/builders');
const { createCanvas, loadImage } = require('canvas');
const { getStats } = require('../db/statsDB.js');
const { AttachmentBuilder } = require('discord.js');
const { version } = require('../../cfg/config.json');
const { addCommandExecution } = require('../db/statsDB.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show bot statistics'),
    async execute(interaction) {
        await addCommandExecution();
        // Fetch the statistics
        const stats = await getStats();
        const uptime = interaction.client.uptime;

        // Calculate uptime values
        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor(uptime / 3600000) % 24;
        const minutes = Math.floor(uptime / 60000) % 60;
        const seconds = Math.floor(uptime / 1000) % 60;

        // Calculate the canvas size based on data
        const lineHeight = 40;
        const labelWidth = 220; // Adjust for wider labels if needed

        const longestLabel = Math.max(
            `Subscribed Users: ${stats.subscribedUsersCount}`.length,
            `Total Verses Sent: ${stats.totalVersesSent}`.length,
            `Total Commands Executed: ${stats.totalCommandsExecuted}`.length,
            `Total Active Guilds: ${stats.activeGuilds}`.length,
            `Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`.length,
            `Bot Version: ${version}`.length
        );

        const canvasWidth = labelWidth + longestLabel * 12; // Adjust as needed

        const canvasHeight = 170 + (lineHeight * 5) + lineHeight + 20; // Added extra space for header and version

        // Create a canvas
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Header background
        ctx.fillStyle = '#264653'; // Dark blue-green header background
        ctx.fillRect(0, 0, canvas.width, 100);

        // Load and draw bot icon
        const icon = await loadImage('assets/bible_scripture_icon.png');
        ctx.drawImage(icon, 20, 20, 60, 60);

        // Header text styles
        ctx.fillStyle = '#FFFFFF'; // White header text
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Bot Statistics', 90, 60);

        // Data text styles
        ctx.fillStyle = '#FFFFFF'; // White data text
        ctx.font = '24px Arial';
        let dataX = 140; // Adjust the starting X coordinate for data

        // Data fields (left-aligned)
        ctx.textAlign = 'left';
        ctx.fillText(`Subscribed Users: ${stats.subscribedUsersCount}`, dataX, 170);
        ctx.fillText(`Total Verses Sent: ${stats.totalVersesSent}`, dataX, 170 + lineHeight);
        ctx.fillText(`Total Commands Executed: ${stats.totalCommandsExecuted}`, dataX, 170 + lineHeight * 2);
        ctx.fillText(`Total Active Guilds: ${stats.activeGuilds}`, dataX, 170 + lineHeight * 3);

        // Uptime
        const formattedUptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        ctx.fillText(`Uptime: ${formattedUptime}`, dataX, 170 + lineHeight * 4);

        // Bot Version
        ctx.fillText(`Bot Version: ${version}`, dataX, 170 + lineHeight * 5); // Adjusted for extra line

        // Send the canvas as an image
        const attachment = new AttachmentBuilder(canvas.toBuffer(), 'stats.png');
        await interaction.reply({ files: [attachment], ephemeral: true });
    },
};
