import type { Tenant } from '@/lib/types'

export type Plan = Tenant['plan']

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  trial: 0,
  starter: 1,
  pro: 1,
  agency: 2,
}

export function hasPlan(plan: Plan | null | undefined, minimum: 'free' | 'pro' | 'agency') {
  return PLAN_RANK[plan ?? 'free'] >= PLAN_RANK[minimum]
}

export function planLimit(plan: Plan | null | undefined) {
  switch (plan) {
    case 'agency':
      return { scrapesPerDay: 5000, products: null, competitors: null, alerts: null, seats: 5 }
    case 'pro':
    case 'starter':
      return { scrapesPerDay: 500, products: 50, competitors: 10, alerts: null, seats: 1 }
    default:
      return { scrapesPerDay: 50, products: 5, competitors: 2, alerts: 3, seats: 1 }
  }
}

export function minimumScrapeFrequency(plan: Plan | null | undefined) {
  switch (plan) {
    case 'agency':
      return 1
    case 'pro':
    case 'starter':
      return 6
    default:
      return 12
  }
}
