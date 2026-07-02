import { legalInfo } from '@/lib/legal'

export default function CancellationPage() {
  const legal = legalInfo()
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow">Cancellation</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Kuendigung und Rueckerstattung</h1>
      <section className="panel mt-8 space-y-5 p-6 text-sm leading-7 text-vault-200">
        <p>Kunden koennen kostenpflichtige Plaene zum Ende des laufenden Abrechnungszeitraums kuendigen.</p>
        <p>Bereits gestartete Abrechnungszeitraeume werden grundsaetzlich nicht anteilig erstattet, ausser gesetzliche Rechte oder eine schriftliche Kulanzzusage greifen.</p>
        <p>Bei Fehlbuchungen, doppelten Zahlungen oder nicht bereitgestelltem Service prueft PriceVault Rueckerstattungen zeitnah.</p>
        <p>Anfragen: <a className="text-vault-lime" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
      </section>
    </main>
  )
}
