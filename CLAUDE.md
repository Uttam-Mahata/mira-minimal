# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GeminiOps Bridge** is an autonomous incident response system that bridges Datadog observability with Azure DevOps project management using the Model Context Protocol (MCP) and Google's Agent Development Kit (ADK). The system acts as an intelligent SRE that:

1. Receives alerts from Datadog webhooks
2. Investigates root causes via Datadog MCP server
3. Uses Gemini to reason about alert severity
4. Manages incident workflow in Azure DevOps via ADO MCP server

## Architecture

The system uses **SequentialAgent orchestration** with specialized sub-agents:

- **Event Layer**: FastAPI receives Datadog webhook alerts
- **Orchestration Layer**: SequentialAgent coordinates execution flow
- **Agent Layer**: Three specialized LlmAgents, each with specific responsibilities
  1. **Investigation Agent**: Has Datadog MCP tools, analyzes metrics/logs
  2. **Decision Agent**: Pure reasoning (no tools), evaluates severity
  3. **Ticket Agent**: Has Azure DevOps MCP tools, creates incidents
- **MCP Tooling Layer**: Two MCP servers running via stdio (Datadog MCP and Azure DevOps MCP)
- **State Passing**: Each agent stores output via `output_key`, next agent reads via `{template}` syntax

**Key Pattern**: Sequential execution with state accumulation:
1. Investigation Agent queries Datadog → stores in `investigation_report`
2. Decision Agent reads `{investigation_report}` → stores in `decision`
3. Ticket Agent reads `{decision}` + `{investigation_report}` → creates ticket

This ensures clear separation of concerns, testability, and reproducible workflows.

## Repository Structure

```
/
├── azure-devops-mcp/          # Azure DevOps MCP Server (✅ Ready)
│   ├── src/
│   │   ├── index.ts           # Main MCP server entry point
│   │   ├── tools/             # Tool implementations (work-items, wiki, repos, etc.)
│   │   └── auth.ts            # Authentication handling
│   └── package.json
├── datadog-mcp/               # Datadog MCP Server (⚠️ Needs implementation)
│   └── .gitignore             # Empty placeholder directory
├── typescript-sdk/            # MCP TypeScript SDK v2 (pre-alpha)
│   ├── packages/
│   │   ├── server/            # MCP server implementation
│   │   ├── client/            # MCP client implementation
│   │   └── middleware/        # Express, Hono, Node.js adapters
│   └── examples/              # Runnable MCP examples
├── datadog-api-client-typescript/  # Official Datadog API client
├── adk-docs/                  # Google ADK documentation
└── backend/                   # ❌ MISSING: Python FastAPI app and ADK agents
```

## Build Commands

### Azure DevOps MCP Server
```bash
cd azure-devops-mcp
npm install
npm run build              # TypeScript compilation
npm test                   # Run Jest tests
npm run inspect            # Debug with MCP Inspector
```

### TypeScript SDK (MCP v2)
```bash
cd typescript-sdk
pnpm install               # Use pnpm for workspace management
pnpm build:all             # Build all packages
pnpm test:all              # Run all tests
pnpm lint:all              # ESLint + Prettier
pnpm typecheck:all         # Type checking

# Run specific package tests
pnpm --filter @modelcontextprotocol/server test
pnpm --filter @modelcontextprotocol/client test
```

### Datadog API Client
```bash
cd datadog-api-client-typescript
npm install
npm run build              # If needed (check package.json)
```

### Backend (Python FastAPI)
```bash
cd backend
python -m venv venv                    # Create virtual environment
source venv/bin/activate               # Linux/Mac
# or: venv\Scripts\activate            # Windows

pip install -r requirements.txt       # Install dependencies
uvicorn main:app --reload --port 3000 # Run development server

# Run tests
pytest tests/

# Type checking
mypy .
```

## Key Implementation Notes

### MCP Server Development

