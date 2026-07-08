import { NextResponse } from 'next/server'

import { listTenantsForUser } from '@/lib/backend'

export async function POST(request: Request) {
  const { tenantId } = await request.json()
  const tenants = await listTenantsForUser()
  if (!tenants.some((tenant) => tenant.id === tenantId)) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Mandanten' }, { status: 403 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('pv-tenant', tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
