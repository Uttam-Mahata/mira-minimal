"""
GeminiOps Bridge Agent Definition

This module defines the three-agent sequential pipeline:
1. Datadog Investigation Agent - Makes ONE log search to minimize API calls
2. Decision Making Agent - Pure reasoning, evaluates severity (no tools)
3. Azure DevOps Ticket Agent - Creates incidents if needed

CRITICAL: Agents are defined synchronously at module level for deployment.
NOTE: Instructions are optimized to minimize Gemini API calls to stay within rate limits.
"""

import os
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

# Environment variables (loaded by FastAPI from .env via python-dotenv)
DD_API_KEY = os.getenv("DD_API_KEY")
DD_APP_KEY = os.getenv("DD_APP_KEY")
DD_SITE = os.getenv("DD_SITE", "datadoghq.com")
ADO_ORG_NAME = os.getenv("ADO_ORG_NAME")
ADO_PAT = os.getenv("ADO_PAT")

# Validate required environment variables
if not all([DD_API_KEY, DD_APP_KEY, ADO_ORG_NAME, ADO_PAT]):
    raise ValueError(
        "Missing required environment variables. "
        "Ensure DD_API_KEY, DD_APP_KEY, ADO_ORG_NAME, and ADO_PAT are set."
    )

# --- Sub-Agent 1: Datadog Investigation Agent ---
investigation_agent = LlmAgent(
    name="datadog_investigator",
    model="gemini-2.5-flash-lite",
    instruction="""You are a Datadog investigation specialist.

IMPORTANT: Make ONE search_logs call to investigate the alert.

**Step 1: Parse the Alert**
Extract from the alert message:
- Service name (from tags like "service:xyz" or from alert title/body)
- Environment (from tags like "env:prod" or default to "*")
- Alert timestamp (the "date" field - it's Unix timestamp in milliseconds, convert to ISO 8601)

**Step 2: Search Logs**
Make ONE search_logs call:
- If service is found: query = "status:error service:<service>"
- If NO service found: query = "status:error" (search all errors)
- Time range: Convert alert timestamp to ISO 8601, then:
  - from = alert_time - 15 minutes
  - to = alert_time + 5 minutes (or now if alert is recent)
- limit = 50

**Step 3: Analyze and Report**
From the log results, extract and report:

INVESTIGATION SUMMARY:
- **Services Affected**: [List all unique services from logs, e.g., "compilation-service, auth-service"]
- **Error Count**: [Number of error logs found]
- **Time Range**: [First error to last error timestamp]
- **Top Error Messages**: [List 2-3 most common error messages]
- **Stack Traces**: [Summarize any stack traces found - include file names, line numbers]
- **Affected Hosts/Containers**: [List from log attributes]
- **Root Cause Hypothesis**: [Your assessment based on error patterns]
- **Severity**: [LOW/MEDIUM/HIGH/CRITICAL based on error count, services affected, error types]

If NO logs found, report:
- "No error logs found in the specified time range"
- Suggest the alert may be transient or already resolved

ALWAYS provide structured output even if no errors found.""",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="node",
                    args=["../datadog-mcp/dist/index.js"],
                    env={
                        "DD_API_KEY": DD_API_KEY,
                        "DD_APP_KEY": DD_APP_KEY,
                        "DD_SITE": DD_SITE,
                        "PATH": os.getenv("PATH")
                    }
                ),
                timeout=30
            ),
            tool_filter=['search_logs']
        )
    ],
    output_key="investigation_report"  # Stores output in session state
)

# --- Sub-Agent 2: Decision Making Agent ---
decision_agent = LlmAgent(
    name="decision_maker",
    model="gemini-2.5-flash-lite",
    instruction="""You are an SRE decision-making specialist.

Based on the investigation report, determine the appropriate action:

**Investigation Report:**
{investigation_report}

**Decision Criteria:**
- **IGNORE**: No errors found, transient spike (< 2 errors), already recovered, known noise
- **MONITOR**: 2-5 errors, concerning but stable, single service affected, no user impact evident
- **TICKET**: 5+ errors, multiple services affected, stack traces present, sustained issue, potential user impact

**Output format (MUST follow exactly):**
```
DECISION: [IGNORE|MONITOR|TICKET]
REASON: [2-3 sentence justification referencing specific findings from investigation]
SEVERITY: [LOW|MEDIUM|HIGH|CRITICAL]
PRIORITY: [P3|P2|P1|P0] (P0=Critical outage, P1=High impact, P2=Medium, P3=Low)
SERVICES_AFFECTED: [comma-separated list of services from investigation]
RECOMMENDED_ACTION: [Brief action item, e.g., "Investigate compilation-service memory leak"]
```

Be decisive. Base your decision on concrete evidence from the investigation.""",
    output_key="decision"  # No tools - pure reasoning
)

