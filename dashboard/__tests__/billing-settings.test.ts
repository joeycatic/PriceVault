import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('billing settings', () => {
  it('keeps Viva billing actions owner-only', () => {
    const source = readFileSync('app/dashboard/settings/billing/page.tsx', 'utf8')

    expect(source).toContain("tenant.membership_role !== 'owner'")
    expect(source).toContain("tenant?.membership_role === 'owner'")
    expect(source).toContain('canManageBilling &&')
    expect(source).toContain('Nur Owner dürfen Plan und Abrechnung verwalten.')
    expect(source).toContain('Viva Smart Checkout')
    expect(source).toContain("backendFetch('/billing/cancel'")
    expect(source.indexOf("tenant.membership_role !== 'owner'")).toBeLessThan(
      source.indexOf("backendFetch('/billing/checkout'"),
    )
  })
})
