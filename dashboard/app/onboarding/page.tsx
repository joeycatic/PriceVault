import { redirect } from 'next/navigation'

import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { createClient } from '@/lib/supabase/server'

import { saveFirstProduct, saveFirstSource, saveShop } from './actions'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('tenants')
    .select('id, shop_name, shop_url')
    .eq('user_id', user.id)
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

  return (
    <OnboardingWizard
      initialStep={initialStep}
      initialShop={shop ? { shop_name: shop.shop_name, shop_url: shop.shop_url } : null}
      initialProducts={products}
      initialCompetitors={competitors}
      email={user.email ?? 'Konto'}
      saveShop={saveShop}
      saveProduct={saveFirstProduct}
      saveSource={saveFirstSource}
    />
  )
}
