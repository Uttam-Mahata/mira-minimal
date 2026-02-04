# Gemini Context: GeminiOps Bridge

**GeminiOps Bridge** is an autonomous incident response system designed to bridge Datadog observability with Azure DevOps project management using the Model Context Protocol (MCP) and Google's Agent Development Kit (ADK).

## 🔭 Project Vision & Architecture

The system is intended to function as an intelligent SRE that:
1.  **Receives Alerts:** Listens for Datadog webhooks (e.g., error spikes, CPU warnings).
2.  **Investigates:** Uses **Datadog MCP** to query metrics and logs around the event time.
3.  **Reasons:** Uses **Gemini** to determine if the alert is a transient spike or a real incident.
4.  **Acts:** Uses **Azure DevOps MCP** to create and assign Tickets/Bugs if action is required.

### Architecture: SequentialAgent with McpToolset

The system uses **three specialized LlmAgents** orchestrated by a **SequentialAgent**:

```
┌─────────────────────────────────────────────────────────────────┐
│                  SequentialAgent (root_agent)                   │
│                                                                 │
│  ┌───────────────┐      ┌──────────────┐      ┌─────────────┐  │
│  │ Investigation │  →   │   Decision   │  →   │   Ticket    │  │
│  │     Agent     │      │    Agent     │      │    Agent    │  │
│  │               │      │              │      │             │  │
│  │ [Datadog MCP] │      │  [No tools]  │      │ [ADO MCP]   │  │
│  │               │      │              │      │             │  │
│  │ output_key:   │      │ output_key:  │      │ output_key: │  │
│  │ investigation_│      │ decision     │      │ ticket_     │  │
│  │ report        │      │              │      │ result      │  │
│  └───────────────┘      └──────────────┘      └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**State Flow Example**:
1. **Investigation Agent** → Queries Datadog metrics/logs → Stores in `state['investigation_report']`
2. **Decision Agent** → Reads `{investigation_report}` via template → Analyzes severity → Stores in `state['decision']`
3. **Ticket Agent** → Reads `{decision}` and `{investigation_report}` → Creates Azure DevOps ticket → Stores in `state['ticket_result']`

**Key Advantages**:
- **Modularity**: Each agent has single responsibility
- **Testability**: Agents can be tested independently
- **Debuggability**: State accumulation provides full audit trail
- **Reproducibility**: Deterministic sequential execution

## 📂 Current Repository Structure

| Directory | Status | Description |
| :--- | :--- | :--- |
| `azure-devops-mcp/` | ✅ Ready | **Azure DevOps MCP Server** (TypeScript): Provides tools for Boards, Repos, and Wikis. Runs via stdio. |
| `datadog-mcp/` | ⚠️ **Needs Implementation** | **Datadog MCP Server** (TypeScript): Wrapper around Datadog API. Must implement tools for metrics, logs, traces. |
| `typescript-sdk/` | 🔧 Core | **MCP TypeScript SDK**: The underlying protocol implementation (v2 pre-alpha). |
| `datadog-api-client-typescript/` | 📦 Dep | Official Datadog API client, used by `datadog-mcp`. |
| `adk-docs/` | 📄 Docs | Documentation for Google's Agent Development Kit (ADK). |
| `backend/` | ❌ **Missing** | **Python FastAPI Backend**: Webhook receiver, ADK agents, and orchestration pipeline. Spawns MCP servers as subprocesses. |

## 🚀 Getting Started & Next Steps

### 1. Build the MCP Servers
The Python backend will spawn these servers as child processes via stdio.

```bash
# Build Azure DevOps MCP (✅ Ready)
cd azure-devops-mcp
npm install && npm run build

# Build Datadog MCP (⚠️ Needs Implementation)
cd ../datadog-mcp
npm install && npm run build
```

### 2. Implement the Datadog MCP Server (Priority Task #1)
Create TypeScript MCP server in `datadog-mcp/` following the same pattern as `azure-devops-mcp/`:
*   **Setup**: Initialize with `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
*   **Transport**: Use `StdioServerTransport` for stdin/stdout communication
*   **Tools to Implement**:
    *   `get_metrics` - Query timeseries data around alert timestamps
    *   `get_logs` - Fetch stack traces and error logs
    *   `query_monitors` - Get alert details
    *   `search_traces` - APM trace analysis
*   **Authentication**: Use `DD_API_KEY` and `DD_APP_KEY` from environment
*   **Reference**: Use `datadog-api-client-typescript` for API calls

### 3. Implement the Python Backend (Priority Task #2)
Create `backend/` directory with Python FastAPI application:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install fastapi uvicorn google-adk mcp python-dotenv google-cloud-aiplatform

