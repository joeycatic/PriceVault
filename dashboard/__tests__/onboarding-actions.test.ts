import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('onboarding server actions', () => {
  it('only lets owners update an existing tenant shop', () => {
    const source = readFileSync('app/onboarding/actions.ts', 'utf8')
    const saveShop = source.match(/export async function saveShop[\s\S]*?export async function saveFirstProduct/)?.[0] ?? ''

    expect(source).toContain(".select('id, plan, user_id, created_at')")
    expect(saveShop).toContain('tenant.user_id !== user.id')
    expect(saveShop).toContain('Nur Owner dürfen den Shop bearbeiten.')
    expect(saveShop.indexOf('tenant.user_id !== user.id')).toBeLessThan(
      saveShop.indexOf(".from('tenants')\n      .update"),
    )
  })

  it('checks the product plan limit before inserting the first product', () => {
    const source = readFileSync('app/onboarding/actions.ts', 'utf8')
    const saveFirstProduct = source.match(/export async function saveFirstProduct[\s\S]*?export async function saveFirstSource/)?.[0] ?? ''

    expect(saveFirstProduct).toContain('planLimit(tenant.plan).products')
    expect(saveFirstProduct).toContain(".from('products')")
    expect(saveFirstProduct).toContain("select('id', { count: 'exact', head: true })")
    expect(saveFirstProduct.indexOf("select('id', { count: 'exact', head: true })")).toBeLessThan(
      saveFirstProduct.indexOf('.insert({'),
    )
    expect(saveFirstProduct).toContain('Dein Plan erlaubt maximal')
  })
})
