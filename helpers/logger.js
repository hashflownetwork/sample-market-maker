const { createLogger, format, transports } = require('winston');

const LOG_LEVEL_INFO = 'info';

const logger = createLogger({
  level: LOG_LEVEL_INFO,
  transports: [
    new transports.Console({ format: format.simple(), handleExceptions: true })
  ],
});

module.exports = logger;