# Run development server
uvicorn main:app --reload --port 3000
```

**Backend Structure**:
```
backend/
├── main.py                    # FastAPI app + webhook endpoint
├── agents/                    # Google ADK agent definitions
│   ├── webhook_agent.py       # Parses Datadog webhooks
│   ├── datadog_agent.py       # Calls Datadog MCP via stdio
│   └── azure_agent.py         # Calls Azure DevOps MCP via stdio
├── orchestration/             # Sequential agent pipeline
│   └── pipeline.py
├── mcp_clients/               # MCP subprocess wrappers
│   ├── datadog_client.py      # Spawns Datadog MCP server
│   └── azure_client.py        # Spawns Azure DevOps MCP server
├── models/
│   └── webhook_payload.py     # Pydantic models
└── requirements.txt
```

**Key Implementation Points**:
*   **FastAPI** receives webhook POSTs at `/api/webhook/datadog`
*   **MCP Clients** spawn TypeScript MCP servers using `subprocess.Popen`
*   **ADK Agents** use Google ADK for sequential workflow orchestration
*   **Gemini Integration** via Vertex AI Python SDK for reasoning
*   Communication between Python and MCP servers happens via **stdio** using MCP Python SDK

## 🛠 Development Environment

### Language Stack
*   **TypeScript/Node.js** (v18+): For MCP servers (`azure-devops-mcp`, `datadog-mcp`)
    *   Package Management: npm for MCP servers, pnpm for typescript-sdk
*   **Python** (3.10+): For backend FastAPI app and Google ADK agents
    *   Package Management: pip + virtual environments
    *   Key libraries: `fastapi`, `google-adk`, `mcp`, `uvicorn`

### Authentication & Credentials
*   **Datadog**: API Key & App Key (env vars `DD_API_KEY`, `DD_APP_KEY`)
*   **Azure DevOps**: Personal Access Token (`ADO_PAT`)
*   **Google Cloud**: Service Account JSON for Vertex AI/Gemini (`GOOGLE_APPLICATION_CREDENTIALS`)

### Why Hybrid Architecture?
*   **TypeScript for MCP Servers**: Excellent MCP SDK support, mature API clients for Datadog/Azure
*   **Python for Backend/Agents**: Superior Google ADK support, better AI/ML ecosystem, natural for agent workflows
*   **Communication**: Language-agnostic stdio protocol (JSON-RPC over stdin/stdout)

## 📋 Development Checklist

- [ ] **Phase 1**: Implement Datadog MCP server (TypeScript)
- [ ] **Phase 2**: Test both MCP servers with MCP Inspector
- [ ] **Phase 3**: Create Python FastAPI backend structure
- [ ] **Phase 4**: Implement MCP client wrappers (subprocess + stdio)
- [ ] **Phase 5**: Build Google ADK agents (webhook → datadog → azure)
- [ ] **Phase 6**: Implement sequential orchestration pipeline
- [ ] **Phase 7**: End-to-end testing with Datadog webhook payloads

## 🔧 Complete Code Examples

### Agent Definition (agent.py)

```python
# backend/agent.py
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters
import os

# Load environment variables
DD_API_KEY = os.getenv("DD_API_KEY")
DD_APP_KEY = os.getenv("DD_APP_KEY")
ADO_ORG_NAME = os.getenv("ADO_ORG_NAME")
ADO_PAT = os.getenv("ADO_PAT")

# Agent 1: Datadog Investigation
investigation_agent = LlmAgent(
    name="datadog_investigator",
    model="gemini-2.0-flash",
    instruction="""Investigate the Datadog alert using available tools.
Query metrics and logs around the alert timestamp. Provide concise summary.""",
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
                )
            ),
            tool_filter=['get_metrics', 'get_logs', 'search_traces']
        )
    ],
    output_key="investigation_report"
)

# Agent 2: Decision Making (No tools - pure reasoning)
decision_agent = LlmAgent(
    name="decision_maker",
    model="gemini-2.0-flash",
    instruction="""Based on this investigation: {investigation_report}

Decide if this requires action:
- IGNORE: Transient spike, already recovered
- TICKET: Sustained issue requiring investigation

Output: DECISION: [IGNORE|TICKET] and REASON: [justification]""",
    output_key="decision"
)

# Agent 3: Azure DevOps Ticket Creation
ticket_agent = LlmAgent(
    name="ticket_creator",
    model="gemini-2.0-flash",
    instruction="""Decision: {decision}
Investigation: {investigation_report}

If decision is TICKET, create Azure DevOps work item with investigation details.
Otherwise, output "No action taken - {reason}".""",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=[
                        "-y", "@azure-devops/mcp",
                        ADO_ORG_NAME,
                        "-d", "core", "work-items"
                    ],
                    env={"ADO_PAT": ADO_PAT}
                )
            ),
            tool_filter=['create_work_item']
        )
    ],
    output_key="ticket_result"
)

