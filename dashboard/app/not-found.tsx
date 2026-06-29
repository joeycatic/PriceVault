import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="panel w-full max-w-lg p-7 text-center sm:p-10">
        <p className="font-mono text-xs text-vault-lime">404 / NICHT GEFUNDEN</p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">Diese Seite existiert nicht.</h1>
        <p className="mt-3 text-sm text-vault-300">Der Link ist möglicherweise veraltet oder die Ressource wurde entfernt.</p>
        <Link href="/" className="button-primary mt-7">Zurück zu PriceVault</Link>
      </section>
    </main>
  )
}
