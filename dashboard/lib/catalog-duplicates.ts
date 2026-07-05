export type CatalogDuplicateCandidate = {
  name: string
  url: string
  sku: string | null
  gtin: string | null
}

export type DuplicateIndex = {
  urls: Set<string>
  gtins: Set<string>
  skus: Set<string>
  names: Set<string>
}

function normalizedCatalogUrl(value: string) {
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`.toLocaleLowerCase('de-DE')
  } catch {
    return value.trim().replace(/\/$/, '').toLocaleLowerCase('de-DE')
  }
}

function normalizedCatalogText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
}

export function createDuplicateIndex(
  productRows: Array<{ name: string; our_sku: string | null }>,
  variantRows: Array<{ sku: string | null; gtin: string | null; external_refs: Record<string, unknown> | null }>,
): DuplicateIndex {
  return {
    urls: new Set(variantRows.map((row) => typeof row.external_refs?.catalog_url === 'string' ? normalizedCatalogUrl(row.external_refs.catalog_url) : '').filter(Boolean)),
    gtins: new Set(variantRows.map((row) => normalizedCatalogText(row.gtin)).filter(Boolean)),
    skus: new Set([...productRows.map((row) => normalizedCatalogText(row.our_sku)), ...variantRows.map((row) => normalizedCatalogText(row.sku))].filter(Boolean)),
    names: new Set(productRows.map((row) => normalizedCatalogText(row.name)).filter(Boolean)),
  }
}

export function catalogDuplicateReason(item: CatalogDuplicateCandidate, index: DuplicateIndex) {
  if (index.urls.has(normalizedCatalogUrl(item.url))) return 'Produkt-URL'
  if (item.gtin && index.gtins.has(normalizedCatalogText(item.gtin))) return 'GTIN / EAN'
  if (item.sku && index.skus.has(normalizedCatalogText(item.sku))) return 'SKU'
  if (index.names.has(normalizedCatalogText(item.name))) return 'Produktname'
  return null
}
