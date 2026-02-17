const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { logger } = require('../logger.js');
const { getBuildInfo } = require('../services/buildInfo.js');
const { buildStandardEmbed, COLORS } = require('../services/messageStyle.js');

const SPONSORS_URL = 'https://github.com/sponsors/michaelpa-dev';

const CRYPTO_ADDRESSES = Object.freeze({
  BTC: 'bc1qfy8224yh5xawguv0v2zwkth3cthn2vxwl4e7hj',
  ETH: '0x51C144B9fFDb178E9Ec717254BdF94e7392d39Ad',
  XLM: 'GDFRF44XCBMLYNMN3GDVPDOGWEPXYOZTESPDENSMCMMRCQK5PXBG5NX5',
  XRP: 'rNV5eC7smHWdQCxAeTj3UnCFf8zvhEA6NF',
});

function buildGiveSupportText() {
  return [
    '**Support Daily Bible Verse**',
    '',
    `GitHub Sponsors: ${SPONSORS_URL}`,
    '',
    '**Crypto**',
    `BTC: \`${CRYPTO_ADDRESSES.BTC}\``,
    `ETH: \`${CRYPTO_ADDRESSES.ETH}\``,
    `XLM: \`${CRYPTO_ADDRESSES.XLM}\``,
    `XRP: \`${CRYPTO_ADDRESSES.XRP}\``,
    '',
    '_Always verify addresses before sending funds._',
  ].join('\n');
}

function buildGiveSupportEmbed(buildInfo) {
  const embed = buildStandardEmbed({
    title: 'Support Daily Bible Verse',
    color: COLORS.info,
    description:
      'If this bot has been helpful and you want to support development, here are a few options.\n\n' +
      '_Always verify addresses before sending funds._',
    footerText: `Bot: ${buildInfo.releaseTag} (${buildInfo.gitSha})`,
    fields: [
      {
        name: 'GitHub Sponsors',
        value: `Support via GitHub Sponsors:\n${SPONSORS_URL}`,
      },
      {
        name: 'Crypto',
        value: [
          `BTC: \`${CRYPTO_ADDRESSES.BTC}\``,
          `ETH: \`${CRYPTO_ADDRESSES.ETH}\``,
          `XLM: \`${CRYPTO_ADDRESSES.XLM}\``,
          `XRP: \`${CRYPTO_ADDRESSES.XRP}\``,
        ].join('\n'),
      },
    ],
  });

  return embed;
}

function buildGiveComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('GitHub Sponsors').setStyle(ButtonStyle.Link).setURL(SPONSORS_URL)
  );

  return [row];
}

function canSendEmbeds(interaction) {
  if (!interaction?.guildId) {
    return true;
  }

  const channel = interaction.channel;
  const userId = interaction.client?.user?.id;
  if (!channel || !userId || typeof channel.permissionsFor !== 'function') {
    // If we can't determine, default to attempting embeds.
    return true;
  }

  const perms = channel.permissionsFor(userId);
  if (!perms || typeof perms.has !== 'function') {
    return true;
  }

  try {
    return perms.has(PermissionFlagsBits.EmbedLinks);
  } catch {
    return true;
  }
}

async function replyGive(interaction) {
  const buildInfo = getBuildInfo();
  const components = buildGiveComponents();

  const embed = buildGiveSupportEmbed(buildInfo);
  const text = buildGiveSupportText();

  if (!canSendEmbeds(interaction)) {
    await interaction.reply({ content: text, components });
    return;
  }

  try {
    await interaction.reply({ embeds: [embed], components });
  } catch (error) {
    // If the bot lacks Embed Links in a guild channel, the API will reject the embed payload.
    // Fall back to plain text (still includes the Sponsors link button).
    logger.warn('Failed to send /give embed; falling back to plain text', error);
    const payload = { content: text, components };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
      return;
    }
    await interaction.reply(payload);
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('give').setDescription('Support development of the bot'),
  async execute(interaction) {
    await addCommandExecution();

    // Do not log support addresses; keep logs limited to who/where invoked the command.
    logger.info(
      `Slash command /give called by ${interaction.user?.id || 'unknown'} guild=${interaction.guildId || 'DM'} channel=${interaction.channelId || 'unknown'}`
    );

    await replyGive(interaction);
  },
  __private: {
    buildGiveComponents,
    buildGiveSupportEmbed,
    buildGiveSupportText,
    canSendEmbeds,
    replyGive,
  },
};
