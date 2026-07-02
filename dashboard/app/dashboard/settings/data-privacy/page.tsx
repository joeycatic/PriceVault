import { CategoryPage } from '../CategoryPage'

export default function DataPrivacySettingsPage() {
  return (
    <CategoryPage
      eyebrow="Settings / Privacy"
      title="Data & Privacy"
      description="Datenexporte, Loeschanfragen und DSGVO-Unterlagen."
      items={[
        { label: 'Export', value: 'CSV/PDF' },
        { label: 'Loeschen', value: 'Request' },
        { label: 'DPA', value: 'verfuegbar' },
        { label: 'Kontakt', value: 'DSGVO' },
      ]}
      links={[
        { href: '/datenschutz', label: 'Datenschutz' },
        { href: '/dpa', label: 'DPA / AVV' },
        { href: '/widerruf', label: 'Kuendigung' },
      ]}
    />
  )
}
