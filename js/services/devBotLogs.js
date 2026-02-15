const {
  ChannelType,
} = require('discord.js');

const { logger } = require('../logger.js');
const { TARGET_DEV_GUILD_ID, CHANNEL_NAMES } = require('../constants/devServerSpec.js');
const { getBuildInfo } = require('./buildInfo.js');
const { getCorrelationId } = require('./correlation.js');

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

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

function parseLogLevel(value, defaultLevel) {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVELS, normalized)) {
    return normalized;
  }
  return defaultLevel;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeValue(value) {
  if (value == null) {
    return '';
  }

  return String(value)
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .slice(0, 500);
}

function toIso(value) {
  try {
    return new Date(value || Date.now()).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function buildConfig(environment = process.env) {
  const runtimeEnvironment = String(
    environment.DEPLOY_ENVIRONMENT || environment.APP_ENV || environment.NODE_ENV || ''
  )
    .trim()
    .toLowerCase();

  // #bot-logs must be always-on in both canary + production. Keep it opt-in for
  // local development unless explicitly enabled, to avoid noisy failures when
  // the bot isn't present in the dev guild.
  const enabledDefault = runtimeEnvironment === 'canary' || runtimeEnvironment === 'production';
  const enabled = parseBoolean(environment.DEV_LOGGING_ENABLED, enabledDefault);

  // Prefer DEV_LOG_LEVEL for the Discord sink, but fall back to LOG_LEVEL so
  // operators only have to learn one knob in simple setups.
  const defaultLevel = 'info';
  const configuredLevel = environment.DEV_LOG_LEVEL ?? environment.LOG_LEVEL;
  const level = parseLogLevel(configuredLevel, defaultLevel);

  return {
    enabled,
    level,
    guildId: String(environment.DEV_GUILD_ID || TARGET_DEV_GUILD_ID).trim() || TARGET_DEV_GUILD_ID,
    channelId: String(environment.DEV_BOT_LOGS_CHANNEL_ID || '').trim() || null,
    flushIntervalMs: parsePositiveInt(environment.DEV_LOG_FLUSH_INTERVAL_MS, 2000),
    maxBatchItems: parsePositiveInt(environment.DEV_LOG_MAX_BATCH_ITEMS, 20),
    maxQueueItems: parsePositiveInt(environment.DEV_LOG_MAX_QUEUE_ITEMS, 500),
    // Leave headroom for code fences and Discord formatting.
    maxMessageChars: 1900,
    // Coalesce repeated identical events to avoid log spam loops.
    coalesceWindowMs: parsePositiveInt(environment.DEV_LOG_COALESCE_WINDOW_MS, 15_000),
    startupRetryAttempts: parsePositiveInt(environment.DEV_LOG_STARTUP_RETRY_ATTEMPTS, 5),
  };
}

function shouldPost(level, config) {
  const incoming = LEVELS[String(level || '').toLowerCase()] ?? LEVELS.info;
  const threshold = LEVELS[config.level] ?? LEVELS.info;
  return incoming >= threshold;
}

const state = {
  client: null,
  config: buildConfig(),
  startedAtMs: Date.now(),
  queue: [],
  flushTimer: null,
  stopped: false,
  resolvingChannel: null,
  cachedChannel: null,
  // Health / circuit breaker
  lastSuccessAtMs: 0,
  lastFailureAtMs: 0,
  consecutiveFailures: 0,
  disabledUntilMs: 0,
  droppedCount: 0,
  lastWarningAtMs: 0,
  lastEnqueueWarningAtMs: 0,
  // Coalescing
  lastEnqueuedKey: null,
  lastEnqueuedAtMs: 0,
};

async function resolveLogsChannel() {
  if (state.cachedChannel) {
    return state.cachedChannel;
  }

  if (!state.client) {
    return null;
  }

  if (state.resolvingChannel) {
    return state.resolvingChannel;
  }

  state.resolvingChannel = (async () => {
    const client = state.client;
    const { guildId, channelId } = state.config;

    if (channelId) {
      const direct = await client.channels.fetch(channelId).catch(() => null);
      if (direct && typeof direct.send === 'function') {
        state.cachedChannel = direct;
        state.resolvingChannel = null;
        return direct;
      }
    }

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      state.resolvingChannel = null;
      return null;
    }

    // Ensure the channel cache is populated.
    if (typeof guild.channels.fetch === 'function') {
      await guild.channels.fetch().catch(() => null);
    }

    const channel =
      guild.channels.cache.find(
        (candidate) =>
          candidate &&
          candidate.type === ChannelType.GuildText &&
          String(candidate.name || '').toLowerCase() === CHANNEL_NAMES.botLogs
      ) || null;

    state.cachedChannel = channel;
    state.resolvingChannel = null;
    return channel;
  })();

  return state.resolvingChannel;
}

function formatEntry(entry) {
  const parts = [];
  parts.push(`${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.event}`);

  if (entry.correlationId) {
    parts.push(`cid=${sanitizeValue(entry.correlationId)}`);
  }

  if (entry.message) {
    parts.push(`msg=${sanitizeValue(entry.message)}`);
  }

  const fields = entry.fields && typeof entry.fields === 'object' ? entry.fields : null;
  if (fields) {
    const keys = Object.keys(fields).sort();
    for (const key of keys) {
      const value = fields[key];
      if (value == null) {
        continue;
      }
      parts.push(`${key}=${sanitizeValue(value)}`);
    }
  }

  if (entry.count && entry.count > 1) {
    parts.push(`x${entry.count}`);
  }

  return parts.join(' ');
}

function formatDiscordMessage(lines) {
  const body = lines.join('\n');
  return `\`\`\`log\n${body}\n\`\`\``;
}

function logStructuredToStdout(entry) {
  try {
    // This is intentionally JSON so it can be grepped/queried from container logs.
    const payload = {
      ts: entry.timestamp,
      level: entry.level,
      event: entry.event,
      cid: entry.correlationId || undefined,
      msg: entry.message || undefined,
      fields: entry.fields || undefined,
      count: entry.count || undefined,
    };

    if (entry.level === 'error') {
      logger.error(JSON.stringify(payload));
    } else if (entry.level === 'warn') {
      logger.warn(JSON.stringify(payload));
    } else if (entry.level === 'debug') {
      logger.debug(JSON.stringify(payload));
    } else {
      logger.info(JSON.stringify(payload));
    }
  } catch {
    // ignore
  }
}

function enqueue(entry) {
  if (state.stopped) {
    return;
  }

  if (!state.config.enabled) {
    return;
  }

  if (!shouldPost(entry.level, state.config)) {
    return;
  }

  logStructuredToStdout(entry);

  const now = Date.now();
  if (state.disabledUntilMs > now) {
    state.droppedCount += 1;
    return;
  }

  if (state.queue.length >= state.config.maxQueueItems) {
    state.droppedCount += 1;
    state.queue.shift();
  }

  const key = `${entry.level}|${entry.event}|${entry.message || ''}`;
  const canCoalesce = entry.level === 'warn' || entry.level === 'error';
  if (
    canCoalesce &&
    state.queue.length > 0 &&
    state.lastEnqueuedKey === key &&
    now - state.lastEnqueuedAtMs <= state.config.coalesceWindowMs
  ) {
    const last = state.queue[state.queue.length - 1];
    if (last && last.__coalesceKey === key) {
      last.count = (last.count || 1) + 1;
      last.timestamp = entry.timestamp;
      state.lastEnqueuedAtMs = now;
      return;
    }
  }

  entry.__coalesceKey = key;
  entry.count = entry.count || 1;
  state.queue.push(entry);
  state.lastEnqueuedKey = key;
  state.lastEnqueuedAtMs = now;

  if (state.queue.length >= state.config.maxBatchItems) {
    // Fire-and-forget flush.
    flush().catch(() => null);
  }
}

async function sendToDiscord(content) {
  const channel = await resolveLogsChannel();
  if (!channel) {
    throw new Error('Dev #bot-logs channel not found or not accessible.');
  }

  await channel.send({ content });
}

function registerFailure(error) {
  const now = Date.now();
  state.lastFailureAtMs = now;
  state.consecutiveFailures += 1;

  if (state.consecutiveFailures >= 3) {
    const exponent = Math.min(6, state.consecutiveFailures - 3);
    const cooldownMs = Math.min(30 * 60_000, 60_000 * 2 ** exponent);
    state.disabledUntilMs = now + cooldownMs;
  }

  // Throttle warning spam to local logs.
  if (now - state.lastWarningAtMs > 60_000) {
    state.lastWarningAtMs = now;
    const until = state.disabledUntilMs > now
      ? `; circuit open for ${Math.round((state.disabledUntilMs - now) / 1000)}s`
      : '';
    logger.warn(
      `Failed to post to dev #bot-logs (${state.consecutiveFailures} consecutive failures)${until}: ${error?.message || error}`
    );
  }
}

function registerSuccess() {
  state.lastSuccessAtMs = Date.now();
  state.consecutiveFailures = 0;
  state.disabledUntilMs = 0;
}

async function flush() {
  if (state.stopped) {
    return;
  }

  if (!state.config.enabled) {
    return;
  }

  const now = Date.now();
  if (state.disabledUntilMs > now) {
    return;
  }

  if (state.queue.length === 0) {
    return;
  }

  // Drain a bounded batch and send it as 1..N discord messages under the 2000 char limit.
  const batch = state.queue.splice(0, state.config.maxBatchItems);
  const chunks = [];
  let current = { lines: [], entries: [] };

  const pushChunk = () => {
    if (current.entries.length === 0) {
      return;
    }
    chunks.push(current);
    current = { lines: [], entries: [] };
  };

  for (const entry of batch) {
    const line = formatEntry(entry);
    const nextLines = current.lines.concat(line);
    const nextMessage = formatDiscordMessage(nextLines);

    if (nextMessage.length > state.config.maxMessageChars) {
      pushChunk();

      const single = formatDiscordMessage([line]);
      if (single.length > state.config.maxMessageChars) {
        // Extremely defensive: truncate line content if it still won't fit.
        const clipped = line.slice(0, Math.max(0, state.config.maxMessageChars - 50)) + '...';
        chunks.push({ lines: [clipped], entries: [entry] });
      } else {
        current = { lines: [line], entries: [entry] };
      }
      continue;
    }

    current.lines = nextLines;
    current.entries.push(entry);
  }

  pushChunk();

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    try {
      await sendToDiscord(formatDiscordMessage(chunk.lines));
    } catch (error) {
      // Requeue only the entries that were not sent yet. Entries in earlier chunks were
      // already posted successfully and should not be duplicated.
      const unsent = [];
      for (let j = i; j < chunks.length; j += 1) {
        unsent.push(...chunks[j].entries);
      }
      state.queue.unshift(...unsent);
      registerFailure(error);
      return;
    }
  }

  registerSuccess();
}

