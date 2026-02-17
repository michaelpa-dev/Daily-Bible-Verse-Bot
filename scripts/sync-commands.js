#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const VALID_MODES = new Set(['guild', 'global']);

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function getModeFromEnv() {
  const rawMode = String(process.env.MODE || '')
    .trim()
    .toLowerCase();
  const publishGlobal = parseBoolean(process.env.PUBLISH_GLOBAL);

  if (rawMode) {
    return rawMode;
  }

  return publishGlobal ? 'global' : 'guild';
}

function requireEnv(name, options = {}) {
  const { optional = false } = options;
  const value = String(process.env[name] || '').trim();

  if (!value && !optional) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set ${name} and run the sync command again.`
    );
  }

  return value;
}

function loadCommandPayloads() {
  const commandsDir = path.join(__dirname, '..', 'js', 'commands');
  if (!fs.existsSync(commandsDir)) {
    throw new Error(`Command directory does not exist: ${commandsDir}`);
  }

  const commandFiles = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b));

  if (commandFiles.length === 0) {
    throw new Error(`No command files found in ${commandsDir}`);
  }

  const seenNames = new Set();
  const payloads = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsDir, file);
    const commandModule = require(filePath);

    if (!commandModule?.data || typeof commandModule.data.toJSON !== 'function') {
      throw new Error(`Invalid command module (missing data.toJSON): ${filePath}`);
    }

    const payload = commandModule.data.toJSON();
    if (!payload?.name) {
      throw new Error(`Invalid command payload (missing name): ${filePath}`);
    }

    if (seenNames.has(payload.name)) {
      throw new Error(`Duplicate command name detected: ${payload.name}`);
    }

    seenNames.add(payload.name);
    payloads.push(payload);
  }

  return payloads;
}

function formatCommandNames(commands) {
  return commands
    .map((command) => command.name)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

async function syncCommands() {
  const mode = getModeFromEnv();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid MODE "${mode}". Use MODE=guild or MODE=global.`);
  }

  const token = requireEnv('DISCORD_TOKEN');
  const clientId = requireEnv('CLIENT_ID');
  const publishGlobal = parseBoolean(process.env.PUBLISH_GLOBAL);
  const devGuildId =
    mode === 'guild' ? requireEnv('DEV_GUILD_ID') : requireEnv('DEV_GUILD_ID', { optional: true });

  console.log('Command sync configuration:');
  console.log(`- MODE: ${mode}`);
  console.log(`- CLIENT_ID: ${clientId}`);
  console.log(`- DEV_GUILD_ID: ${devGuildId || '(not required for global mode)'}`);
  console.log(`- PUBLISH_GLOBAL: ${publishGlobal}`);

  const payloads = loadCommandPayloads();
  console.log(`Loaded ${payloads.length} command definitions from js/commands.`);
  console.log(`Command names: ${formatCommandNames(payloads)}`);

  const rest = new REST({ version: '10' }).setToken(token);
  const putRoute =
    mode === 'global'
      ? Routes.applicationCommands(clientId)
      : Routes.applicationGuildCommands(clientId, devGuildId);

  console.log(`Syncing commands via PUT ${mode === 'global' ? 'global' : 'guild'} route...`);
  await rest.put(putRoute, { body: payloads });

  const getRoute =
    mode === 'global'
      ? Routes.applicationCommands(clientId)
      : Routes.applicationGuildCommands(clientId, devGuildId);
  const registered = await rest.get(getRoute);
  const registeredArray = Array.isArray(registered) ? registered : [];

  console.log(`Verified ${registeredArray.length} registered ${mode} command(s):`);
  console.log(formatCommandNames(registeredArray));
  console.log('Command sync complete.');
}

syncCommands().catch((error) => {
  console.error(`Command sync failed: ${error.message}`);
  process.exit(1);
});
