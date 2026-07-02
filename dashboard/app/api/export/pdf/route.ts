import { NextRequest, NextResponse } from 'next/server'

import { backendBaseUrl } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const base = backendBaseUrl()
  if (!tenant || !base || !session?.access_token) {
    return NextResponse.json({ error: 'Export nicht verfügbar' }, { status: 503 })
  }

  const params = request.nextUrl.searchParams
  const response = await fetch(`${base}/export/pdf?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': tenant.id,
    },
  })
  if (!response.ok) return NextResponse.json({ error: 'Export fehlgeschlagen' }, { status: response.status })
  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': response.headers.get('content-disposition') ?? 'attachment; filename=preisverlauf.pdf',
    },
  })
}
