# Datadog MCP Server

A Model Context Protocol (MCP) server for investigating Datadog alerts via metrics, logs, monitors, and traces.

## Features

- **Metrics**: Query timeseries data for performance analysis
- **Logs**: Search and analyze application logs
- **Monitors**: Retrieve and list Datadog monitors/alerts
- **Traces**: Search APM spans for distributed tracing

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

```bash
export DD_API_KEY="your-datadog-api-key"
export DD_APP_KEY="your-datadog-app-key"
export DD_SITE="datadoghq.com"  # Optional, defaults to datadoghq.com
```

## Usage

### As MCP Server (via stdio)

```bash
node dist/index.js
```

### With Domain Filtering

Enable specific tool domains:

```bash
node dist/index.js --domains metrics logs
```

Available domains:
- `metrics` - Metric timeseries queries
- `logs` - Log search and aggregation
- `monitors` - Monitor/alert management
- `traces` - APM span/trace analysis

### With MCP Inspector

```bash
npm run inspect
```

Opens the MCP Inspector UI at http://127.0.0.1:6274 for interactive testing.

## Available Tools

### query_metrics

Query Datadog metric timeseries data.

**Parameters:**
- `query` (string): Datadog metric query (e.g., "avg:system.cpu.user{*}")
- `from` (number): Start timestamp in Unix seconds
- `to` (number): End timestamp in Unix seconds

**Example:**
```json
{
  "query": "avg:system.cpu.user{*}",
  "from": 1704067200,
  "to": 1704070800
}
```

### search_logs

Search Datadog logs with a query and time range.

**Parameters:**
- `query` (string): Log search query (e.g., "status:error service:web")
- `from` (string): Start time in ISO 8601 or relative format (e.g., "now-15m")
- `to` (string): End time in ISO 8601 or relative format (e.g., "now")
- `limit` (number, optional): Maximum results (default: 100)

**Example:**
```json
{
  "query": "status:error",
  "from": "now-15m",
  "to": "now",
  "limit": 50
}
```

### get_monitor

Get details of a specific Datadog monitor.

**Parameters:**
- `monitorId` (number): Monitor ID to retrieve

**Example:**
```json
{
  "monitorId": 12345
}
```

### list_monitors

List all Datadog monitors with optional filtering.

**Parameters:**
- `tags` (array of strings, optional): Filter by tags (e.g., ["env:prod", "team:backend"])
- `name` (string, optional): Filter by name substring

**Example:**
```json
{
  "tags": ["env:prod"],
  "name": "CPU"
}
```

### search_spans

Search APM spans/traces.

**Parameters:**
- `query` (string): Span search query (e.g., "service:web operation_name:http.request")
- `from` (string): Start time in ISO 8601 or relative format (e.g., "now-1h")
- `to` (string): End time in ISO 8601 or relative format (e.g., "now")
- `limit` (number, optional): Maximum results (default: 100)

**Example:**
```json
{
  "query": "service:web",
  "from": "now-1h",
  "to": "now",
  "limit": 100
}
```

## Development

### Run Tests

```bash
npm test
```

### Test Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run watch
```

### Linting

```bash
npm run lint
```

## Integration with Python Backend

This MCP server is designed to work with the GeminiOps Bridge Python backend:

```python
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

datadog_tools = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="node",
            args=["../datadog-mcp/dist/index.js"],
            env={
                "DD_API_KEY": os.getenv("DD_API_KEY"),
                "DD_APP_KEY": os.getenv("DD_APP_KEY"),
                "DD_SITE": "datadoghq.com"
            }
        ),
        timeout=30
    ),
    tool_filter=['query_metrics', 'search_logs', 'search_spans']
)
```

## License

MIT
