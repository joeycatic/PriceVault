export const COMPANY_SIZE_OPTIONS = [
  { value: 'solo', label: '1 Person' },
  { value: 'small', label: '2–10 Mitarbeitende' },
  { value: 'medium', label: '11–50 Mitarbeitende' },
  { value: 'large', label: '51–250 Mitarbeitende' },
  { value: 'enterprise', label: 'Mehr als 250 Mitarbeitende' },
] as const

export const INDUSTRY_OPTIONS = [
  { value: 'grow_horticulture', label: 'Grow / Gartenbau' },
  { value: 'home_living', label: 'Home & Living' },
  { value: 'electronics', label: 'Elektronik' },
  { value: 'beauty_health', label: 'Beauty & Gesundheit' },
  { value: 'sports_outdoor', label: 'Sport & Outdoor' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'b2b_industrial', label: 'B2B / Industriebedarf' },
  { value: 'other', label: 'Andere Branche' },
] as const

export const SHOP_PLATFORM_OPTIONS = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'shopware', label: 'Shopware' },
  { value: 'magento', label: 'Magento / Adobe Commerce' },
  { value: 'custom', label: 'Eigenentwicklung' },
  { value: 'marketplace', label: 'Marketplace-first' },
  { value: 'unknown', label: 'Noch offen' },
] as const

export const REVENUE_BAND_OPTIONS = [
  { value: 'under_250k', label: 'Unter 250.000 €' },
  { value: '250k_1m', label: '250.000 € – 1 Mio. €' },
  { value: '1m_5m', label: '1–5 Mio. €' },
  { value: '5m_25m', label: '5–25 Mio. €' },
  { value: 'over_25m', label: 'Mehr als 25 Mio. €' },
  { value: 'undisclosed', label: 'Keine Angabe' },
] as const

export const COUNTRY_OPTIONS = [
  { value: 'DE', label: 'Deutschland' },
  { value: 'AT', label: 'Österreich' },
  { value: 'CH', label: 'Schweiz' },
  { value: 'NL', label: 'Niederlande' },
  { value: 'EU', label: 'Andere EU-Märkte' },
] as const

export function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return 'Nicht hinterlegt'
  return options.find((option) => option.value === value)?.label ?? value
}

export function optionValues(options: ReadonlyArray<{ value: string; label: string }>) {
  return new Set(options.map((option) => option.value))
}