function start(client, options = {}) {
  state.client = client;
  state.config = {
    ...buildConfig(),
    ...(options.config || {}),
  };

  state.stopped = false;
  state.startedAtMs = Date.now();
  state.cachedChannel = null;
  state.resolvingChannel = null;

  if (!state.config.enabled) {
    logger.info('Dev #bot-logs is disabled (DEV_LOGGING_ENABLED=false).');
    return;
  }

  if (state.flushTimer) {
    clearInterval(state.flushTimer);
  }

  state.flushTimer = setInterval(() => {
    flush().catch(() => null);
  }, state.config.flushIntervalMs);
  state.flushTimer.unref?.();
}

async function validateStartup() {
  if (!state.config.enabled) {
    return { ok: false, reason: 'disabled' };
  }

  const build = getBuildInfo();
  const baseMessage = `✅ Bot started env=${build.runtimeEnvironment} tag=${build.releaseTag} sha=${build.gitSha}`;

  let lastError = null;
  for (let attempt = 1; attempt <= state.config.startupRetryAttempts; attempt += 1) {
    try {
      await sendToDiscord(baseMessage);
      registerSuccess();
      return { ok: true };
    } catch (error) {
      lastError = error;
      registerFailure(error);
      // Backoff: 1s, 3s, 6s, 12s, ...
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      await sleep(delayMs);
    }
  }

  return { ok: false, reason: lastError?.message || 'unknown' };
}

