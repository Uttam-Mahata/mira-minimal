import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v1 } from '@datadog/datadog-api-client';
import { configureMonitorsTools } from '../../../src/tools/monitors.js';

jest.mock('../../../src/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Monitors Tools', () => {
  let mockMonitorsApi: jest.Mocked<v1.MonitorsApi>;
  let mockServer: jest.Mocked<McpServer>;
  let getMonitorHandler: any;
  let listMonitorsHandler: any;

  beforeEach(() => {
    mockMonitorsApi = {
      getMonitor: jest.fn(),
      listMonitors: jest.fn(),
    } as any;

    mockServer = {
      tool: jest.fn((name, description, schema, handler) => {
        if (name === 'get_monitor') {
          getMonitorHandler = handler;
        } else if (name === 'list_monitors') {
          listMonitorsHandler = handler;
        }
      }),
    } as any;

    configureMonitorsTools(mockServer, mockMonitorsApi);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get_monitor', () => {
    it('should register get_monitor tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'get_monitor',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should get monitor successfully', async () => {
      const mockResponse = {
        id: 12345,
        name: 'High CPU Alert',
        type: 'metric alert',
        query: 'avg(last_5m):avg:system.cpu.user{*} > 90',
      };

      mockMonitorsApi.getMonitor.mockResolvedValue(mockResponse);

      const result = await getMonitorHandler({ monitorId: 12345 });

      expect(mockMonitorsApi.getMonitor).toHaveBeenCalledWith({
        monitorId: 12345,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should handle errors when getting monitor', async () => {
      const errorMessage = 'Monitor not found';
      mockMonitorsApi.getMonitor.mockRejectedValue(new Error(errorMessage));

      const result = await getMonitorHandler({ monitorId: 99999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(errorMessage);
    });
  });

  describe('list_monitors', () => {
    it('should register list_monitors tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'list_monitors',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should list monitors without filters', async () => {
      const mockResponse = [
        { id: 1, name: 'Monitor 1' },
        { id: 2, name: 'Monitor 2' },
      ];

      mockMonitorsApi.listMonitors.mockResolvedValue(mockResponse);

      const result = await listMonitorsHandler({});

      expect(mockMonitorsApi.listMonitors).toHaveBeenCalledWith({});
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should list monitors with tag filter', async () => {
      const mockResponse = [{ id: 1, name: 'Prod Monitor' }];
      mockMonitorsApi.listMonitors.mockResolvedValue(mockResponse);

      const result = await listMonitorsHandler({
        tags: ['env:prod', 'team:backend'],
      });

      expect(mockMonitorsApi.listMonitors).toHaveBeenCalledWith({
        tags: 'env:prod,team:backend',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should list monitors with name filter', async () => {
      const mockResponse = [{ id: 1, name: 'CPU Monitor' }];
      mockMonitorsApi.listMonitors.mockResolvedValue(mockResponse);

      const result = await listMonitorsHandler({ name: 'CPU' });

      expect(mockMonitorsApi.listMonitors).toHaveBeenCalledWith({
        name: 'CPU',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should handle errors when listing monitors', async () => {
      const errorMessage = 'API error';
      mockMonitorsApi.listMonitors.mockRejectedValue(new Error(errorMessage));

      const result = await listMonitorsHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(errorMessage);
    });
  });
});
