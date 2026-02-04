import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v1 } from '@datadog/datadog-api-client';
import { configureMetricsTools } from '../../../src/tools/metrics.js';

// Mock the logger
jest.mock('../../../src/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Metrics Tools', () => {
  let mockMetricsApi: jest.Mocked<v1.MetricsApi>;
  let mockServer: jest.Mocked<McpServer>;
  let toolHandler: any;

  beforeEach(() => {
    // Create mock MetricsApi
    mockMetricsApi = {
      queryMetrics: jest.fn(),
    } as any;

    // Create mock McpServer
    mockServer = {
      tool: jest.fn((name, description, schema, handler) => {
        toolHandler = handler;
      }),
    } as any;

    // Configure tools
    configureMetricsTools(mockServer, mockMetricsApi);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register query_metrics tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'query_metrics',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should query metrics successfully', async () => {
    const mockResponse = {
      series: [
        {
          metric: 'system.cpu.user',
          points: [
            [1704067200000, 25.5],
            [1704067260000, 30.2],
          ],
          scope: '*',
          unit: [
            {
              family: 'percentage',
              name: 'percent',
            },
          ],
        },
      ],
      status: 'ok',
    };

    mockMetricsApi.queryMetrics.mockResolvedValue(mockResponse);

    const result = await toolHandler({
      query: 'avg:system.cpu.user{*}',
      from: 1704067200,
      to: 1704070800,
    });

    expect(mockMetricsApi.queryMetrics).toHaveBeenCalledWith({
      from: 1704067200,
      to: 1704070800,
      query: 'avg:system.cpu.user{*}',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
  });

  it('should handle API errors gracefully', async () => {
    const errorMessage = 'Invalid metric query';
    mockMetricsApi.queryMetrics.mockRejectedValue(new Error(errorMessage));

    const result = await toolHandler({
      query: 'invalid:query',
      from: 1704067200,
      to: 1704070800,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain(errorMessage);
  });

  it('should handle non-Error exceptions', async () => {
    mockMetricsApi.queryMetrics.mockRejectedValue('String error');

    const result = await toolHandler({
      query: 'avg:system.cpu.user{*}',
      from: 1704067200,
      to: 1704070800,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown error');
  });
});
