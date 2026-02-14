const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: '#0099ff',
  info: '#2980b9',
  success: '#1f8b4c',
  warning: '#f39c12',
  danger: '#c0392b',
  neutral: '#264653',
};

function buildScriptureFooter(passage) {
  const translationName = String(passage?.translationName || 'World English Bible').trim();
  const note = String(passage?.translationNote || 'Public Domain').trim();
  const noteSuffix = note ? ` (${note})` : '';

  // Keep source attribution consistent across all scripture outputs.
  return `${translationName}${noteSuffix} \u2022 bible-api.com`;
}

function buildStandardEmbed(options = {}) {
  const embed = new EmbedBuilder();

  if (options.title) {
    embed.setTitle(String(options.title));
  }
  if (options.description) {
    embed.setDescription(String(options.description));
  }

  embed.setColor(options.color || COLORS.primary);
  embed.setTimestamp(options.timestamp instanceof Date ? options.timestamp : new Date());

  if (options.footerText) {
    embed.setFooter({ text: String(options.footerText) });
  }

  if (Array.isArray(options.fields) && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  return embed;
}

module.exports = {
  COLORS,
  buildScriptureFooter,
  buildStandardEmbed,
};

