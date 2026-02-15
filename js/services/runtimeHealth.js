const { WebSocketShardStatus } = require('discord.js');

const DEFAULT_WS_STATUS_NAME = 'Unknown';

const state = {
  startedAt: Date.now(),
  discord: {
    ready: false,
    readyAt: null,
    lastReadyAt: null,
    lastDisconnectAt: null,
    lastDisconnectReason: null,
    wsStatus: null,
    wsStatusName: DEFAULT_WS_STATUS_NAME,
    wsStatusChangedAt: Date.now(),
    wsPingMs: null,
  },
  interactions: {
    lastInteractionAt: null,
    lastCommandAt: null,
    lastCommandName: null,
    lastCommandUserId: null,
    lastCommandGuildId: null,
  },
  watchdog: {
    lastOkAt: null,
    lastExitAt: null,
    lastExitReason: null,
  },
};

function toIso(ms) {
  if (!ms) {
    return null;
  }
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function normalizeReason(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text.slice(0, 200) : null;
}

function resolveWsStatusName(status) {
  if (!Number.isFinite(status)) {
    return DEFAULT_WS_STATUS_NAME;
  }

  return WebSocketShardStatus?.[status] || String(status);
}

function updateDiscordStateFromClient(client) {
  if (!client) {
    return;
  }

  try {
    if (client.readyAt instanceof Date) {
      state.discord.readyAt = client.readyAt.getTime();
    }
  } catch {
    // ignore
  }

  try {
    if (client.ws && typeof client.ws.status === 'number') {
      const status = client.ws.status;
      if (state.discord.wsStatus !== status) {
        state.discord.wsStatus = status;
        state.discord.wsStatusName = resolveWsStatusName(status);
        state.discord.wsStatusChangedAt = Date.now();
      }
    }
  } catch {
    // ignore
  }

  try {
    if (client.ws && typeof client.ws.ping === 'number') {
      state.discord.wsPingMs = client.ws.ping;
    }
  } catch {
    // ignore
  }
}

function markDiscordReady(client) {
  state.discord.ready = true;
  state.discord.lastReadyAt = Date.now();
  state.discord.lastDisconnectReason = null;
  updateDiscordStateFromClient(client);
}

function markDiscordDisconnect(client, reason) {
  state.discord.ready = false;
  state.discord.lastDisconnectAt = Date.now();
  state.discord.lastDisconnectReason = normalizeReason(reason);
  updateDiscordStateFromClient(client);
}

function markInteraction(interaction) {
  const now = Date.now();
  state.interactions.lastInteractionAt = now;

  if (!interaction || typeof interaction.isChatInputCommand !== 'function') {
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  state.interactions.lastCommandAt = now;
  state.interactions.lastCommandName = String(interaction.commandName || '').trim() || null;
  state.interactions.lastCommandUserId = interaction.user?.id || null;
  state.interactions.lastCommandGuildId = interaction.guildId || null;
}

function markWatchdogOk() {
  state.watchdog.lastOkAt = Date.now();
}

function markWatchdogExit(reason) {
  state.watchdog.lastExitAt = Date.now();
  state.watchdog.lastExitReason = normalizeReason(reason);
}

function getSnapshot(client) {
  updateDiscordStateFromClient(client);

  return {
    startedAt: toIso(state.startedAt),
    uptimeSeconds: Math.floor(process.uptime()),
    discord: {
      ready: state.discord.ready,
      readyAt: toIso(state.discord.readyAt),
      lastReadyAt: toIso(state.discord.lastReadyAt),
      lastDisconnectAt: toIso(state.discord.lastDisconnectAt),
      lastDisconnectReason: state.discord.lastDisconnectReason,
      wsStatus: state.discord.wsStatus,
      wsStatusName: state.discord.wsStatusName,
      wsStatusChangedAt: toIso(state.discord.wsStatusChangedAt),
      wsPingMs: state.discord.wsPingMs,
    },
    interactions: {
      lastInteractionAt: toIso(state.interactions.lastInteractionAt),
      lastCommandAt: toIso(state.interactions.lastCommandAt),
      lastCommandName: state.interactions.lastCommandName,
      lastCommandUserId: state.interactions.lastCommandUserId,
      lastCommandGuildId: state.interactions.lastCommandGuildId,
    },
    watchdog: {
      lastOkAt: toIso(state.watchdog.lastOkAt),
      lastExitAt: toIso(state.watchdog.lastExitAt),
      lastExitReason: state.watchdog.lastExitReason,
    },
    process: {
      pid: process.pid,
      memoryRssBytes: process.memoryUsage().rss,
    },
  };
}

module.exports = {
  getSnapshot,
  markDiscordDisconnect,
  markDiscordReady,
  markInteraction,
  markWatchdogExit,
  markWatchdogOk,
  __private: {
    state,
    resolveWsStatusName,
    updateDiscordStateFromClient,
  },
};

