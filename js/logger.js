const log4js = require('log4js');
const path = require('path');
const fs = require('fs');
const { format } = require('date-fns-tz'); // Import date-fns-tz library

// Get the directory of the script
const scriptDirectory = path.dirname(require.main.filename);

// Set the desired timezone to Eastern Standard Time (EST)
const EST_TIMEZONE = 'America/New_York';

// Configure logging with a custom layout
log4js.configure({
  appenders: {
    file: {
      type: 'file',
      filename: path.join(scriptDirectory, '../logs', 'bot.log'),
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
  },
  categories: {
    default: {
      appenders: ['file', 'console'],
      level: 'debug',
    },
  },
});

// Create and export a logger
const logger = log4js.getLogger('default');

// Function to handle exit gracefully
const handleExit = () => {
  logger.debug('Attempting to archive log file');
  const logPath = path.join(scriptDirectory, '../logs', 'bot.log');
  const archivePath = path.join(
    scriptDirectory,
    '../logs/archive',
    `bot_${Date.now()}.log`
  );

  // Rename the log file to archive it
  fs.renameSync(logPath, archivePath);

  // Delete old log files (keep the 5 most recent)
  const archiveFiles = fs
    .readdirSync(path.join(scriptDirectory, '../logs/archive'))
    .filter((file) => file.startsWith('bot_'))
    .sort(
      (a, b) =>
        b.split('_')[1].split('.')[0] - a.split('_')[1].split('.')[0]
    );

  // Delete all but the 5 most recent log files
  for (let i = 5; i < archiveFiles.length; i++) {
    fs.unlinkSync(
      path.join(scriptDirectory, '../logs/archive', archiveFiles[i])
    );
  }
};

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', () => {
  handleExit();
  process.exit();
});

// Handle process exit event
process.on('exit', () => {
  handleExit();
});

module.exports = { logger, scriptDirectory };
