import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v2 } from '@datadog/datadog-api-client';
import { configureLogsTools } from '../../../src/tools/logs.js';

jest.mock('../../../src/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Logs Tools', () => {
  let mockLogsApi: jest.Mocked<v2.LogsApi>;
  let mockServer: jest.Mocked<McpServer>;
  let toolHandler: any;

  beforeEach(() => {
    mockLogsApi = {
      listLogs: jest.fn(),
    } as any;

    mockServer = {
      tool: jest.fn((name, description, schema, handler) => {
        toolHandler = handler;
      }),
    } as any;

    configureLogsTools(mockServer, mockLogsApi);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register search_logs tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'search_logs',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should search logs successfully', async () => {
    const mockResponse = {
      data: [
        {
          id: 'log-1',
          attributes: {
            timestamp: '2024-01-01T10:00:00Z',
            message: 'Error processing request',
            status: 'error',
          },
        },
      ],
    };

    mockLogsApi.listLogs.mockResolvedValue(mockResponse);

    const result = await toolHandler({
      query: 'status:error',
      from: 'now-15m',
      to: 'now',
      limit: 10,
    });

    expect(mockLogsApi.listLogs).toHaveBeenCalledWith({
      body: {
        filter: {
          query: 'status:error',
          from: 'now-15m',
          to: 'now',
        },
        page: {
          limit: 10,
        },
        sort: 'timestamp',
      },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
  });

  it('should use default limit if not provided', async () => {
    const mockResponse = { data: [] };
    mockLogsApi.listLogs.mockResolvedValue(mockResponse);

    await toolHandler({
      query: 'status:error',
      from: 'now-15m',
      to: 'now',
    });

    expect(mockLogsApi.listLogs).toHaveBeenCalledWith({
      body: {
        filter: {
          query: 'status:error',
          from: 'now-15m',
          to: 'now',
        },
        page: {
          limit: 100,
        },
        sort: 'timestamp',
      },
    });
  });

  it('should handle API errors gracefully', async () => {
    const errorMessage = 'Invalid query syntax';
    mockLogsApi.listLogs.mockRejectedValue(new Error(errorMessage));

    const result = await toolHandler({
      query: 'invalid::query',
      from: 'now-15m',
      to: 'now',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(errorMessage);
  });
});
