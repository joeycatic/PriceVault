export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-label="Dashboard wird geladen" role="status">
      <div className="mb-8 border-b border-vault-700 pb-7">
        <div className="h-3 w-36 bg-vault-700" />
        <div className="mt-4 h-10 w-72 max-w-full bg-vault-800" />
        <div className="mt-3 h-4 w-96 max-w-full bg-vault-800" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="h-24 border border-vault-700 bg-vault-900" />)}
      </div>
      <div className="mt-6 h-72 border border-vault-700 bg-vault-900" />
    </div>
  )
}
