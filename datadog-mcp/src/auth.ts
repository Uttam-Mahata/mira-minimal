import { client, v1, v2 } from '@datadog/datadog-api-client';
import logger from './logger.js';

export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string;
}

export interface DatadogAPIs {
  v1: {
    metrics: v1.MetricsApi;
    monitors: v1.MonitorsApi;
  };
  v2: {
    logs: v2.LogsApi;
    spans: v2.SpansApi;
  };
}

/**
 * Load Datadog configuration from environment variables
 */
export function loadDatadogConfig(): DatadogConfig {
  const apiKey = process.env.DD_API_KEY;
  const appKey = process.env.DD_APP_KEY;
  const site = process.env.DD_SITE || 'datadoghq.com';

  if (!apiKey || !appKey) {
    throw new Error(
      'Missing required environment variables: DD_API_KEY and DD_APP_KEY must be set'
    );
  }

  logger.info('Loaded Datadog configuration', {
    site,
    apiKeyPresent: !!apiKey,
    appKeyPresent: !!appKey,
  });

  return { apiKey, appKey, site };
}

/**
 * Configure Datadog API client with credentials
 */
export function configureDatadogClient(config: DatadogConfig): void {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: config.apiKey,
      appKeyAuth: config.appKey,
    },
  });

  configuration.setServerVariables({
    site: config.site,
  });

  logger.info('Configured Datadog API client', { site: config.site });
}

/**
 * Create Datadog API instances
 */
export function createDatadogAPIs(): DatadogAPIs {
  const configuration = client.createConfiguration();

  return {
    v1: {
      metrics: new v1.MetricsApi(configuration),
      monitors: new v1.MonitorsApi(configuration),
    },
    v2: {
      logs: new v2.LogsApi(configuration),
      spans: new v2.SpansApi(configuration),
    },
  };
}
