 Functionality Overview
  The library covers a wide range of Datadog products and features, including but not limited to:
   * Dashboards: Create and manage dashboards, widgets, and lists.
   * Monitors: Manage alerts, downtimes, and notification rules.
   * Metrics: Query timeseries/scalar data, submit metrics, and manage metadata.
   * Logs: Manage indexes, archives, pipelines, and search logs.
   * Synthetics: Create and run API and Browser tests.
   * Security: Manage security monitoring rules, signals, and filters.
   * Events & Incidents: Post events and manage incident workflows.
   * Access Control: Manage users, roles, and API/Application keys.
   * Integrations: Configure AWS, Azure, GCP, Slack, PagerDuty, and more.

  How Webhooks Work
  The library supports Datadog's Webhooks Integration primarily through the V1 API (WebhooksIntegrationApi). This allows you to
  programmatically manage webhook endpoints that Datadog can call (e.g., when a monitor alerts).

  Here is the breakdown of the available webhook operations:

  1. Manage Webhooks
  You can register and manage the actual webhook endpoints.
   * Create: Register a new webhook with a name and URL.
       * Input: name, url
       * Example: apiInstance.createWebhooksIntegration({ body: { name: "MyWebhook", url: "https://example.com" } })
   * Get: Retrieve details of a specific webhook.
       * Input: webhookName
   * Update: Modify an existing webhook (e.g., change the URL).
       * Input: webhookName, body (with new details)
   * Delete: Remove a webhook integration.
       * Input: webhookName

  2. Manage Custom Variables
  You can manage custom variables that can be included in your webhook payloads (often used for authentication tokens or shared secrets).
   * Create: Add a new custom variable.
       * Input: name, value, isSecret (boolean)
   * Get: Retrieve a custom variable.
   * Update: Change the value of a custom variable.
   * Delete: Remove a custom variable.
