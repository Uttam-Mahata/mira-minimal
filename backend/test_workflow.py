#!/usr/bin/env python3
"""
Test script for GeminiOps Bridge automated workflow.

This script tests the complete incident response pipeline:
1. Datadog MCP Server investigation
2. Gemini decision making
3. Azure DevOps ticket creation

Usage:
    python test_workflow.py
"""

import asyncio
import os
from dotenv import load_dotenv

# Load environment variables before importing agents
load_dotenv()


async def test_full_workflow():
    """Test the complete agent pipeline with a mock alert."""
    from main import process_alert
    from pydantic import BaseModel
    
    class DatadogAlert(BaseModel):
        id: str
        alert_type: str
        title: str
        date: int
        body: str
        tags: list[str]
    
    # Create a realistic test alert
    alert = DatadogAlert(
        id="test-workflow-001",
        alert_type="error",
        title="High error rate on payment-service",
        date=1738519815,
        body="Error rate exceeded 5% threshold on payment-service in production. "
             "Multiple HTTP 500 errors detected in the last 15 minutes. "
             "Affected endpoints: /api/checkout, /api/payment/process",
        tags=[
            "env:production",
            "service:payment",
            "severity:high",
            "team:backend",
            "alert_type:error_rate"
        ]
    )
    
    print("=" * 60)
    print("GeminiOps Bridge - Automated Workflow Test")
    print("=" * 60)
    print(f"Alert ID: {alert.id}")
    print(f"Alert Type: {alert.alert_type}")
    print(f"Title: {alert.title}")
    print(f"Tags: {', '.join(alert.tags)}")
    print("=" * 60)
    print("\nStarting agent pipeline processing...")
    print("This test will:")
    print("  1. Call Datadog MCP to investigate metrics and logs")
    print("  2. Use Gemini to reason about severity")
    print("  3. Create Azure DevOps ticket if needed")
    print("=" * 60)
    
    try:
        await process_alert(alert)
        print("\n" + "=" * 60)
        print("Workflow test completed successfully!")
        print("=" * 60)
    except Exception as e:
        print(f"\nError during workflow: {e}")
        import traceback
        traceback.print_exc()


async def test_health_check():
    """Test the FastAPI health endpoint."""
    import httpx
    
    print("Testing health endpoint...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:3000/health")
            print(f"Health check response: {response.json()}")
        except Exception as e:
            print(f"Health check failed: {e}")


async def test_webhook_endpoint():
    """Test the webhook endpoint with a sample alert."""
    import httpx
    
    print("Testing webhook endpoint...")
    alert_payload = {
        "id": "test-webhook-001",
        "alert_type": "warning",
        "title": "CPU usage elevated on web-server-01",
        "date": 1738519815,
        "body": "CPU usage has been above 80% for 10 minutes",
        "tags": ["env:staging", "service:web", "host:web-server-01"]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:3000/api/webhook/datadog",
                json=alert_payload
            )
            print(f"Webhook response: {response.json()}")
        except Exception as e:
            print(f"Webhook test failed: {e}")


def main():
    """Run the workflow tests."""
    print("\n" + "=" * 60)
    print("GeminiOps Bridge - Workflow Test Suite")
    print("=" * 60)
    
    # Check environment variables
    required_vars = [
        "DD_API_KEY", "DD_APP_KEY", "DD_SITE",
        "ADO_ORG_NAME", "ADO_PAT",
        "GOOGLE_API_KEY"
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"\nError: Missing required environment variables:")
        for var in missing_vars:
            print(f"  - {var}")
        print("\nPlease create a .env file with the required credentials.")
        print("See .env.example for reference.")
        return
    
    print("\nEnvironment variables loaded successfully:")
    print(f"  - DD_SITE: {os.getenv('DD_SITE')}")
    print(f"  - ADO_ORG_NAME: {os.getenv('ADO_ORG_NAME')}")
    print(f"  - GOOGLE_API_KEY: {'*' * 20} (hidden)")
    
    print("\nRunning full workflow test...")
    asyncio.run(test_full_workflow())


if __name__ == "__main__":
    main()