# --- Sub-Agent 3: Azure DevOps Ticket Agent ---
ADO_PROJECT = os.getenv("ADO_PROJECT", "MIRA")

ticket_agent = LlmAgent(
    name="ticket_creator",
    model="gemini-2.5-flash-lite",
    instruction=f"""You are an Azure DevOps ticket creation specialist.

**Decision:**
{{decision}}

**Investigation Report:**
{{investigation_report}}

**Instructions:**
If the decision is TICKET, create a detailed Bug work item using `wit_create_work_item`.

**Tool Parameters for wit_create_work_item:**
- project: "{ADO_PROJECT}"
- workItemType: "Bug"
- fields: Array of field objects with "name" and "value" properties

**Required Fields (create detailed, actionable content):**

1. **System.Title**: Create a clear, specific title:
   - Format: "[INCIDENT] <Service>: <Brief Error Description>"
   - Example: "[INCIDENT] compilation-service: PDF generation failures due to LaTeX timeout"

2. **System.Description**: Create detailed HTML description:
   ```html
   <h2>🚨 Incident Summary</h2>
   <p><strong>Alert Source:</strong> Datadog Monitor</p>
   <p><strong>Detection Time:</strong> [timestamp from alert]</p>
   <p><strong>Services Affected:</strong> [list from investigation]</p>
   <p><strong>Severity:</strong> [from decision]</p>
   
   <h2>📊 Investigation Findings</h2>
   <p><strong>Error Count:</strong> [number]</p>
   <p><strong>Time Window:</strong> [from - to]</p>
   
   <h3>Error Messages</h3>
   <ul>
     <li>[error message 1]</li>
     <li>[error message 2]</li>
   </ul>
   
   <h3>Stack Trace (if available)</h3>
   <pre>[stack trace excerpt]</pre>
   
   <h2>🔍 Root Cause Analysis</h2>
   <p>[hypothesis from investigation]</p>
   
   <h2>📋 Recommended Actions</h2>
   <ol>
     <li>[action item 1]</li>
     <li>[action item 2]</li>
   </ol>
   
   <h2>🔗 Links</h2>
   <ul>
     <li><a href="[datadog_link]">Datadog Logs</a></li>
     <li><a href="[monitor_link]">Monitor Dashboard</a></li>
   </ul>
   ```

3. **Microsoft.VSTS.Common.Priority**: Map severity to priority:
   - CRITICAL/P0 → "1"
   - HIGH/P1 → "1" 
   - MEDIUM/P2 → "2"
   - LOW/P3 → "3"

4. **System.Tags**: "incident; datadog; automated; [service-name]"

5. **Microsoft.VSTS.TCM.ReproSteps** (optional but recommended):
   ```html
   <h3>How to Reproduce/Investigate</h3>
   <ol>
     <li>Go to Datadog Logs Explorer</li>
     <li>Search: status:error service:[service-name]</li>
     <li>Time range: [alert time ± 15 min]</li>
     <li>Review error patterns and stack traces</li>
   </ol>
   ```

**Example Tool Call:**
```json
{{
  "project": "{ADO_PROJECT}",
  "workItemType": "Bug",
  "fields": [
    {{"name": "System.Title", "value": "[INCIDENT] compilation-service: LaTeX compilation timeouts"}},
    {{"name": "System.Description", "value": "<h2>🚨 Incident Summary</h2>..."}},
    {{"name": "Microsoft.VSTS.Common.Priority", "value": "2"}},
    {{"name": "System.Tags", "value": "incident; datadog; automated; compilation-service"}}
  ]
}}
```

If decision is IGNORE or MONITOR, output: 
"No ticket created - [reason from decision]. Recommended action: [action from decision]"

After creating ticket, confirm: "✅ Ticket #[ID] created in {ADO_PROJECT} project"
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
                        "--authentication",
                        "envvar",
                        "-d", "core", "work-items"
                    ],
                    env={
                        "ADO_PAT": ADO_PAT,
                        "ADO_MCP_AUTH_TOKEN": ADO_PAT,
                        "AZURE_DEVOPS_ORG_URL": f"https://dev.azure.com/{ADO_ORG_NAME}",
                        "AZURE_DEVOPS_AUTH_METHOD": "pat",
                        "AZURE_DEVOPS_PAT": ADO_PAT,
                        "AZURE_DEVOPS_DEFAULT_PROJECT": os.getenv("ADO_PROJECT", "nyaya"),
                        "PATH": os.getenv("PATH")
                    }
                ),
                timeout=30
            ),
            tool_filter=['wit_create_work_item', 'wit_update_work_item']
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
