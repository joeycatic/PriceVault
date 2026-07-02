import { legalInfo } from '@/lib/legal'

export default function ImpressumPage() {
  const legal = legalInfo()
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Impressum</h1>
      <section className="panel mt-8 space-y-4 p-6 text-sm leading-7 text-vault-200">
        <p><strong>{legal.company}</strong></p>
        <p>{legal.address}</p>
        {legal.managingDirector && <p>Vertreten durch: {legal.managingDirector}</p>}
        {legal.register && <p>Register: {legal.register}</p>}
        {legal.vatId && <p>USt-ID: {legal.vatId}</p>}
        <p>E-Mail: <a className="text-vault-lime" href={`mailto:${legal.email}`}>{legal.email}</a></p>
        {legal.phone && <p>Telefon: {legal.phone}</p>}
        <p>Verantwortlich fuer den Inhalt nach § 18 Abs. 2 MStV: {legal.company}.</p>
      </section>
    </main>
  )
}