**Azure DevOps MCP** (`azure-devops-mcp/src/index.ts`):
- Uses `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Runs over stdio transport (`StdioServerTransport`)
- Authentication via Azure CLI, interactive browser, or environment variables
- Domain-based tool filtering (core, work, work-items, repositories, wiki, pipelines, etc.)
- Command: `npx -y @azure-devops/mcp <org-name> -d core work work-items`

**Datadog MCP** (needs implementation in `datadog-mcp/`):
- Should follow same pattern as Azure DevOps MCP
- Wrap `@datadog/datadog-api-client` API calls as MCP tools
- Key operations needed:
  - `get_metrics`: Query timeseries data around alert timestamps
  - `get_logs`: Fetch stack traces and error logs
  - `query_monitors`: Get alert details
  - `search_traces`: APM trace analysis
- Authentication via `DD_API_KEY` and `DD_APP_KEY` environment variables
- Use Datadog client configuration from `datadog-api-client-typescript`

### MCP TypeScript SDK v2 Architecture

**Core classes** (`typescript-sdk/packages/core/src/shared/protocol.ts`):
- `Protocol` (abstract): Handles JSON-RPC message routing, bidirectional communication
- `Client` extends Protocol: Sends requests to server, handles server→client requests
- `Server` extends Protocol: Handles client requests, can send requests to client
- `McpServer` (high-level): Simplified API for tool/resource/prompt registration

**Transports** (stdio for local MCP servers):
- `StdioServerTransport`: For server-side stdio communication
- Located in `packages/server/src/server/stdio.ts`

**Tool Registration Pattern**:
```typescript
// High-level McpServer API
mcpServer.tool('tool-name',
  { param: z.string() },  // Zod schema for parameters
  async ({ param }, extra) => {
    // extra contains: sessionId, authInfo, sendNotification, etc.
    return {
      content: [{ type: 'text', text: 'result' }]
    };
  }
);
```

### Backend Implementation (Python + ADK)

The `backend/` directory implements the GeminiOps Bridge using Google ADK:

```
backend/
├── agent.py                    # SequentialAgent definition (MUST be synchronous)
├── main.py                     # FastAPI webhook endpoint
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variables template
└── tests/
    └── test_agent.py           # Agent testing
```

#### agent.py - Core Agent Definition

**CRITICAL**: Agent must be defined synchronously for deployment compatibility.

```python
# backend/agent.py
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters
import os

# Environment variables (loaded by FastAPI from .env)
DD_API_KEY = os.getenv("DD_API_KEY")
DD_APP_KEY = os.getenv("DD_APP_KEY")
ADO_ORG_NAME = os.getenv("ADO_ORG_NAME")
ADO_PAT = os.getenv("ADO_PAT")

# --- Sub-Agent 1: Datadog Investigation Agent ---
investigation_agent = LlmAgent(
    name="datadog_investigator",
    model="gemini-2.0-flash",
    instruction="""You are a Datadog investigation specialist.

When given an alert, use the Datadog MCP tools to:
1. Query metrics around the alert timestamp (±15 minutes)
2. Fetch relevant logs with error stack traces
3. Check APM traces if available

Provide a concise investigation summary including:
- Metric trends (spike pattern, duration, affected hosts)
- Key error messages from logs
- Potential root cause hypothesis
""",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="node",
                    args=["../datadog-mcp/dist/index.js"],
                    env={
                        "DD_API_KEY": DD_API_KEY,
                        "DD_APP_KEY": DD_APP_KEY,
                        "DD_SITE": "datadoghq.com"
                    }
                ),
                timeout=30
            ),
            tool_filter=['get_metrics', 'get_logs', 'search_traces']
        )
    ],
    output_key="investigation_report"  # Stores output in session state
)

# --- Sub-Agent 2: Decision Making Agent ---
decision_agent = LlmAgent(
    name="decision_maker",
    model="gemini-2.0-flash",
    instruction="""You are an SRE decision-making specialist.

Based on the investigation report, determine alert severity:

**Investigation Report:**
{investigation_report}

**Decision Criteria:**
- IGNORE: Transient spike (< 5 min), already recovered, known noise
- MONITOR: Concerning but stable, no immediate action needed
- TICKET: Sustained issue (> 10 min), error rate impact, requires investigation

Output format:
DECISION: [IGNORE|MONITOR|TICKET]
REASON: [2-3 sentence justification]
PRIORITY: [P0|P1|P2|P3] (only if TICKET)
""",
    output_key="decision"  # Stores decision in session state
)

