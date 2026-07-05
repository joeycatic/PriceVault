import { redirect } from 'next/navigation'

import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { createClient } from '@/lib/supabase/server'

import { saveFirstProduct, saveFirstSource, saveShop } from './actions'

function safeNextPath(value: string | string[] | undefined) {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/dashboard')) return null
  if (value.startsWith('//')) return null
  return value
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('tenants')
    .select('*')
    .limit(1)
    .maybeSingle()

  const [productResult, competitorResult, mappingResult] = shop
    ? await Promise.all([
        supabase.from('products').select('id, name').eq('tenant_id', shop.id).eq('active', true).order('created_at'),
        supabase.from('competitors').select('id, shop_name').eq('tenant_id', shop.id).eq('active', true).order('created_at'),
        supabase.from('competitor_products').select('id', { count: 'exact', head: true }).eq('tenant_id', shop.id).eq('active', true),
      ])
    : [{ data: [] }, { data: [] }, { count: 0 }]

  const products = productResult.data ?? []
  const competitors = competitorResult.data ?? []
  const initialStep = !shop ? 1 : !products.length ? 2 : !competitors.length || !mappingResult.count ? 3 : 4
  const params = searchParams ? await searchParams : {}
  const accountSetupHint = params.account_setup === '1'
  const postSetupHref = safeNextPath(params.next) ?? '/dashboard'
  const metadata = user.user_metadata as Record<string, unknown>
  const signupPrefill = {
    company_legal_name: metadataText(metadata, 'signup_company_legal_name'),
    shop_name: metadataText(metadata, 'signup_shop_name'),
    shop_url: metadataText(metadata, 'signup_shop_url'),
    industry: metadataText(metadata, 'signup_industry'),
    company_size: metadataText(metadata, 'signup_company_size'),
    shop_platform: metadataText(metadata, 'signup_shop_platform'),
    headquarters_country: metadataText(metadata, 'signup_headquarters_country'),
    headquarters_city: metadataText(metadata, 'signup_headquarters_city'),
    annual_revenue_band: metadataText(metadata, 'signup_annual_revenue_band'),
  }

  return (
    <OnboardingWizard
      initialStep={initialStep}
      initialShop={shop}
      signupPrefill={signupPrefill}
      initialProducts={products}
      initialCompetitors={competitors}
      email={user.email ?? 'Konto'}
      saveShop={saveShop}
      saveProduct={saveFirstProduct}
      saveSource={saveFirstSource}
      accountSetupHint={accountSetupHint}
      postSetupHref={postSetupHref}
    />
  )
}
