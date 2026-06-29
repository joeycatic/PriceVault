'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

type ActionResult = { ok: boolean; message: string }

export async function runManualScrape(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }

  const backendUrl = process.env.BACKEND_URL
  if (!backendUrl) return { ok: false, message: 'BACKEND_URL ist nicht konfiguriert.' }

  const mappingId = String(formData.get('competitor_product_id') ?? '').trim()
  const body = {
    tenant_id: tenant.id,
    competitor_product_ids: mappingId ? [mappingId] : null,
  }

  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/scrape/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenant.id,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      return { ok: false, message: `Scrape konnte nicht gestartet werden (${response.status}).` }
    }

    const payload = (await response.json()) as {
      triggered?: number
      results?: Array<{ scrape_ok?: boolean }>
    }
    const triggered = payload.triggered ?? payload.results?.length ?? 0
    const failed = payload.results?.filter((result) => !result.scrape_ok).length ?? 0

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/products')

    if (!triggered) return { ok: false, message: 'Keine aktive Preisquelle zum Scrapen gefunden.' }
    if (failed) {
      return { ok: false, message: `${triggered} Abruf(e) ausgeführt, ${failed} davon fehlgeschlagen.` }
    }

    return { ok: true, message: `${triggered} Preisabruf(e) abgeschlossen.` }
  } catch {
    return { ok: false, message: 'Backend nicht erreichbar oder Scrape-Zeitlimit überschritten.' }
  }
}
