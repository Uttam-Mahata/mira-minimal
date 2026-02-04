import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v1 } from '@datadog/datadog-api-client';
import { z } from 'zod';
import logger from '../logger.js';

/**
 * Configure monitor-related tools for the Datadog MCP server
 */
export function configureMonitorsTools(
  server: McpServer,
  monitorsApi: v1.MonitorsApi
): void {
  server.tool(
    'get_monitor',
    'Get details of a specific Datadog monitor by ID',
    {
      monitorId: z.number().describe('Monitor ID to retrieve'),
    },
    async ({ monitorId }) => {
      try {
        logger.info('Getting monitor', { monitorId });

        const response = await monitorsApi.getMonitor({
          monitorId,
        });

        logger.info('Monitor retrieved successfully', { monitorId });

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
        logger.error('Failed to get monitor', {
          monitorId,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error getting monitor: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'list_monitors',
    'List all Datadog monitors with optional filtering',
    {
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter monitors by tags (e.g., ["env:prod", "team:backend"])'),
      name: z
        .string()
        .optional()
        .describe('Filter monitors by name substring'),
    },
    async ({ tags, name }) => {
      try {
        logger.info('Listing monitors', { tags, name });

        const params: any = {};
        if (tags && tags.length > 0) {
          params.tags = tags.join(',');
        }
        if (name) {
          params.name = name;
        }

        const response = await monitorsApi.listMonitors(params);

        logger.info('Monitors listed successfully', {
          count: response.length,
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
        logger.error('Failed to list monitors', { error: errorMessage });

        return {
          content: [
            {
              type: 'text',
              text: `Error listing monitors: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
