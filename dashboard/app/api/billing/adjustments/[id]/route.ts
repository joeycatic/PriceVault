import { NextResponse } from 'next/server'

import { backendFetch, currentTenant } from '@/lib/backend'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await currentTenant()
  if (!tenant) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  const { id } = await params
  const response = await backendFetch(`/billing/adjustments/${id}/pdf`, tenant.id)
  if (!response.ok) return NextResponse.json({ error: 'Beleg nicht verfügbar' }, { status: response.status })
  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': response.headers.get('content-disposition') ?? 'attachment; filename=abrechnungsbeleg.pdf',
    },
  })
}
