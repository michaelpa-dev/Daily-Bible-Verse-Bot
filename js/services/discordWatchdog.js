const { WebSocketShardStatus } = require('discord.js');

const { logger } = require('../logger.js');
const {
  markWatchdogExit,
  markWatchdogOk,
} = require('./runtimeHealth.js');

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_STARTUP_GRACE_MS = 2 * 60_000;
const DEFAULT_MAX_STUCK_MS = 5 * 60_000;

function parseBoolean(value, defaultValue) {
  if (value == null || String(value).trim().length === 0) {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

function parsePositiveInt(value, defaultValue) {
  if (value == null || String(value).trim().length === 0) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

function resolveStatusName(status) {
  if (!Number.isFinite(status)) {
    return 'Unknown';
  }

  return WebSocketShardStatus?.[status] || String(status);
}

function buildConfig(environment = process.env) {
  return {
    enabled: parseBoolean(environment.WATCHDOG_ENABLED, true),
    intervalMs: parsePositiveInt(environment.WATCHDOG_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    startupGraceMs: parsePositiveInt(
      environment.WATCHDOG_STARTUP_GRACE_MS,
      DEFAULT_STARTUP_GRACE_MS
    ),
    maxStuckMs: parsePositiveInt(environment.WATCHDOG_MAX_STUCK_MS, DEFAULT_MAX_STUCK_MS),
  };
}

function evaluateDiscordWatchdogState(input, config) {
  const now = Number(input?.now || Date.now());
  const startedAt = Number(input?.startedAt || 0);
  const isReady = Boolean(input?.isReady);
  const wsStatus = Number.isFinite(input?.wsStatus) ? input.wsStatus : null;
  const wsStatusChangedAt = Number(input?.wsStatusChangedAt || 0);

  if (isReady) {
    return { shouldExit: false, reason: null };
  }

  // Allow time for initial login, guild sync, and rate-limited REST calls.
  if (startedAt > 0 && now - startedAt < config.startupGraceMs) {
    return { shouldExit: false, reason: null };
  }

  if (wsStatusChangedAt > 0 && now - wsStatusChangedAt >= config.maxStuckMs) {
    const statusName = resolveStatusName(wsStatus);
    return {
      shouldExit: true,
      reason: `Discord connection stuck in ${statusName} for ${Math.round(
        (now - wsStatusChangedAt) / 1000
      )}s`,
    };
  }

  return { shouldExit: false, reason: null };
}

function startDiscordWatchdog(client, options = {}) {
  const config = {
    ...buildConfig(),
    ...options,
  };

  if (!config.enabled) {
    logger.info('Watchdog disabled (WATCHDOG_ENABLED=false).');
    return {
      stop() {},
      config,
    };
  }

  const startedAt = Date.now();
  let lastWsStatus = null;
  let wsStatusChangedAt = Date.now();
  let stopped = false;

  logger.info(
    `Watchdog enabled: interval=${config.intervalMs}ms startupGrace=${config.startupGraceMs}ms maxStuck=${config.maxStuckMs}ms`
  );

  const tick = () => {
    if (stopped) {
      return;
    }

    const now = Date.now();
    const isReady = typeof client?.isReady === 'function' ? client.isReady() : false;

    const wsStatusRaw =
      client && client.ws && typeof client.ws.status === 'number' ? client.ws.status : null;
    const wsStatus = Number.isFinite(wsStatusRaw) ? wsStatusRaw : null;
    if (wsStatus !== lastWsStatus) {
      lastWsStatus = wsStatus;
      wsStatusChangedAt = now;
    }

    const decision = evaluateDiscordWatchdogState(
      {
        now,
        startedAt,
        isReady,
        wsStatus,
        wsStatusChangedAt,
      },
      config
    );

    if (!decision.shouldExit) {
      markWatchdogOk();
      return;
    }

    markWatchdogExit(decision.reason);
    logger.error(`Watchdog triggering process exit: ${decision.reason}`);
    process.exit(1);
  };

  const interval = setInterval(tick, config.intervalMs);
  interval.unref?.();

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    config,
  };
}

module.exports = {
  startDiscordWatchdog,
  __private: {
    buildConfig,
    evaluateDiscordWatchdogState,
    parseBoolean,
    parsePositiveInt,
    resolveStatusName,
  },
};