# --- Sub-Agent 3: Azure DevOps Ticket Agent ---
ticket_agent = LlmAgent(
    name="ticket_creator",
    model="gemini-2.0-flash",
    instruction="""You are an Azure DevOps ticket creation specialist.

**Decision:**
{decision}

**Investigation Report:**
{investigation_report}

If decision is TICKET, create an Azure DevOps work item with:
- Title: Concise alert description
- Description: Investigation summary + reproduction steps
- Priority: From decision
- Tags: incident, datadog, automated

If decision is IGNORE or MONITOR, output: "No ticket created - {reason}"
""",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=[
                        "-y",
                        "@azure-devops/mcp",
                        ADO_ORG_NAME,
                        "-d", "core", "work-items"
                    ],
                    env={
                        "ADO_PAT": ADO_PAT
                    }
                ),
                timeout=30
            ),
            tool_filter=['create_work_item', 'update_work_item']
        )
    ],
    output_key="ticket_result"
)

# --- Root Agent: Sequential Orchestration ---
root_agent = SequentialAgent(
    name="geminiops_bridge",
    sub_agents=[
        investigation_agent,
        decision_agent,
        ticket_agent
    ],
    description="Autonomous incident response pipeline: Investigate → Decide → Act"
)
```

#### main.py - FastAPI Integration

```python
# backend/main.py
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from google.adk.runners import InMemoryRunner
from google.genai import types
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Import the agent
from agent import root_agent

# Initialize FastAPI
app = FastAPI(title="GeminiOps Bridge")

# Initialize ADK Runner
runner = InMemoryRunner(
    agent=root_agent,
    app_name="geminiops_bridge"
)

# Pydantic model for Datadog webhook
class DatadogAlert(BaseModel):
    id: str
    alert_type: str
    title: str
    date: int  # Unix timestamp
    body: str
    tags: list[str]

@app.post("/api/webhook/datadog")
async def handle_datadog_webhook(
    alert: DatadogAlert,
    background_tasks: BackgroundTasks
):
    """Receives Datadog webhook and triggers agent pipeline"""
    background_tasks.add_task(process_alert, alert)
    return {"status": "accepted", "alert_id": alert.id}

