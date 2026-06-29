'use server'

import { revalidatePath } from 'next/cache'

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

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

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

  const query = tenant
    ? supabase.from('tenants').update({ shop_name: shopName, shop_url: shopUrl }).eq('id', tenant.id)
    : supabase.from('tenants').insert({ user_id: user.id, shop_name: shopName, shop_url: shopUrl })
  const { error } = await query
  if (error) return { ok: false, message: 'Der Shop konnte nicht gespeichert werden.' }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Shop gespeichert.', id: tenant?.id, name: shopName }
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

  const { error: mappingError } = await supabase.from('competitor_products').upsert(
    {
      tenant_id: tenant.id,
      product_id: productId,
      competitor_id: competitorId,
      competitor_url: productUrl,
      selector_price: selectorPrice || null,
      active: true,
    },
    { onConflict: 'product_id,competitor_id' },
  )
  if (mappingError) {
    if (createdCompetitorId) {
      await supabase.from('competitors').delete().eq('tenant_id', tenant.id).eq('id', createdCompetitorId)
    }
    return { ok: false, message: 'Die Preisquelle konnte nicht verbunden werden.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Preisquelle verbunden.', id: competitorId }
}
