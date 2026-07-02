import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const memberFacingFiles = [
  'lib/backend.ts',
  'app/onboarding/page.tsx',
  'app/onboarding/actions.ts',
  'app/api/auth/callback/route.ts',
  'app/api/export/csv/route.ts',
  'app/api/export/pdf/route.ts',
  'app/api/usage/route.ts',
  'app/dashboard/scrape-actions.ts',
]

describe('team tenant access', () => {
  it('resolves member-facing tenants through RLS instead of owner filters', () => {
    for (const path of memberFacingFiles) {
      const source = readFileSync(path, 'utf8')
      if (source.includes('currentTenant') && path !== 'lib/backend.ts') {
        expect(source, path).not.toContain(".eq('user_id'")
        continue
      }
      const tenantQueries = source.match(/from\('tenants'\)[\s\S]{0,280}?(\.maybeSingle\(\)|\.order\('created_at')/g) ?? []
      expect(tenantQueries.length, path).toBeGreaterThan(0)
      for (const query of tenantQueries) {
        expect(query, path).not.toContain(".eq('user_id'")
      }
    }
  })

  it('distinguishes owner and invited member roles', () => {
    const source = readFileSync('lib/backend.ts', 'utf8')
    const tenantLookup = source.indexOf(".from('tenants')")
    const membershipLookup = source.indexOf(".from('team_members')")
    const acceptUpdate = source.indexOf('update({ accepted: true })')

    expect(tenantLookup).toBeGreaterThan(-1)
    expect(membershipLookup).toBeGreaterThan(tenantLookup)
    expect(acceptUpdate).toBeGreaterThan(membershipLookup)
    expect(source).toContain("membership_role: 'owner'")
    expect(source).toContain(".select('role,accepted')")
    expect(source).toContain(".eq('tenant_id', tenant.id)")
    expect(source).toContain(".eq('user_id', user.id)")
    expect(source).toContain('membership.role')
  })
})
