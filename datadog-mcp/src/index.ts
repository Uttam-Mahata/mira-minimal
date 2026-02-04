#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  loadDatadogConfig,
  configureDatadogClient,
  createDatadogAPIs,
} from './auth.js';
import { parseDomains, ALL_DOMAINS } from './shared/domains.js';
import { registerTools } from './tools.js';
import logger from './logger.js';

/**
 * Main entry point for Datadog MCP Server
 */
async function main() {
  // Parse command line arguments
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('domains', {
      alias: 'd',
      type: 'array',
      description: 'Domains to enable (metrics, logs, monitors, traces)',
      default: ALL_DOMAINS,
    })
    .option('log-level', {
      type: 'string',
      description: 'Logging level (error, warn, info, debug)',
      default: 'info',
    })
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'v')
    .parse();

  // Set log level
  if (argv.logLevel) {
    logger.level = argv.logLevel as string;
  }

  logger.info('Starting Datadog MCP Server');

  try {
    // Load and configure Datadog client
    const config = loadDatadogConfig();
    configureDatadogClient(config);

    // Create API instances
    const apis = createDatadogAPIs();

    // Parse enabled domains
    const enabledDomains = parseDomains(argv.domains as string[]);
    logger.info('Enabled domains', { domains: enabledDomains.join(', ') });

    // Create MCP server
    const server = new McpServer({
      name: 'datadog-mcp',
      version: '0.1.0',
    });

    // Register tools
    registerTools(server, enabledDomains, apis);

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Datadog MCP Server running on stdio transport');

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down Datadog MCP Server');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start Datadog MCP Server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  logger.error('Unhandled error in main', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
