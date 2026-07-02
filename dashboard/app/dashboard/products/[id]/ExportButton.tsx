export function ExportButton({ competitorProductId }: { competitorProductId: string }) {
  return (
    <div className="flex items-center gap-2">
      <a
        className="button-secondary min-h-9 px-3 py-2 text-xs"
        href={`/api/export/csv?competitor_product_id=${competitorProductId}&days=30`}
      >
        CSV
      </a>
      <a
        className="button-secondary min-h-9 px-3 py-2 text-xs"
        href={`/api/export/pdf?competitor_product_id=${competitorProductId}&days=30`}
      >
        PDF
      </a>
    </div>
  )
}
