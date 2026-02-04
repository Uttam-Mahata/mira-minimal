import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v1 } from '@datadog/datadog-api-client';
import { z } from 'zod';
import logger from '../logger.js';

/**
 * Configure metrics-related tools for the Datadog MCP server
 */
export function configureMetricsTools(
  server: McpServer,
  metricsApi: v1.MetricsApi
): void {
  server.tool(
    'query_metrics',
    'Query Datadog metric timeseries data for a given time range',
    {
      query: z
        .string()
        .describe('Datadog metric query (e.g., "avg:system.cpu.user{*}")'),
      from: z
        .number()
        .describe('Start timestamp in Unix seconds (e.g., 1704067200)'),
      to: z
        .number()
        .describe('End timestamp in Unix seconds (e.g., 1704070800)'),
    },
    async ({ query, from, to }) => {
      try {
        logger.info('Querying metrics', { query, from, to });

        const response = await metricsApi.queryMetrics({
          from,
          to,
          query,
        });

        logger.info('Metrics query successful', {
          query,
          seriesCount: response.series?.length || 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Metrics query failed', { query, error: errorMessage });

        return {
          content: [
            {
              type: 'text',
              text: `Error querying metrics: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
