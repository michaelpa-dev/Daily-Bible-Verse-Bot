const log4js = require('log4js');
const path = require('path');
const fs = require('fs');
const { logLevel } = require('./config.js');

const scriptDirectory = __dirname;
const logsDirectory = path.join(scriptDirectory, '../logs');
const archiveDirectory = path.join(logsDirectory, 'archive');
const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test') ||
  Boolean(process.env.LOG_TO_CONSOLE_ONLY);

fs.mkdirSync(logsDirectory, { recursive: true });
fs.mkdirSync(archiveDirectory, { recursive: true });

const appenders = isTestEnvironment
  ? {
      console: {
        type: 'console',
      },
    }
  : {
      file: {
        type: 'file',
        filename: path.join(logsDirectory, 'bot.log'),
        maxLogSize: 10485760,
        backups: 3,
        compress: true,
        layout: {
          type: 'pattern',
          pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSSO}] [%p] %c - %m',
        },
      },
      console: {
        type: 'console',
      },
    };

const categoryConfig = isTestEnvironment
  ? {
      appenders: ['console'],
      level: 'error',
    }
  : {
      appenders: ['file', 'console'],
      level: logLevel,
    };

// Configure logging with a custom layout
log4js.configure({
  appenders,
  categories: {
    default: categoryConfig,
  },
});

// Create and export a logger
const logger = log4js.getLogger('default');

let hasArchivedLogs = false;

const handleExit = () => {
  if (hasArchivedLogs) {
    return;
  }

  hasArchivedLogs = true;
  logger.debug('Attempting to archive log file');
  const logPath = path.join(logsDirectory, 'bot.log');

  try {
    if (fs.existsSync(logPath)) {
      const archivePath = path.join(archiveDirectory, `bot_${Date.now()}.log`);
      fs.renameSync(logPath, archivePath);
    }

    const archiveFiles = fs
      .readdirSync(archiveDirectory)
      .filter((file) => file.startsWith('bot_'))
      .sort(
        (a, b) =>
          Number(b.split('_')[1].split('.')[0]) - Number(a.split('_')[1].split('.')[0])
      );

    for (let i = 5; i < archiveFiles.length; i += 1) {
      fs.unlinkSync(path.join(archiveDirectory, archiveFiles[i]));
    }
  } catch (error) {
    logger.warn(`Failed to archive log file on exit: ${error}`);
  }
};

process.on('exit', () => {
  if (!isTestEnvironment) {
    handleExit();
  }
});

module.exports = { logger, scriptDirectory };