function stop() {
  state.stopped = true;
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
}

function getHealth() {
  return {
    enabled: state.config.enabled,
    guildId: state.config.guildId,
    channelId: state.config.channelId,
    queueLength: state.queue.length,
    droppedCount: state.droppedCount,
    lastSuccessAt: state.lastSuccessAtMs ? toIso(state.lastSuccessAtMs) : null,
    lastFailureAt: state.lastFailureAtMs ? toIso(state.lastFailureAtMs) : null,
    consecutiveFailures: state.consecutiveFailures,
    circuitOpenUntil: state.disabledUntilMs ? toIso(state.disabledUntilMs) : null,
    level: state.config.level,
  };
}

function logEvent(level, event, fields, message) {
  try {
    enqueue({
      timestamp: toIso(),
      level: String(level || 'info').toLowerCase(),
      event: String(event || 'event').trim() || 'event',
      message: message != null ? String(message) : null,
      fields: fields && typeof fields === 'object' ? fields : null,
      correlationId: getCorrelationId(),
    });
  } catch (error) {
    // Logging must never crash the bot. If this ever happens, degrade to local logs and move on.
    const now = Date.now();
    if (now - state.lastEnqueueWarningAtMs > 60_000) {
      state.lastEnqueueWarningAtMs = now;
      try {
        logger.warn('devBotLogs.logEvent failed; continuing without Discord sink.', error);
      } catch {
        // ignore
      }
    }
  }
}

function logError(event, error, fields) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;

  logEvent('error', event, {
    ...fields,
    error: message,
    stack: stack ? String(stack).slice(0, 900) : null,
  });
}

module.exports = {
  buildConfig,
  flush,
  getHealth,
  logError,
  logEvent,
  start,
  stop,
  validateStartup,
  __private: {
    LEVELS,
    enqueue,
    formatDiscordMessage,
    formatEntry,
    registerFailure,
    registerSuccess,
    resolveLogsChannel,
    sanitizeValue,
    shouldPost,
    state,
  },
};