async def process_alert(alert: DatadogAlert):
    """Background task to process alert through agent pipeline"""
    user_id = "datadog_webhook"
    session_id = f"alert_{alert.id}"

    # Create session
    runner.session_service.create_session(
        app_name="geminiops_bridge",
        user_id=user_id,
        session_id=session_id
    )

    # Format alert as user message
    alert_message = f"""
Datadog Alert Received:
- ID: {alert.id}
- Type: {alert.alert_type}
- Title: {alert.title}
- Timestamp: {alert.date}
- Description: {alert.body}
- Tags: {', '.join(alert.tags)}

Please investigate this alert and take appropriate action.
"""

    content = types.Content(
        role='user',
        parts=[types.Part(text=alert_message)]
    )

    # Run agent pipeline
    print(f"Processing alert {alert.id}...")
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=content
    ):
        if event.is_final_response():
            print(f"Agent {event.author}: {event.content.parts[0].text}")

    # Retrieve final state to see all agent outputs
    session = runner.session_service.get_session(
        app_name="geminiops_bridge",
        user_id=user_id,
        session_id=session_id
    )

    print(f"Final state for alert {alert.id}:")
    print(f"  Investigation: {session.state.get('investigation_report', 'N/A')[:100]}...")
    print(f"  Decision: {session.state.get('decision', 'N/A')}")
    print(f"  Ticket: {session.state.get('ticket_result', 'N/A')}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "agent": root_agent.name}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

#### requirements.txt

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
google-adk>=0.5.0
mcp>=1.0.0
python-dotenv>=1.0.0
google-cloud-aiplatform>=1.40.0
pydantic>=2.10.0
```

**Key Implementation Notes**:

1. **Synchronous Agent Definition**: The `root_agent` is defined at module level (not in async function) for deployment compatibility with Cloud Run, GKE, and Agent Engine.

2. **State Passing Mechanism**:
   - Each agent has `output_key` parameter
   - Subsequent agents reference previous outputs using `{state_variable}` in instructions
   - Session state accumulates all outputs for debugging

3. **MCP Server Lifecycle**:
   - McpToolset spawns subprocess for each MCP server
   - Uses `StdioServerParameters` for stdio communication
   - Environment variables passed via `env` parameter
   - Automatic cleanup when agent terminates

4. **Tool Filtering**: Use `tool_filter` to limit which MCP tools are exposed to each agent (security and clarity).

**Running the Backend**:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Test agent in isolation
adk web  # Opens web UI at localhost:8080

# Run production server
uvicorn main:app --host 0.0.0.0 --port 3000
```

**Environment Variables Required** (create `backend/.env`):
```bash
# FastAPI Server
PORT=3000

# Google Gemini / ADK
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
GOOGLE_PROJECT_ID="your-project-id"
GOOGLE_LOCATION="us-central1"

# Datadog MCP (passed to Datadog MCP server subprocess via env parameter)
DD_API_KEY="your_dd_api_key"
DD_APP_KEY="your_dd_app_key"
DD_SITE="datadoghq.com"

# Azure DevOps MCP (passed to Azure DevOps MCP server subprocess via env parameter)
ADO_ORG_NAME="your-organization"
ADO_PROJECT="YourProject"
ADO_PAT="your_ado_pat"
```

**Note**: The Python backend loads these with `python-dotenv`. McpToolset automatically passes them to MCP server child processes via the `env` parameter in `StdioServerParameters`.

## Testing MCP Servers

Use the MCP Inspector to test servers interactively:
```bash
cd azure-devops-mcp
npm run inspect
# Opens browser at http://127.0.0.1:6274
```

Or use the MCP conformance test suite:
```bash
cd typescript-sdk
pnpm test:conformance:server
```

## Important Patterns

### Stdio Transport Communication
MCP servers run as child processes and communicate via stdin/stdout. The Python backend spawns TypeScript MCP servers using `subprocess.Popen` and uses the MCP Python SDK client to send/receive JSON-RPC messages over stdio. This is language-agnostic - the protocol is pure JSON over stdin/stdout.

### Bidirectional Protocol
Both client and server can send requests. Servers can request sampling (LLM calls) or elicitation (user input) from clients.

### Capability Negotiation
During initialization, both sides declare capabilities. The SDK enforces capability checks before allowing operations.

### Zod Schema Validation
All MCP request/response types use Zod v4 schemas. The SDK is compatible with both Zod v3.25+ and v4.

## Development Workflow

1. **Build MCP servers first**: Start with Azure DevOps MCP (already done) and implement Datadog MCP
2. **Test MCP servers independently**: Use MCP Inspector before integrating with backend
3. **Implement backend**: Create Python FastAPI app, webhook handler, and ADK agent orchestration
4. **Integration testing**: Send test webhook payloads to verify end-to-end flow

**Recommended Development Order**:
- Phase 1: Complete Datadog MCP server (TypeScript)
- Phase 2: Create basic FastAPI app with webhook endpoint
- Phase 3: Implement MCP client wrappers (Python subprocess communication)
- Phase 4: Build Google ADK agents (Webhook → Datadog → Azure)
- Phase 5: Implement sequential orchestration pipeline
- Phase 6: End-to-end testing with real Datadog webhooks

## Current Status

| Component | Status |
|-----------|--------|
| Azure DevOps MCP Server | ✅ Ready (built and tested) |
| Datadog MCP Server | ❌ Needs implementation |
| MCP TypeScript SDK | 🔧 v2 pre-alpha (usable but evolving) |
| Datadog API Client | ✅ Available as dependency |
| Backend + ADK Integration | ❌ Not started |

## Next Priority Tasks

1. Implement Datadog MCP server in `datadog-mcp/` (TypeScript)
2. Create `backend/` directory with Python FastAPI app structure
3. Implement MCP client wrappers for spawning and communicating with MCP servers
4. Implement Google ADK agents in Python (webhook, datadog, azure)
5. Build sequential orchestration pipeline
6. Configure Datadog webhook to send alerts to backend endpoint

## Language Architecture Summary

**TypeScript Components** (MCP Servers - run as child processes):
- `azure-devops-mcp/` - Azure DevOps MCP Server (stdio)
- `datadog-mcp/` - Datadog MCP Server (stdio)
- Both expose tools via MCP protocol over stdin/stdout

**Python Components** (Backend - orchestration and agents):
- `backend/` - FastAPI webhook receiver
- Google ADK agents for sequential workflow
- MCP Python SDK clients to communicate with TypeScript MCP servers
- Gemini integration for reasoning

This architecture leverages the best of both ecosystems:
- TypeScript for MCP servers (excellent MCP SDK, mature API clients)
- Python for AI agents (superior ADK support, ML/AI ecosystem)
