import winston from 'winston';

/**
 * Logger configuration for Datadog MCP Server
 * CRITICAL: Must log to stderr to avoid interfering with MCP stdio protocol
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Stream({
      stream: process.stderr,
    }),
  ],
});

export default logger;
