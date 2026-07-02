export type Tenant = {
  id: string
  user_id: string
  shop_name: string
  shop_url: string
  plan: 'free' | 'trial' | 'starter' | 'pro' | 'agency'
  billing_provider?: 'viva' | null
  viva_initial_transaction_id?: string | null
  subscription_status?: 'inactive' | 'active' | 'past_due' | 'canceled'
  subscription_plan?: 'pro' | 'agency' | null
  subscription_current_period_end?: string | null
  membership_role?: 'owner' | 'admin' | 'member'
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

export type CompetitorProduct = {
  id: string
  tenant_id: string
  product_id: string
  competitor_id: string
  competitor_url: string
  competitor_sku: string | null
  selector_price: string | null
  active: boolean
  created_at: string
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
  condition: 'below_pct' | 'above_pct' | 'below_abs' | 'above_abs'
  threshold: number
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
  competitor_id: string
  competitor_url: string
  product_name: string
  our_price: number | null
  our_currency: string
  competitor_shop: string
  competitor_price: number | null
  in_stock: boolean | null
  scraped_at: string | null
  scrape_ok: boolean | null
  delta_pct: number | null
}
