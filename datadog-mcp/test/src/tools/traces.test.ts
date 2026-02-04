import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v2 } from '@datadog/datadog-api-client';
import { configureTracesTools } from '../../../src/tools/traces.js';

jest.mock('../../../src/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Traces Tools', () => {
  let mockSpansApi: jest.Mocked<v2.SpansApi>;
  let mockServer: jest.Mocked<McpServer>;
  let toolHandler: any;

  beforeEach(() => {
    mockSpansApi = {
      listSpans: jest.fn(),
    } as any;

    mockServer = {
      tool: jest.fn((name, description, schema, handler) => {
        toolHandler = handler;
      }),
    } as any;

    configureTracesTools(mockServer, mockSpansApi);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register search_spans tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'search_spans',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should search spans successfully', async () => {
    const mockResponse = {
      data: [
        {
          id: 'span-1',
          attributes: {
            service: 'web',
            operationName: 'http.request',
            duration: 125000000,
            timestamp: '2024-01-01T10:00:00Z',
          },
        },
      ],
    };

    mockSpansApi.listSpans.mockResolvedValue(mockResponse);

    const result = await toolHandler({
      query: 'service:web',
      from: 'now-1h',
      to: 'now',
      limit: 50,
    });

    expect(mockSpansApi.listSpans).toHaveBeenCalledWith({
      body: {
        filter: {
          query: 'service:web',
          from: 'now-1h',
          to: 'now',
        },
        page: {
          limit: 50,
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
    mockSpansApi.listSpans.mockResolvedValue(mockResponse);

    await toolHandler({
      query: 'service:web',
      from: 'now-1h',
      to: 'now',
    });

    expect(mockSpansApi.listSpans).toHaveBeenCalledWith({
      body: {
        filter: {
          query: 'service:web',
          from: 'now-1h',
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
    const errorMessage = 'Invalid span query';
    mockSpansApi.listSpans.mockRejectedValue(new Error(errorMessage));

    const result = await toolHandler({
      query: 'invalid::query',
      from: 'now-1h',
      to: 'now',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(errorMessage);
  });
});