# Root Agent: Sequential Orchestration
root_agent = SequentialAgent(
    name="geminiops_bridge",
    sub_agents=[investigation_agent, decision_agent, ticket_agent],
    description="Incident response: Investigate → Decide → Act"
)
```

### FastAPI Integration (main.py)

```python
# backend/main.py
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from google.adk.runners import InMemoryRunner
from google.genai import types
from agent import root_agent
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="GeminiOps Bridge")

# Initialize ADK Runner once at startup
runner = InMemoryRunner(agent=root_agent, app_name="geminiops_bridge")

class DatadogWebhook(BaseModel):
    id: str
    title: str
    body: str
    date: int

@app.post("/api/webhook/datadog")
async def webhook(alert: DatadogWebhook, bg: BackgroundTasks):
    bg.add_task(process_alert, alert)
    return {"status": "accepted"}

async def process_alert(alert: DatadogWebhook):
    session_id = f"alert_{alert.id}"
    user_id = "datadog"

    # Create session
    runner.session_service.create_session(
        app_name="geminiops_bridge",
        user_id=user_id,
        session_id=session_id
    )

    # Run agent
    message = types.Content(
        role='user',
        parts=[types.Part(text=f"Alert: {alert.title}\n{alert.body}")]
    )

    async for event in runner.run_async(user_id, session_id, message):
        if event.is_final_response():
            print(f"{event.author}: {event.content.parts[0].text[:100]}")

    # Access final state
    session = runner.session_service.get_session(
        app_name="geminiops_bridge",
        user_id=user_id,
        session_id=session_id
    )
    print(f"State: {session.state}")

@app.get("/health")
def health():
    return {"status": "healthy"}
```

### Testing the Agent

```python
# Test agent interactively with adk web
# backend/test_agent.py
import asyncio
from google.adk.runners import InMemoryRunner
from google.genai import types
from agent import root_agent

async def test_pipeline():
    runner = InMemoryRunner(agent=root_agent, app_name="test")

    # Create session
    runner.session_service.create_session(
        app_name="test",
        user_id="test_user",
        session_id="test_1"
    )

    # Test alert
    message = types.Content(
        role='user',
        parts=[types.Part(text="Alert: High CPU on prod-server-01")]
    )

    # Run agent
    async for event in runner.run_async("test_user", "test_1", message):
        if event.is_final_response():
            print(f"{event.author}: {event.content.parts[0].text}")

    # Check state
    session = runner.session_service.get_session(
        app_name="test",
        user_id="test_user",
        session_id="test_1"
    )

    assert "investigation_report" in session.state
    assert "decision" in session.state
    assert "ticket_result" in session.state
    print("✓ All state keys present")

if __name__ == "__main__":
    asyncio.run(test_pipeline())
```

**Running the Application**:

```bash
# Development with adk web
cd backend
adk web  # Interactive UI at localhost:8080

# Production server
uvicorn main:app --host 0.0.0.0 --port 3000

# Test endpoint
curl -X POST http://localhost:3000/api/webhook/datadog \
  -H "Content-Type: application/json" \
  -d '{"id":"123","title":"CPU Spike","body":"High CPU","date":1234567890}'
