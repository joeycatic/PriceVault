export type Tenant = {
  id: string
  user_id: string
  shop_name: string
  shop_url: string
  company_legal_name?: string | null
  company_size?: 'solo' | 'small' | 'medium' | 'large' | 'enterprise' | null
  industry?: 'grow_horticulture' | 'home_living' | 'electronics' | 'beauty_health' | 'sports_outdoor' | 'fashion' | 'food_beverage' | 'b2b_industrial' | 'other' | null
  shop_platform?: 'shopify' | 'woocommerce' | 'shopware' | 'magento' | 'custom' | 'marketplace' | 'unknown' | null
  headquarters_country?: string
  headquarters_city?: string | null
  annual_revenue_band?: 'under_250k' | '250k_1m' | '1m_5m' | '5m_25m' | 'over_25m' | 'undisclosed' | null
  plan: 'free' | 'trial' | 'starter' | 'pro' | 'agency'
  billing_provider?: 'viva' | null
  viva_initial_transaction_id?: string | null
  subscription_status?: 'inactive' | 'active' | 'past_due' | 'canceled'
  subscription_plan?: 'pro' | 'agency' | null
  subscription_current_period_end?: string | null
  subscription_cancel_at_period_end?: boolean
  cancellation_effective_at?: string | null
  failed_payment_count?: number
  last_payment_error?: string | null
  next_payment_retry_at?: string | null
  billing_status_metadata?: Record<string, unknown>
  billing_country?: string | null
  normalized_vat_id?: string | null
  vat_validation_status?: 'unverified' | 'valid' | 'invalid' | 'unavailable'
  vat_validated_at?: string | null
  vat_validation_reference?: string | null
  tax_treatment?: 'de_19' | 'eu_reverse_charge' | null
  automatic_repricing_suspended?: boolean
  membership_role?: 'owner' | 'admin' | 'analyst' | 'viewer' | 'billing' | 'member'
  timezone?: string
  locale?: string
  default_currency?: string
  default_scrape_freq_h?: number
  invoice_email?: string | null
  vat_id?: string | null
  billing_address?: { street?: string; postal_code?: string; city?: string; country?: string }
  notification_defaults?: Record<string, unknown>
  activation_state?: Record<string, unknown>
  created_at: string
}

export type Competitor = {
  id: string
  tenant_id: string
  shop_name: string
  base_url: string
  selector_price: string | null
  selector_stock: string | null
  scrape_freq_h: number
  active: boolean
  notes: string | null
  last_scraped_at: string | null
  created_at: string
}

export type StoreRecommendation = {
  shop_name: string
  base_url: string
  host: string
  industry: string
  profile: string
  confidence: number
  matching_terms: string[]
  reasons: string[]
}

export type Product = {
  id: string
  tenant_id: string
  name: string
  our_sku: string | null
  our_price: number | null
  our_currency: string
  active: boolean
  created_at: string
}

export type ProductVariant = {
  id: string
  tenant_id: string
  product_id: string
  name: string
  sku: string | null
  gtin: string | null
  attributes: Record<string, string>
  our_price: number | null
  cost_price: number | null
  currency: string
  is_default: boolean
  active: boolean
  created_at: string
}

export type CompetitorProduct = {
  id: string
  tenant_id: string
  product_id: string
  variant_id: string
  competitor_id: string
  competitor_url: string
  competitor_sku: string | null
  selector_price: string | null
  active: boolean
  health_status: 'healthy' | 'degraded' | 'broken' | 'blocked'
  consecutive_failures: number
  last_failure_at: string | null
  last_failure_reason: string | null
  last_successful_scrape_at: string | null
  broken_reason: string | null
  repaired_at: string | null
  created_at: string
}

export type MatchSuggestion = {
  id: string
  tenant_id: string
  product_id: string
  variant_id: string
  competitor_id: string
  candidate_url: string
  candidate_title: string
  confidence: number
  match_method: 'gtin' | 'fuzzy'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  products: { name: string } | null
  product_variants: { name: string; sku: string | null; gtin: string | null } | null
  competitors: { shop_name: string } | null
}

export type PriceSnapshot = {
  id: string
  tenant_id: string
  competitor_product_id: string
  price: number | null
  currency: string
  in_stock: boolean | null
  raw_price_text: string | null
  scrape_ok: boolean
  error_msg: string | null
  scraped_at: string
}

export type Alert = {
  id: string
  tenant_id: string
  product_id: string | null
  competitor_id: string | null
  condition: 'below_pct' | 'above_pct' | 'below_abs' | 'above_abs' | 'out_of_stock' | 'back_in_stock' | 'undercut_abs' | 'price_drop' | 'price_rise' | 'source_broken'
  threshold: number | null
  threshold_unit: 'percent' | 'absolute'
  notify_email: string
  active: boolean
  last_triggered_at: string | null
  cooldown_h: number
  created_at: string
}

export type LatestPrice = {
  competitor_product_id: string
  tenant_id: string
  product_id: string
  variant_id: string
  competitor_id: string
  competitor_url: string
  health_status: 'healthy' | 'degraded' | 'broken' | 'blocked'
  consecutive_failures: number
  last_failure_at: string | null
  last_failure_reason: string | null
  last_successful_scrape_at: string | null
  broken_reason: string | null
  product_name: string
  variant_name: string
  variant_sku: string | null
  variant_gtin: string | null
  our_price: number | null
  our_currency: string
  competitor_shop: string
  competitor_price: number | null
  in_stock: boolean | null
  scraped_at: string | null
  scrape_ok: boolean | null
  delta_pct: number | null
}
