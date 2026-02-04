import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v2 } from '@datadog/datadog-api-client';
import { z } from 'zod';
import logger from '../logger.js';

/**
 * Configure trace-related tools for the Datadog MCP server
 */
export function configureTracesTools(
  server: McpServer,
  spansApi: v2.SpansApi
): void {
  server.tool(
    'search_spans',
    'Search APM spans/traces with a query and time range',
    {
      query: z
        .string()
        .describe('Span search query (e.g., "service:web operation_name:http.request")'),
      from: z
        .string()
        .describe('Start time in ISO 8601 format or relative time (e.g., "now-1h")'),
      to: z
        .string()
        .describe('End time in ISO 8601 format or relative time (e.g., "now")'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Maximum number of spans to return (default: 100)'),
    },
    async ({ query, from, to, limit }) => {
      try {
        logger.info('Searching spans', { query, from, to, limit });

        const params: v2.SpansApiListSpansRequest = {
          body: {
            data: {
              attributes: {
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
              type: 'search_request' as any,
            },
          },
        };

        const response = await spansApi.listSpans(params);

        logger.info('Span search successful', {
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
        logger.error('Span search failed', { query, error: errorMessage });

        return {
          content: [
            {
              type: 'text',
              text: `Error searching spans: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
