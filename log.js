const winston = require('winston');
const { combine, timestamp, label, prettyPrint , simple} = winston.format;

const logger = winston.createLogger({
  level     : 'verbose',
  format: combine(
    simple()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({filename: 'combined.log'})
  ]
});


module.exports = logger;