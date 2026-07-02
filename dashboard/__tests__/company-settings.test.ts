import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('company settings', () => {
  it('keeps tenant profile writes owner-only', () => {
    const source = readFileSync('app/dashboard/company/page.tsx', 'utf8')

    expect(source).toContain("tenant?.membership_role === 'owner'")
    expect(source).toContain("tenant.membership_role !== 'owner'")
    expect(source).toContain('Nur Owner dürfen das Unternehmen bearbeiten.')
    expect(source.indexOf("tenant.membership_role !== 'owner'")).toBeLessThan(
      source.indexOf(".from('tenants')\n      .update"),
    )
    expect(source).toContain('canEditCompany ?')
  })
})
