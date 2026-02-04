/**
 * Domain definitions for Datadog MCP Server
 * Domains allow filtering which tools are exposed to clients
 */

export type Domain = 'metrics' | 'logs' | 'monitors' | 'traces';

export const ALL_DOMAINS: Domain[] = ['metrics', 'logs', 'monitors', 'traces'];

export const DOMAIN_DESCRIPTIONS: Record<Domain, string> = {
  metrics: 'Metric timeseries queries',
  logs: 'Log search and aggregation',
  monitors: 'Monitor/alert management',
  traces: 'APM span/trace analysis',
};

export function parseDomains(domains: string[]): Domain[] {
  const validDomains: Domain[] = [];

  for (const domain of domains) {
    if (ALL_DOMAINS.includes(domain as Domain)) {
      validDomains.push(domain as Domain);
    } else {
      throw new Error(
        `Invalid domain: ${domain}. Valid domains: ${ALL_DOMAINS.join(', ')}`
      );
    }
  }

  return validDomains.length > 0 ? validDomains : ALL_DOMAINS;
}

export function isDomainEnabled(domain: Domain, enabledDomains: Domain[]): boolean {
  return enabledDomains.includes(domain);
}
