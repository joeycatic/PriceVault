import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('tenant switcher', () => {
  it('hides for single-tenant users and posts the selected tenant id', () => {
    const source = readFileSync('components/ui/TenantSwitcher.tsx', 'utf8')

    expect(source).toContain('tenants.length < 2')
    expect(source).toContain('/api/tenant/select')
    expect(source).toContain('JSON.stringify({ tenantId })')
    expect(source).toContain('router.refresh()')
  })
})
