# GeminiOps Bridge - Setup Guide

A complete guide to setting up the autonomous incident response system that bridges Datadog observability with Azure DevOps project management.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [1. Backend Setup](#1-backend-setup)
- [2. Datadog Agent Configuration](#2-datadog-agent-configuration)
- [3. Datadog Webhook Setup](#3-datadog-webhook-setup)
- [4. Datadog Monitor Setup](#4-datadog-monitor-setup)
- [5. Testing the Integration](#5-testing-the-integration)
- [6. Scaling for N Services](#6-scaling-for-n-services)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Docker         │     │   Datadog        │     │   GeminiOps Bridge  │
│  Containers     │────▶│   Agent          │────▶│   Backend           │
│  (texflow-*)    │logs │   (Host)         │     │   (MIRA   )         │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                          │
                        ┌──────────────────┐              │
                        │   Datadog        │              │
                        │   Monitor        │──webhook────▶│
                        │   (Log Alert)    │              │
                        └──────────────────┘              │
                                                          ▼
                                               ┌─────────────────────┐
                                               │  Sequential Agent   │
                                               │  Pipeline           │
                                               └─────────────────────┘
                                                          │
                        ┌─────────────────────────────────┼─────────────────────────────────┐
                        │                                 │                                 │
                        ▼                                 ▼                                 ▼
               ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
               │  Investigation  │             │    Decision     │             │     Ticket      │
               │     Agent       │────────────▶│     Agent       │────────────▶│     Agent       │
               │  (Datadog MCP)  │             │  (Pure Gemini)  │             │  (Azure MCP)    │
               └─────────────────┘             └─────────────────┘             └─────────────────┘
                        │                                 │                                 │
                        ▼                                 ▼                                 ▼
               Query Datadog Logs            Decide: IGNORE/MONITOR/TICKET      Create Azure DevOps
               Extract error patterns        Assess severity & priority          Bug with details
```

### Agent Pipeline Flow

1. **Investigation Agent**: Queries Datadog logs via MCP, extracts error patterns, affected services, stack traces
2. **Decision Agent**: Pure reasoning (no tools), decides severity and whether to create ticket
3. **Ticket Agent**: Creates detailed Azure DevOps Bug work item via MCP if decision is TICKET

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker with containers running
- Datadog account with API/APP keys
- Azure DevOps account with PAT token
- Google Cloud account with Gemini API access
- ngrok (for local development)

---

## 1. Backend Setup

### 1.1 Clone and Install Dependencies

```bash
cd /home/uttam/dd-mcp/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 1.2 Configure Environment Variables

Create `.env` file:

```bash
# FastAPI Server
PORT=8888

# Google Gemini / ADK
GOOGLE_API_KEY="your_google_api_key"
# OR
GEMINI_API_KEY="your_gemini_api_key"

# Datadog MCP
DD_API_KEY="your_dd_api_key"
DD_APP_KEY="your_dd_app_key"
DD_SITE="us5.datadoghq.com"  # Your Datadog site

# Azure DevOps MCP
ADO_ORG_NAME="your-organization"
ADO_PROJECT="YourProject"
ADO_PAT="your_ado_pat"
```

### 1.3 Build Datadog MCP Server

```bash
cd /home/uttam/dd-mcp/datadog-mcp
npm install
npm run build
```

### 1.4 Start the Backend

```bash
cd /home/uttam/dd-mcp/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8888
```

### 1.5 Expose via ngrok (for Datadog webhook)

```bash
ngrok http 8888
```

Note the forwarding URL (e.g., `https://xxxx-xxxx.ngrok-free.app`)

---

## 2. Datadog Agent Configuration

### 2.1 Enable Logs Collection

Edit `/etc/datadog-agent/datadog.yaml`:

```yaml
# Enable logs collection
logs_enabled: true

# Logs configuration
logs_config:
  container_collect_all: true
  auto_multi_line_detection: true

# Docker autodiscovery
listeners:
  - name: docker

config_providers:
  - name: docker
    polling: true
```

### 2.2 Configure Docker Integration (Custom Docker Path)

If using custom Docker root (e.g., `/home/uttam/rimo/docker`):

```bash
sudo mkdir -p /etc/datadog-agent/conf.d/docker.d
sudo tee /etc/datadog-agent/conf.d/docker.d/conf.yaml << 'EOF'
init_config:

instances:
  - docker_root: /home/uttam/rimo/docker

logs:
  - type: docker
    service: texflow
    source: go
EOF
```

### 2.3 Grant Permissions

```bash
sudo usermod -aG docker dd-agent
```

### 2.4 Restart Agent

```bash
sudo systemctl restart datadog-agent
```

### 2.5 Verify Logs Collection

```bash
sudo datadog-agent status | grep -A30 "Logs Agent"
```

Expected output:
```
Logs Agent
==========
    Reliable: Sending compressed logs in HTTPS to agent-http-intake.logs.us5.datadoghq.com
    LogsProcessed: 33549
    LogsSent: 33534
  ============
  Integrations
  ============
  container_collect_all
  ---------------------
    - Type: docker
      Service: project-service
      Source: docker-project-service
      Status: OK
```

---

## 3. Datadog Webhook Setup

### 3.1 Create Webhook Integration

1. Go to: **https://app.us5.datadoghq.com/integrations/webhooks** (adjust for your DD_SITE)
2. Click **"+ New"**
3. Configure:

| Field | Value |
|-------|-------|
| **Name** | `geminiops-bridge` |
| **URL** | `https://your-ngrok-url.ngrok-free.app/api/webhook/datadog` |
| **Payload** | See below |
| **Custom Headers** | `{"Content-Type": "application/json"}` |
| **Encode as form** | ❌ Unchecked |

### 3.2 Webhook Payload Template

```json
{
    "id": "$ID",
    "alert_type": "$ALERT_TYPE",
    "title": "$EVENT_TITLE",
    "date": $DATE,
    "body": "$TEXT_ONLY_MSG",
    "tags": ["$TAGS"],
    "scope": "$ALERT_SCOPE"
}
```

### 3.3 Available Webhook Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `$ID` | Event ID | `1234567` |
| `$ALERT_TYPE` | Alert type | `error`, `warning`, `info` |
| `$EVENT_TITLE` | Alert title | `[Triggered] High Error Rate` |
| `$DATE` | Unix timestamp (ms) | `1738690000000` |
| `$TEXT_ONLY_MSG` | Alert message text | `Error rate exceeded...` |
| `$TAGS` | Comma-separated tags | `service:web, env:prod` |
| `$ALERT_SCOPE` | Triggering scope | `service:compilation-service` |
| `$TAGS[key]` | Specific tag value | `$TAGS[service]` → `web` |

---

## 4. Datadog Monitor Setup

### 4.1 Create Log Monitor

1. Go to: **https://app.us5.datadoghq.com/monitors/create/log**
2. Configure:

**Define the search query:**
```
status:error
```

**Set alert conditions:**
- Alert threshold: `> 3` in last `5 minutes`
- Warning threshold (optional): `> 1` in last `5 minutes`

**Configure notifications:**
- **Monitor name:** `[GeminiOps] Texflow Error Alert`
- **Message:**
```
Error detected in services!

Service: {{service.name}}
Host: {{host.name}}

Query: status:error
Timeframe: {{last_triggered_at}}

@webhook-geminiops-bridge
```

3. Click **Create**

### 4.2 Monitor for Specific Service

To monitor a specific service:

**Query:**
```
status:error service:compilation-service
```

### 4.3 Multi-Service Monitor with Grouping

To create ONE monitor for ALL services:

**Query:**
```
status:error
```

**Multi Alert:** Group by `service`

This creates separate alerts per service automatically.

---

## 5. Testing the Integration

### 5.1 Test Backend Health

```bash
curl https://your-ngrok-url.ngrok-free.app/health
```

Expected response:
```json
{"status":"healthy","agent":"geminiops_bridge","app":"GeminiOps Bridge"}
```

### 5.2 Test Webhook Manually

```bash
curl -X POST "https://your-ngrok-url.ngrok-free.app/api/webhook/datadog" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-123",
    "alert_type": "error",
    "title": "[Triggered] Texflow Compilation Service Error",
    "date": 1738690000000,
    "body": "Error rate exceeded threshold. 15 errors in last 5 minutes.",
    "tags": ["service:compilation-service", "env:local", "host:texflow-compilation-service"]
  }'
```

Expected response:
```json
{"status":"accepted","alert_id":"test-123","message":"Alert test-123 accepted for processing"}
```

### 5.3 Test from Datadog Monitor

1. Go to your monitor
2. Click **⚙️ (gear icon)** → **"Test Notifications"**
3. Select **"Alert"**
4. Click **"Run Test"**

### 5.4 Generate Real Errors for Sample Test to trigger errors in `compilation-service`:

```bash
# Call invalid endpoint to generate error logs
curl http://localhost:8084/api/nonexistent-endpoint
```

### 5.5 Expected Pipeline Output

```
============================================================
Processing alert test-123...
============================================================

[datadog_investigator] Calling tool: search_logs with args: {...}

[datadog_investigator] INVESTIGATION SUMMARY:
- Services Affected: compilation-service
- Error Count: 15
- Top Error Messages: "LaTeX compilation timeout", "PDF generation failed"
- Severity: HIGH

[decision_maker] DECISION: TICKET
REASON: 15 errors detected in compilation-service over 5 minutes...
SEVERITY: HIGH
PRIORITY: P1
SERVICES_AFFECTED: compilation-service
RECOMMENDED_ACTION: Investigate LaTeX compilation timeouts

[ticket_creator] Calling tool: wit_create_work_item with args: {...}
[ticket_creator] ✅ Ticket #6 created in MIRA project

============================================================
Alert test-123 processing complete
============================================================
```

---

## 6. Scaling for N Services

### 6.1 Autodiscovery (Recommended)

Datadog automatically discovers and tags containers. No per-service configuration needed.

In `/etc/datadog-agent/datadog.yaml`:

```yaml
logs_enabled: true

logs_config:
  container_collect_all: true
  auto_multi_line_detection: true

listeners:
  - name: docker

config_providers:
  - name: docker
    polling: true
```

### 6.2 Docker Labels (Optional - for custom service names)

Add labels in `docker-compose.yml`:

```yaml
services:
  my-service:
    image: my-image
    labels:
      com.datadoghq.ad.logs: '[{"source": "go", "service": "my-custom-service-name"}]'
```

### 6.3 Single Monitor for All Services

Create ONE monitor with grouping:

- **Query:** `status:error`
- **Multi Alert:** Group by `service`
- **Message:** `@webhook-geminiops-bridge`

Benefits:
- 1 monitor covers N services
- Each service gets its own alert
- No configuration per service
- Scales automatically as services are added

### 6.4 Environment-based Filtering

To monitor only production:

```
status:error env:prod
```

To exclude certain services:

```
status:error -service:noisy-service
```

---

## Troubleshooting

### Logs Agent Not Running

```bash
# Check status
sudo datadog-agent status | grep -A10 "Logs Agent"

# Check config
sudo cat /etc/datadog-agent/datadog.yaml | grep -A5 "logs_enabled"

# View agent logs
sudo journalctl -u datadog-agent --no-pager -n 50
```

### Webhook Not Triggering

1. **Check monitor state:** Must transition from OK → Alert
2. **Check renotify interval:** Set shorter interval for testing
3. **Test manually:** Use "Test Notifications" in monitor settings
4. **Verify webhook URL:** Must include `/api/webhook/datadog` path

### Services Not Showing in Datadog UI

1. **Verify logs are being sent:**
   ```bash
   sudo datadog-agent status | grep -A5 "LogsSent"
   ```

2. **Check correct Datadog site:**
   - US1: `app.datadoghq.com`
   - US5: `app.us5.datadoghq.com`
   - EU: `app.datadoghq.eu`

3. **Enable container autodiscovery** (see Section 6.1)

### Agent Pipeline Errors

1. **Check MCP servers are built:**
   ```bash
   ls -la /home/uttam/dd-mcp/datadog-mcp/dist/
   ```

2. **Verify environment variables:**
   ```bash
   cat /home/uttam/dd-mcp/backend/.env
   ```

3. **Check backend logs** for detailed error messages

### Azure DevOps Ticket Not Created

1. **Verify ADO PAT has correct permissions:**
   - Work Items: Read & Write
   - Project: Read

2. **Check project name matches** in `.env` (`ADO_PROJECT`)

3. **Test ADO MCP directly:**
   ```bash
   cd /home/uttam/dd-mcp/azure-devops-mcp
   npm run inspect
   ```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/health` | GET | Health check |
| `/api/webhook/datadog` | POST | Datadog webhook receiver |

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port (default: 3000) | `8888` |
| `GOOGLE_API_KEY` | Yes* | Google/Gemini API key | `AIza...` |
| `GEMINI_API_KEY` | Yes* | Gemini API key (alternative) | `AIza...` |
| `DD_API_KEY` | Yes | Datadog API key | `abc123...` |
| `DD_APP_KEY` | Yes | Datadog Application key | `def456...` |
| `DD_SITE` | No | Datadog site (default: datadoghq.com) | `us5.datadoghq.com` |
| `ADO_ORG_NAME` | Yes | Azure DevOps organization | `myorg` |
| `ADO_PROJECT` | Yes | Azure DevOps project | `MyProject` |
| `ADO_PAT` | Yes | Azure DevOps PAT | `ghp_...` |

*One of GOOGLE_API_KEY or GEMINI_API_KEY required

---

## Files Reference

```
/home/uttam/dd-mcp/
├── backend/
│   ├── agent.py              # Agent definitions (Investigation, Decision, Ticket)
│   ├── main.py               # FastAPI application
│   ├── requirements.txt      # Python dependencies
│   ├── .env                  # Environment variables
│   └── setup_datadog_alert.py # Helper script to create monitors
├── datadog-mcp/
│   ├── src/                  # Datadog MCP server source
│   └── dist/                 # Built MCP server
├── azure-devops-mcp/
│   └── ...                   # Azure DevOps MCP server
└── SETUP_GUIDE.md            # This documentation
```

---

## Quick Start Checklist

- [ ] Backend `.env` configured with all keys
- [ ] Datadog MCP built (`npm run build` in datadog-mcp/)
- [ ] Backend running (`uvicorn main:app --port 8888`)
- [ ] ngrok exposing backend (`ngrok http 8888`)
- [ ] Datadog agent `logs_enabled: true`
- [ ] Datadog agent restarted
- [ ] Datadog webhook created with correct URL
- [ ] Datadog monitor created with `@webhook-geminiops-bridge`
- [ ] Test webhook manually to verify pipeline

---

## Support

For issues, check:
1. Backend logs (uvicorn output)
2. Datadog agent status (`sudo datadog-agent status`)
3. Datadog monitor notifications history
4. Azure DevOps work items list
