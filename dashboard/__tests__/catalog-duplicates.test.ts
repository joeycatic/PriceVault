import { describe, expect, it } from 'vitest'

import { catalogDuplicateReason, createDuplicateIndex } from '@/lib/catalog-duplicates'

const index = createDuplicateIndex(
  [{ name: 'Grow Lampe 300W', our_sku: 'GL-300' }],
  [{
    sku: 'VAR-1',
    gtin: '1234567890123',
    external_refs: { catalog_url: 'https://shop.de/products/grow-lampe?variant=1' },
  }],
)

describe('catalog duplicate matching', () => {
  it('matches source URL before identifiers', () => {
    expect(catalogDuplicateReason({
      name: 'Andere Lampe',
      url: 'https://shop.de/products/grow-lampe/',
      sku: null,
      gtin: null,
    }, index)).toBe('Produkt-URL')
  })

  it('matches GTIN, SKU, and normalized product names', () => {
    expect(catalogDuplicateReason({ name: 'A', url: 'https://shop.de/products/a', sku: null, gtin: '1234567890123' }, index)).toBe('GTIN / EAN')
    expect(catalogDuplicateReason({ name: 'B', url: 'https://shop.de/products/b', sku: 'gl-300', gtin: null }, index)).toBe('SKU')
    expect(catalogDuplicateReason({ name: '  grow   lampe 300w ', url: 'https://shop.de/products/c', sku: null, gtin: null }, index)).toBe('Produktname')
  })

  it('leaves genuinely new products importable', () => {
    expect(catalogDuplicateReason({ name: 'Neu', url: 'https://shop.de/products/neu', sku: 'NEW-1', gtin: null }, index)).toBeNull()
  })
})
