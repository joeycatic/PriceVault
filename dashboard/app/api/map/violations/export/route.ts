import { NextResponse } from 'next/server'

import { backendFetch, currentTenant } from '@/lib/backend'

export async function GET() {
  const tenant = await currentTenant()
  if (!tenant) return NextResponse.json({ error: 'Kein Mandant eingerichtet' }, { status: 401 })
  const response = await backendFetch('/map/violations/export?status=all', tenant.id)
  const body = await response.text()
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=map_violations.csv',
    },
  })
}
