import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DatadogAPIs } from './auth.js';
import { Domain } from './shared/domains.js';
import { configureMetricsTools } from './tools/metrics.js';
import { configureLogsTools } from './tools/logs.js';
import { configureMonitorsTools } from './tools/monitors.js';
import { configureTracesTools } from './tools/traces.js';
import logger from './logger.js';

/**
 * Register all Datadog MCP tools based on enabled domains
 */
export function registerTools(
  server: McpServer,
  enabledDomains: Domain[],
  apis: DatadogAPIs
): void {
  logger.info('Registering tools for enabled domains', {
    enabledDomains: enabledDomains.join(', '),
  });

  const configureIfDomainEnabled = (
    domain: Domain,
    configureFn: () => void
  ): void => {
    if (enabledDomains.includes(domain)) {
      logger.debug(`Configuring ${domain} tools`);
      configureFn();
    } else {
      logger.debug(`Skipping ${domain} tools (domain not enabled)`);
    }
  };

  configureIfDomainEnabled('metrics', () =>
    configureMetricsTools(server, apis.v1.metrics)
  );

  configureIfDomainEnabled('logs', () =>
    configureLogsTools(server, apis.v2.logs)
  );

  configureIfDomainEnabled('monitors', () =>
    configureMonitorsTools(server, apis.v1.monitors)
  );

  configureIfDomainEnabled('traces', () =>
    configureTracesTools(server, apis.v2.spans)
  );

  logger.info('Tool registration complete');
}
