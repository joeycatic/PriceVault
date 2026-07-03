'use server'

import { revalidatePath } from 'next/cache'

import { backendFetch } from '@/lib/backend'
import { planLimit } from '@/lib/plan-gates'
import { parsePriceInput } from '@/lib/priceInput'
import { createClient } from '@/lib/supabase/server'

export type OnboardingResult = {
  ok: boolean
  message: string
  id?: string
  name?: string
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function authenticatedTenant() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, tenant: null }

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, plan, user_id, created_at')
    .order('created_at', { ascending: true })

  const tenant = tenants?.find((item) => item.user_id === user.id) ?? tenants?.[0] ?? null
  return { supabase, user, tenant }
}

export async function saveShop(formData: FormData): Promise<OnboardingResult> {
  const shopName = text(formData, 'shop_name')
  const shopUrl = text(formData, 'shop_url')
  if (!shopName || !validHttpUrl(shopUrl)) {
    return { ok: false, message: 'Bitte gib einen Shopnamen und eine gültige URL an.' }
  }

  const { supabase, user, tenant } = await authenticatedTenant()
  if (!user) return { ok: false, message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' }

  let tenantId = tenant?.id ?? null
  if (tenant) {
    if (tenant.user_id !== user.id) {
      return { ok: false, message: 'Nur Owner dürfen den Shop bearbeiten.' }
    }
    const { error } = await supabase
      .from('tenants')
      .update({ shop_name: shopName, shop_url: shopUrl })
      .eq('id', tenant.id)
    if (error) return { ok: false, message: 'Der Shop konnte nicht gespeichert werden.' }
  } else {
    const { data, error } = await supabase
      .from('tenants')
      .insert({ user_id: user.id, shop_name: shopName, shop_url: shopUrl })
      .select('id')
      .single()
    if (error || !data) return { ok: false, message: 'Der Shop konnte nicht gespeichert werden.' }
    tenantId = data.id
    if (user.email) {
      try {
        await backendFetch('/onboarding/sequence', tenantId, {
          method: 'POST',
          body: JSON.stringify({ email: user.email }),
        })
      } catch {
        // Email scheduling must not block tenant setup.
      }
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Shop gespeichert.', id: tenantId ?? undefined, name: shopName }
}

export async function saveFirstProduct(formData: FormData): Promise<OnboardingResult> {
  const name = text(formData, 'name')
  const sku = text(formData, 'our_sku')
  const rawPrice = text(formData, 'our_price')
  const price = rawPrice ? parsePriceInput(rawPrice) : null
  if (!name || (rawPrice && price === null) || (price !== null && price < 0)) {
    return { ok: false, message: 'Bitte prüfe Produktname und Preis.' }
  }

  const { supabase, user, tenant } = await authenticatedTenant()
  if (!user) return { ok: false, message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' }
  if (!tenant) return { ok: false, message: 'Speichere zuerst deinen Shop.' }

  const limit = planLimit(tenant.plan).products
  if (limit !== null) {
    const { count, error: countError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('active', true)
    if (countError) return { ok: false, message: 'Das Produktlimit konnte nicht geprüft werden.' }
    if ((count ?? 0) >= limit) {
      return { ok: false, message: `Dein Plan erlaubt maximal ${limit} aktive Produkte.` }
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id: tenant.id,
      name,
      our_sku: sku || null,
      our_price: price,
      our_currency: 'EUR',
    })
    .select('id, name')
    .single()
  if (error || !data) return { ok: false, message: 'Das Produkt konnte nicht gespeichert werden.' }
  const { error: variantError } = await supabase.from('product_variants').insert({
    tenant_id: tenant.id,
    product_id: data.id,
    name: 'Standard',
    sku: sku || null,
    our_price: price,
    currency: 'EUR',
    is_default: true,
  })
  if (variantError) {
    await supabase.from('products').delete().eq('tenant_id', tenant.id).eq('id', data.id)
    return { ok: false, message: 'Die Standardvariante konnte nicht gespeichert werden.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/products')
  revalidatePath('/onboarding')
  return { ok: true, message: 'Produkt gespeichert.', id: data.id, name: data.name }
}

export async function saveFirstSource(formData: FormData): Promise<OnboardingResult> {
  const productId = text(formData, 'product_id')
  const existingCompetitorId = text(formData, 'competitor_id')
  const shopName = text(formData, 'shop_name')
  const baseUrl = text(formData, 'base_url')
  const productUrl = text(formData, 'competitor_url')
  const selectorPrice = text(formData, 'selector_price')

  if (!productId || !validHttpUrl(productUrl)) {
    return { ok: false, message: 'Wähle ein Produkt und gib eine gültige Produkt-URL an.' }
  }
  if (!existingCompetitorId && (!shopName || !validHttpUrl(baseUrl))) {
    return { ok: false, message: 'Bitte gib Name und URL des Mitbewerbers an.' }
  }

  const { supabase, user, tenant } = await authenticatedTenant()
  if (!user) return { ok: false, message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.' }
  if (!tenant) return { ok: false, message: 'Speichere zuerst deinen Shop.' }

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('id', productId)
    .maybeSingle()
  if (!product) return { ok: false, message: 'Das ausgewählte Produkt wurde nicht gefunden.' }
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('product_id', productId)
    .eq('is_default', true)
    .maybeSingle()
  if (!variant) return { ok: false, message: 'Für das Produkt fehlt eine Standardvariante.' }

  let competitorId = existingCompetitorId
  let createdCompetitorId: string | null = null
  if (competitorId) {
    const { data: competitor } = await supabase
      .from('competitors')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('id', competitorId)
      .maybeSingle()
    if (!competitor) return { ok: false, message: 'Der ausgewählte Mitbewerber wurde nicht gefunden.' }
  } else {
    const { data: competitor, error } = await supabase
      .from('competitors')
      .insert({ tenant_id: tenant.id, shop_name: shopName, base_url: baseUrl })
      .select('id')
      .single()
    if (error || !competitor) {
      return { ok: false, message: 'Der Mitbewerber konnte nicht gespeichert werden.' }
    }
    competitorId = competitor.id
    createdCompetitorId = competitor.id
  }

  const { data: mapping, error: mappingError } = await supabase.from('competitor_products').upsert(
    {
      tenant_id: tenant.id,
      product_id: productId,
      variant_id: variant.id,
      competitor_id: competitorId,
      competitor_url: productUrl,
      selector_price: selectorPrice || null,
      active: true,
    },
    { onConflict: 'product_id,competitor_id' },
  )
    .select('id')
    .single()
  if (mappingError) {
    if (createdCompetitorId) {
      await supabase.from('competitors').delete().eq('tenant_id', tenant.id).eq('id', createdCompetitorId)
    }
    return { ok: false, message: 'Die Preisquelle konnte nicht verbunden werden.' }
  }

  if (mapping?.id) {
    try {
      await backendFetch('/scrape/run', tenant.id, {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenant.id, competitor_product_ids: [mapping.id] }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      // Der automatische Abruf läuft später weiter; Onboarding darf dadurch nicht blockieren.
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Preisquelle verbunden.', id: competitorId }
}
