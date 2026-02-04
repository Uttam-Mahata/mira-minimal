import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v2 } from '@datadog/datadog-api-client';
import { z } from 'zod';
import logger from '../logger.js';

/**
 * Configure logs-related tools for the Datadog MCP server
 */
export function configureLogsTools(
  server: McpServer,
  logsApi: v2.LogsApi
): void {
  server.tool(
    'search_logs',
    'Search Datadog logs with a query and time range',
    {
      query: z
        .string()
        .describe('Log search query (e.g., "status:error service:web")'),
      from: z
        .string()
        .describe('Start time in ISO 8601 format or relative time (e.g., "now-15m")'),
      to: z
        .string()
        .describe('End time in ISO 8601 format or relative time (e.g., "now")'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Maximum number of logs to return (default: 100)'),
    },
    async ({ query, from, to, limit }) => {
      try {
        logger.info('Searching logs', { query, from, to, limit });

        const params: v2.LogsApiListLogsRequest = {
          body: {
            filter: {
              query,
              from,
              to,
            },
            page: {
              limit,
            },
            sort: 'timestamp' as any,
          },
        };

        const response = await logsApi.listLogs(params);

        logger.info('Log search successful', {
          query,
          resultCount: response.data?.length || 0,
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
        logger.error('Log search failed', { query, error: errorMessage });

        return {
          content: [
            {
              type: 'text',
              text: `Error searching logs: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
