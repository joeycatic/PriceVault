import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { GET } from '@/app/api/usage/route'

function makeQuery(result: unknown, terminal: 'maybeSingle' | 'gte') {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    gte: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  if (terminal === 'maybeSingle') query.gte = vi.fn(() => Promise.reject(new Error('unexpected gte')))
  if (terminal === 'gte') query.maybeSingle = vi.fn(() => Promise.reject(new Error('unexpected maybeSingle')))
  return query
}

function makeSupabase({
  user,
  tenant,
  snapshotCount,
}: {
  user: { id: string } | null
  tenant?: { id: string; plan: string } | null
  snapshotCount?: number | null
}) {
  const tenantsQuery = makeQuery({ data: tenant ?? null }, 'maybeSingle')
  const snapshotsQuery = makeQuery({ count: snapshotCount ?? 0 }, 'gte')
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user } })),
    },
    from: vi.fn((table: string) => {
      if (table === 'tenants') return tenantsQuery
      if (table === 'price_snapshots') return snapshotsQuery
      throw new Error(`unexpected table ${table}`)
    }),
    tenantsQuery,
    snapshotsQuery,
  }
}

describe('/api/usage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-30T15:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns 401 when the user is not authenticated', async () => {
    mocks.createClient.mockResolvedValue(makeSupabase({ user: null }))

    const response = await GET()

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Nicht angemeldet' })
  })

  it('returns 404 when the user has no tenant', async () => {
    mocks.createClient.mockResolvedValue(makeSupabase({ user: { id: 'user-1' }, tenant: null }))

    const response = await GET()

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Kein Mandant eingerichtet' })
  })

  it('returns current daily usage and plan limit for the tenant', async () => {
    const supabase = makeSupabase({
      user: { id: 'user-1' },
      tenant: { id: 'tenant-1', plan: 'agency' },
      snapshotCount: 137,
    })
    mocks.createClient.mockResolvedValue(supabase)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      used: 137,
      limit: 5000,
      plan: 'agency',
      next_reset: Date.parse('2026-07-01T00:00:00.000Z'),
    })
    expect(supabase.from).toHaveBeenCalledWith('tenants')
    expect(supabase.from).toHaveBeenCalledWith('price_snapshots')
    expect(supabase.snapshotsQuery.gte).toHaveBeenCalledWith(
      'scraped_at',
      '2026-06-30T00:00:00.000Z',
    )
  })
})
