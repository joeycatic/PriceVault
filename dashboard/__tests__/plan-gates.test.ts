import { describe, expect, it } from 'vitest'

import { hasPlan, planLimit } from '@/lib/plan-gates'

describe('plan gates', () => {
  it('orders free, pro, and agency capabilities', () => {
    expect(hasPlan('free', 'pro')).toBe(false)
    expect(hasPlan('trial', 'free')).toBe(true)
    expect(hasPlan('starter', 'pro')).toBe(true)
    expect(hasPlan('pro', 'agency')).toBe(false)
    expect(hasPlan('agency', 'pro')).toBe(true)
  })

  it('returns the catalog, alert, scrape, and seat limits per plan', () => {
    expect(planLimit('free')).toEqual({ scrapesPerDay: 50, products: 5, competitors: 2, alerts: 3, seats: 1 })
    expect(planLimit('pro')).toEqual({ scrapesPerDay: 500, products: 50, competitors: 10, alerts: null, seats: 1 })
    expect(planLimit('starter')).toEqual({ scrapesPerDay: 500, products: 50, competitors: 10, alerts: null, seats: 1 })
    expect(planLimit('agency')).toEqual({ scrapesPerDay: 5000, products: null, competitors: null, alerts: null, seats: 5 })
  })
})
