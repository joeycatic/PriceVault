'use server'

import { revalidatePath } from 'next/cache'

import { backendFetch, currentTenant } from '@/lib/backend'

type ActionResult = { ok: boolean; message: string }

export async function runManualScrape(formData: FormData): Promise<ActionResult> {
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }

  const mappingId = String(formData.get('competitor_product_id') ?? '').trim()
  const body = {
    tenant_id: tenant.id,
    competitor_product_ids: mappingId ? [mappingId] : null,
  }

  try {
    const response = await backendFetch('/scrape/run', tenant.id, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      return { ok: false, message: `Scrape konnte nicht gestartet werden (${response.status}).` }
    }

    const payload = (await response.json()) as {
      triggered?: number
      queued?: number
      results?: Array<{ scrape_ok?: boolean }>
    }
    const triggered = payload.triggered ?? payload.results?.length ?? 0
    const queued = payload.queued ?? triggered
    const failed = payload.results?.filter((result) => !result.scrape_ok).length ?? 0

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/products')

    if (!triggered) return { ok: false, message: 'Keine aktive Preisquelle zum Scrapen gefunden.' }
    if (failed) {
      return { ok: false, message: `${triggered} Abruf(e) ausgeführt, ${failed} davon fehlgeschlagen.` }
    }

    return { ok: true, message: `${queued} Preisabruf(e) wurden eingeplant.` }
  } catch {
    return { ok: false, message: 'Backend nicht erreichbar oder Scrape-Zeitlimit überschritten.' }
  }
}
