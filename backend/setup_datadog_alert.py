#!/usr/bin/env python3
"""
Datadog Alert Setup Script

Creates a Datadog monitor that triggers a webhook to the GeminiOps Bridge backend
when errors are detected in logs.

Usage:
    python setup_datadog_alert.py --backend-url <YOUR_BACKEND_URL>

Example:
    python setup_datadog_alert.py --backend-url https://your-backend.ngrok.io
"""

import os
import argparse
from datadog_api_client import ApiClient, Configuration
from datadog_api_client.v1.api.monitors_api import MonitorsApi
from datadog_api_client.v1.model.monitor import Monitor
from datadog_api_client.v1.model.monitor_type import MonitorType
from datadog_api_client.v1.model.monitor_options import MonitorOptions
from datadog_api_client.v1.model.monitor_thresholds import MonitorThresholds
from dotenv import load_dotenv

load_dotenv()


def create_error_log_monitor(backend_url: str, service: str = "*", env: str = "*"):
    """
    Create a Datadog log-based monitor that triggers on error logs.
    
    The monitor will send a webhook to the GeminiOps Bridge backend when triggered.
    """
    
    # Validate environment variables
    api_key = os.getenv("DD_API_KEY")
    app_key = os.getenv("DD_APP_KEY")
    dd_site = os.getenv("DD_SITE", "datadoghq.com")
    
    if not api_key or not app_key:
        raise ValueError("DD_API_KEY and DD_APP_KEY must be set in environment")
    
    # Configure Datadog client
    configuration = Configuration()
    configuration.api_key["apiKeyAuth"] = api_key
    configuration.api_key["appKeyAuth"] = app_key
    configuration.server_variables["site"] = dd_site
    
    # Build the log query
    if service == "*" and env == "*":
        log_query = "status:error"
    elif service == "*":
        log_query = f"status:error env:{env}"
    elif env == "*":
        log_query = f"status:error service:{service}"
    else:
        log_query = f"status:error service:{service} env:{env}"
    
    # Webhook URL for the backend
    webhook_url = f"{backend_url.rstrip('/')}/api/webhook/datadog"
    
    # Create the monitor
    # Using logs alert: triggers when error log count exceeds threshold
    monitor = Monitor(
        name=f"[GeminiOps] Error Log Monitor - {service}:{env}",
        type=MonitorType.LOG_ALERT,
        query=f'logs("{log_query}").index("*").rollup("count").last("5m") > 5',
        message=f"""
## Error Log Alert

Elevated error rate detected in logs.

**Query:** `{log_query}`
**Threshold:** More than 5 errors in 5 minutes

### Alert Details
- Service: {service}
- Environment: {env}
- Triggered at: {{{{last_triggered_at}}}}

@webhook-geminiops-bridge
""",
        tags=[
            "service:" + service,
            "env:" + env,
            "team:sre",
            "source:geminiops",
            "automated:true"
        ],
        options=MonitorOptions(
            thresholds=MonitorThresholds(
                critical=5.0,  # Alert when > 5 errors in 5 minutes
                warning=3.0,   # Warn when > 3 errors
            ),
            notify_no_data=False,
            renotify_interval=60,  # Re-notify every 60 minutes if still alerting
            escalation_message="Alert is still active after 1 hour.",
            include_tags=True,
            # Webhook payload template - matches DatadogAlert model in main.py
            # Note: The webhook integration must be configured separately
        ),
        priority=3,  # P3 by default, agent will reassess
    )
    
    with ApiClient(configuration) as api_client:
        monitors_api = MonitorsApi(api_client)
        
        try:
            response = monitors_api.create_monitor(body=monitor)
            print(f"✅ Monitor created successfully!")
            print(f"   Monitor ID: {response.id}")
            print(f"   Monitor Name: {response.name}")
            print(f"   Query: {response.query}")
            print(f"\n⚠️  IMPORTANT: You must also configure the webhook integration in Datadog!")
            print(f"   1. Go to Datadog > Integrations > Webhooks")
            print(f"   2. Create a new webhook named 'geminiops-bridge'")
            print(f"   3. Set URL to: {webhook_url}")
            print(f"   4. Set payload to the JSON template below:")
            print_webhook_payload_template()
            return response
        except Exception as e:
            print(f"❌ Failed to create monitor: {e}")
            raise


def print_webhook_payload_template():
    """Print the webhook payload template for manual configuration."""
    payload = '''
{
    "id": "$ID",
    "alert_type": "$ALERT_TYPE",
    "title": "$EVENT_TITLE",
    "date": $DATE,
    "body": "$TEXT_ONLY_MSG",
    "tags": ["$TAGS"]
}
'''
    print(payload)
    print("\n   5. Set 'Custom Headers' to:")
    print('   {"Content-Type": "application/json"}')
    print("\n   6. Check 'Encode as form' is UNCHECKED")
    print("\n   7. Test the webhook to verify connectivity")


def create_webhook_integration(backend_url: str):
    """
    Note: Webhook integrations must be configured manually in Datadog UI
    or via Terraform. The API doesn't directly support webhook creation.
    
    This function prints instructions for manual setup.
    """
    webhook_url = f"{backend_url.rstrip('/')}/api/webhook/datadog"
    
    print("\n" + "="*60)
    print("WEBHOOK INTEGRATION SETUP")
    print("="*60)
    print(f"""
To complete the setup, configure a webhook in Datadog:

1. Navigate to: Datadog > Integrations > Webhooks
   URL: https://app.datadoghq.com/integrations/webhooks
   (or https://app.{os.getenv('DD_SITE', 'datadoghq.com')}/integrations/webhooks)

2. Click "New Webhook" or "New" button

3. Configure the webhook:
   - Name: geminiops-bridge
   - URL: {webhook_url}
   - Payload (Custom):
""")
    print_webhook_payload_template()
    print("""
4. Save the webhook

5. The monitor message uses @webhook-geminiops-bridge to trigger this webhook

Note: If using ngrok for local development:
   ngrok http 3000
   Then use the ngrok URL as the backend URL.
""")


def main():
    parser = argparse.ArgumentParser(
        description="Set up Datadog monitor with webhook to GeminiOps Bridge"
    )
    parser.add_argument(
        "--backend-url",
        required=True,
        help="URL of your GeminiOps Bridge backend (e.g., https://your-app.ngrok.io)"
    )
    parser.add_argument(
        "--service",
        default="*",
        help="Service name to monitor (default: * for all services)"
    )
    parser.add_argument(
        "--env",
        default="*",
        help="Environment to monitor (default: * for all environments)"
    )
    parser.add_argument(
        "--webhook-only",
        action="store_true",
        help="Only print webhook setup instructions, don't create monitor"
    )
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("GeminiOps Bridge - Datadog Alert Setup")
    print("="*60)
    
    if args.webhook_only:
        create_webhook_integration(args.backend_url)
    else:
        # Create the monitor
        create_error_log_monitor(
            backend_url=args.backend_url,
            service=args.service,
            env=args.env
        )
        # Print webhook setup instructions
        create_webhook_integration(args.backend_url)


if __name__ == "__main__":
    main()
