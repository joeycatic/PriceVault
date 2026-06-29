export function parsePriceInput(value: string) {
  const cleaned = value.trim().replace(/[^\d.,-]/g, '')
  if (!cleaned) return null

  const sign = cleaned.startsWith('-') ? '-' : ''
  const unsigned = sign ? cleaned.slice(1) : cleaned
  const separators = Array.from(unsigned.matchAll(/[,.]/g))

  if (separators.length === 0) {
    const price = Number(`${sign}${unsigned}`)
    return Number.isFinite(price) ? price : null
  }

  if (separators.length === 1) {
    const separatorIndex = separators[0].index ?? -1
    const integerPart = unsigned.slice(0, separatorIndex)
    const decimalPart = unsigned.slice(separatorIndex + 1)
    const looksLikeThousandsSeparator = decimalPart.length === 3 && integerPart.length >= 1 && integerPart.length <= 3
    const normalized = looksLikeThousandsSeparator
      ? `${sign}${integerPart}${decimalPart}`
      : `${sign}${integerPart}.${decimalPart}`
    const price = Number(normalized)

    return Number.isFinite(price) ? price : null
  }

  const decimalIndex = Math.max(unsigned.lastIndexOf(','), unsigned.lastIndexOf('.'))
  const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '')
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '')
  const price = Number(`${sign}${integerPart}.${decimalPart}`)

  return Number.isFinite(price) ? price : null
}

export function formatPriceInput(value: string) {
  const price = parsePriceInput(value)
  if (price === null || price < 0) return value.trim()

  return price.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
