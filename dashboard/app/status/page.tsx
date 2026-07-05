import Link from 'next/link'
import { backendBaseUrl } from '@/lib/backend'

export const metadata = { title: 'Systemstatus · PriceVault' }

const services = ['Dashboard', 'API', 'Preisabrufe', 'Benachrichtigungen', 'Abrechnung']

type Incident = { id: string; title: string; message: string; status: string; severity: string; affected_services: string[]; started_at: string; resolved_at: string | null }

export default async function StatusPage() {
  let incidents: Incident[] = []
  let available = false
  const backend = backendBaseUrl()
  if (backend) {
    try {
      const response = await fetch(`${backend}/public/status`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json() as { incidents: Incident[] }
        incidents = payload.incidents
        available = true
      }
    } catch { /* public status remains safely unknown */ }
  }
  const active = incidents.filter((incident) => incident.status !== 'resolved')
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link className="text-sm font-semibold text-merchant-success" href="/">← PriceVault</Link>
      <p className="eyebrow mt-12">Systemstatus</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">PriceVault Dienste</h1>
      <p className="mt-4 text-vault-400">Diese Seite informiert über bestätigte Betriebsstörungen. Der technische Zustand wird vom Betriebsteam geprüft und bei Vorfällen aktualisiert.</p>
      <section className="panel mt-10 overflow-hidden" aria-labelledby="services-heading">
        <div className="border-b border-vault-700 px-5 py-4">
          <h2 id="services-heading" className="font-semibold">Dienste</h2>
        </div>
        <div className="divide-y divide-vault-700">
          {services.map((service) => (
            <div className="flex items-center justify-between px-5 py-4" key={service}>
              <span>{service}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${active.some((incident) => incident.affected_services.includes(service)) ? 'bg-amber-50 text-amber-800' : available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{active.some((incident) => incident.affected_services.includes(service)) ? 'Beeinträchtigt' : available ? 'Betriebsbereit' : 'Status wird geprüft'}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel mt-6 overflow-hidden" aria-labelledby="incidents-heading">
        <div className="border-b border-vault-700 px-5 py-4"><h2 id="incidents-heading" className="font-semibold">Vorfallsmeldungen</h2></div>
        <div className="divide-y divide-vault-700">
          {incidents.map((incident) => <article key={incident.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{incident.title}</h3><span className="text-xs font-semibold">{incident.status === 'resolved' ? 'Behoben' : incident.status === 'monitoring' ? 'Beobachtung' : 'In Bearbeitung'}</span></div><p className="mt-2 text-sm leading-6 text-vault-400">{incident.message}</p><p className="mt-3 text-xs text-vault-500">Beginn: {new Date(incident.started_at).toLocaleString('de-DE')}</p></article>)}
          {!incidents.length && <p className="p-5 text-sm text-vault-400">Keine veröffentlichten Vorfälle.</p>}
        </div>
      </section>
      <p className="mt-8 text-sm text-vault-500">Supportziele: Abrechnung und Sicherheit innerhalb eines Werktags; defekte Quellen in bezahlten Plänen und allgemeine Anfragen innerhalb von zwei Werktagen.</p>
    </main>
  )
}