```

## 🌐 Detailed Communication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Datadog Monitor                            │
│                      (Alert Triggered: CPU > 80%)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP POST /api/webhook/datadog
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (main.py)                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Webhook Endpoint: POST /api/webhook/datadog                  │   │
│  │ - Validates Datadog payload (Pydantic model)                 │   │
│  │ - Creates background task                                    │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           │                                          │
│                           ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ InMemoryRunner (ADK)                                         │   │
│  │ - Creates session (user_id: "datadog", session_id: alert_id)│   │
│  │ - Formats alert as user message                              │   │
│  │ - Calls runner.run_async()                                   │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│              SequentialAgent (root_agent)                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Step 1: Investigation Agent                                 │   │
│  │ ┌────────────────────────────────────────────────────────┐  │   │
│  │ │ LlmAgent: "datadog_investigator"                       │  │   │
│  │ │ Model: gemini-2.0-flash                                │  │   │
│  │ │ Tools: McpToolset (Datadog MCP)                        │  │   │
│  │ └─────────────────┬──────────────────────────────────────┘  │   │
│  │                   │ Spawns subprocess                        │   │
│  │                   ▼                                          │   │
│  │        ┌─────────────────────────────┐                      │   │
│  │        │ Datadog MCP Server (Node.js)│ ◄─────────────────┐  │   │
│  │        │ - get_metrics()             │                   │  │   │
│  │        │ - get_logs()                │ stdio (JSON-RPC)  │  │   │
│  │        │ - search_traces()           │                   │  │   │
│  │        │ Env: DD_API_KEY, DD_APP_KEY │ ──────────────────┘  │   │
│  │        └─────────────────────────────┘                      │   │
│  │                   │ Returns investigation data               │   │
│  │                   ▼                                          │   │
│  │  state['investigation_report'] = "CPU spike 78% → 95%       │   │
│  │                   for 12 minutes on prod-web-01.            │   │
│  │                   Error logs: OutOfMemoryException..."      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                        │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Step 2: Decision Agent                                      │   │
│  │ ┌────────────────────────────────────────────────────────┐  │   │
│  │ │ LlmAgent: "decision_maker"                             │  │   │
│  │ │ Model: gemini-2.0-flash                                │  │   │
│  │ │ Tools: None (pure reasoning)                           │  │   │
│  │ │ Instruction uses template: {investigation_report}      │  │   │
│  │ └────────────────────────────────────────────────────────┘  │   │
│  │                   │ Reads state['investigation_report']     │   │
│  │                   ▼                                          │   │
│  │  state['decision'] = "DECISION: TICKET                      │   │
│  │                       REASON: Sustained OOM for 12min       │   │
│  │                       PRIORITY: P1"                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                        │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Step 3: Ticket Agent                                        │   │
│  │ ┌────────────────────────────────────────────────────────┐  │   │
│  │ │ LlmAgent: "ticket_creator"                             │  │   │
│  │ │ Model: gemini-2.0-flash                                │  │   │
│  │ │ Tools: McpToolset (Azure DevOps MCP)                   │  │   │
│  │ │ Instruction uses: {decision}, {investigation_report}   │  │   │
│  │ └─────────────────┬──────────────────────────────────────┘  │   │
│  │                   │ Spawns subprocess                        │   │
│  │                   ▼                                          │   │
│  │        ┌─────────────────────────────┐                      │   │
│  │        │ Azure DevOps MCP (npx)      │ ◄─────────────────┐  │   │
│  │        │ - create_work_item()        │                   │  │   │
│  │        │ - update_work_item()        │ stdio (JSON-RPC)  │  │   │
│  │        │ Env: ADO_PAT                │ ──────────────────┘  │   │
│  │        └─────────────────────────────┘                      │   │
│  │                   │ Creates work item #4521                  │   │
│  │                   ▼                                          │   │
│  │  state['ticket_result'] = "Created work item #4521:         │   │
│  │                             'P1: OOM on prod-web-01'         │   │
│  │                             Assigned to: on-call-team"       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                        │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Final State (accessible via session.state)                  │   │
│  │ {                                                            │   │
│  │   "investigation_report": "CPU spike...",                   │   │
│  │   "decision": "DECISION: TICKET...",                        │   │
│  │   "ticket_result": "Created work item #4521..."             │   │
│  │ }                                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Flow Characteristics**:

1. **Sequential Execution**: Agents run in strict order (cannot parallelize)
2. **State Accumulation**: Each agent adds to session state, previous outputs remain accessible
3. **Template Injection**: Agents reference previous outputs via `{state_key}` syntax
4. **MCP Subprocess Management**: Each McpToolset spawns/manages its MCP server lifecycle
5. **Asynchronous Background Processing**: FastAPI background task prevents webhook timeout

## ⚙️ Environment Setup Example

Create `backend/.env`:
```bash
# FastAPI Server
PORT=3000
DEBUG=True

# Google Gemini / Vertex AI
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
GOOGLE_PROJECT_ID="my-gcp-project"
GOOGLE_LOCATION="us-central1"

# Datadog (passed to Datadog MCP subprocess)
DD_API_KEY="your_datadog_api_key_here"
DD_APP_KEY="your_datadog_app_key_here"
DD_SITE="datadoghq.com"

# Azure DevOps (passed to Azure MCP subprocess)
ADO_ORG_NAME="myorganization"
ADO_PROJECT="MyProject"
ADO_PAT="your_azure_devops_pat_here"

# Paths to MCP servers (relative or absolute)
DATADOG_MCP_PATH="../datadog-mcp/dist/index.js"
AZURE_MCP_PATH="../azure-devops-mcp/dist/index.js"
```

## 📚 Additional Resources

- **MCP Specification**: https://spec.modelcontextprotocol.io/
- **Google ADK Python Docs**: https://google.github.io/adk-docs/get-started/python/
- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **MCP Python SDK**: https://github.com/modelcontextprotocol/python-sdk
- **Azure DevOps MCP Tools**: See `azure-devops-mcp/docs/TOOLSET.md`
