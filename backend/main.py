"""
GeminiOps Bridge FastAPI Application

FastAPI webhook endpoint that receives Datadog alerts and processes them
through the agent pipeline in the background.
"""

from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel, ConfigDict
from google.adk.runners import InMemoryRunner
from google.genai import types
from dotenv import load_dotenv
import os

# Load environment variables BEFORE importing agent
load_dotenv()

# Import the agent (must be after load_dotenv)
from agent import root_agent

# Initialize FastAPI
app = FastAPI(
    title="GeminiOps Bridge",
    description="Autonomous incident response system bridging Datadog and Azure DevOps",
    version="1.0.0"
)

# Initialize ADK Runner (singleton, defined at module level)
runner = InMemoryRunner(
    agent=root_agent,
    app_name="geminiops_bridge"
)

# Pydantic model for Datadog webhook payload
class DatadogAlert(BaseModel):
    """Datadog webhook alert payload"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "1234567890",
                "alert_type": "error",
                "title": "High CPU usage on prod-web-01",
                "date": 1704067200,
                "body": "CPU usage exceeded 90% threshold",
                "tags": ["env:prod", "service:web", "host:prod-web-01"]
            }
        }
    )

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
    """
    Receives Datadog webhook alerts and triggers agent pipeline processing

    Returns immediately with 202 Accepted status.
    Processing happens asynchronously in background.
    """
    # Add processing as background task (non-blocking)
    background_tasks.add_task(process_alert, alert)

    return {
        "status": "accepted",
        "alert_id": alert.id,
        "message": f"Alert {alert.id} accepted for processing"
    }

async def process_alert(alert: DatadogAlert):
    """
    Background task to process alert through agent pipeline

    Flow:
    1. Create session for this alert
    2. Format alert as user message
    3. Run SequentialAgent pipeline
    4. Log results (investigation → decision → ticket)
    """
    user_id = "datadog_webhook"
    session_id = f"alert_{alert.id}"

    try:
        # Create session for state management
        await runner.session_service.create_session(
            app_name="geminiops_bridge",
            user_id=user_id,
            session_id=session_id
        )

        # Format alert as user message for the agent
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

        # Create content for agent
        content = types.Content(
            role='user',
            parts=[types.Part(text=alert_message)]
        )

        # Run agent pipeline (streams events)
        print(f"\n{'='*60}")
        print(f"Processing alert {alert.id}...")
        print(f"{'='*60}")

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content
        ):
            # Log agent events for debugging
            if event.author:
                role = event.author
            else:
                role = "System"

            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        print(f"\n[{role}] {part.text}")
                    if part.function_call:
                        print(f"\n[{role}] Calling tool: {part.function_call.name} with args: {part.function_call.args}")
            
            # Special handling for final responses
            if event.is_final_response():
                print(f"--- Final response from {role} ---")

        # Retrieve final session state to see all agent outputs
        session = await runner.session_service.get_session(
            app_name="geminiops_bridge",
            user_id=user_id,
            session_id=session_id
        )

        # Log final state for debugging
        print(f"\n{'='*60}")
        print(f"Alert {alert.id} processing complete")
        print(f"{'='*60}")
        print(f"Investigation: {session.state.get('investigation_report', 'N/A')[:200]}...")
        print(f"Decision: {session.state.get('decision', 'N/A')}")
        print(f"Ticket: {session.state.get('ticket_result', 'N/A')}")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"ERROR processing alert {alert.id}: {str(e)}")
        import traceback
        traceback.print_exc()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "agent": root_agent.name,
        "app": "GeminiOps Bridge"
    }

@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "name": "GeminiOps Bridge",
        "version": "1.0.0",
        "description": "Autonomous incident response system",
        "endpoints": {
            "webhook": "POST /api/webhook/datadog",
            "health": "GET /health"
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
