import { describe, expect, it } from 'vitest'

import { formatPriceInput, parsePriceInput } from '@/lib/priceInput'

describe('price input helpers', () => {
  it('parses DACH and international price strings', () => {
    expect(parsePriceInput('199,90 EUR')).toBe(199.9)
    expect(parsePriceInput('1.299,50 EUR')).toBe(1299.5)
    expect(parsePriceInput('1,299.50')).toBe(1299.5)
    expect(parsePriceInput('1299')).toBe(1299)
  })

  it('formats valid positive values for German display', () => {
    expect(formatPriceInput('199.9')).toBe('199,90')
    expect(formatPriceInput('1.299,5')).toBe('1.299,50')
  })

  it('preserves invalid or negative values for form validation', () => {
    expect(parsePriceInput('')).toBeNull()
    expect(formatPriceInput('-1')).toBe('-1')
  })
})
