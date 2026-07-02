import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const guardedPages = [
  {
    path: 'app/dashboard/settings/api-keys/page.tsx',
    endpoint: "backendFetch('/api-keys'",
    message: 'API-Keys können nur Owner und Admins ab dem Pro-Plan verwalten.',
  },
  {
    path: 'app/dashboard/alerts/channels/page.tsx',
    endpoint: "backendFetch('/alert-channels'",
    message: 'Alert-Kanäle können nur Owner und Admins ab dem Pro-Plan verwalten.',
  },
  {
    path: 'app/dashboard/settings/connectors/page.tsx',
    endpoint: "backendFetch('/connectors/shopify/import'",
    message: 'Connectoren können nur Owner und Admins ab dem Pro-Plan verwalten.',
  },
]

describe('integration settings', () => {
  it('keeps sensitive integration management owner/admin and Pro gated', () => {
    for (const page of guardedPages) {
      const source = readFileSync(page.path, 'utf8')

      expect(source, page.path).toContain("hasPlan(tenant.plan, 'pro')")
      expect(source, page.path).toContain("['owner', 'admin'].includes")
      expect(source, page.path).toContain('canManageIntegrations')
      expect(source, page.path).toContain(page.message)
      expect(source.indexOf("hasPlan(tenant.plan, 'pro')"), page.path).toBeLessThan(
        source.indexOf(page.endpoint),
      )
    }
  })
})
