import { revalidatePath } from 'next/cache'

import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan, planLimit } from '@/lib/plan-gates'

type TeamMemberRow = {
  id: string
  user_id: string
  role: string
  accepted: boolean
}

async function inviteMember(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  await backendFetch('/team/invite', tenant.id, {
    method: 'POST',
    body: JSON.stringify({
      email: String(formData.get('email') ?? ''),
      role: String(formData.get('role') ?? 'member'),
    }),
  })
  revalidatePath('/dashboard/settings/team')
}

async function removeMember(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  await backendFetch(`/team/${String(formData.get('user_id'))}`, tenant.id, { method: 'DELETE' })
  revalidatePath('/dashboard/settings/team')
}

export default async function TeamPage() {
  const tenant = await currentTenant()
  const canManageTeam =
    hasPlan(tenant?.plan, 'agency') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  const limits = planLimit(tenant?.plan)
  let data: TeamMemberRow[] = []
  if (tenant) {
    const response = await backendFetch('/team', tenant.id)
    if (response.ok) data = (await response.json()) as TeamMemberRow[]
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Agency</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Team</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Lade weitere Personen in deinen PriceVault-Mandanten ein. Dein aktuelles Sitzlimit: {limits.seats}.
        </p>
      </header>
      {!canManageTeam && (
        <div className="panel mb-6 border-l-2 border-l-vault-lime p-5 text-sm text-vault-300">
          Teamverwaltung ist im Agency-Plan verfügbar.
        </div>
      )}
      <section className="panel p-5">
        <form action={inviteMember}>
          <fieldset className="grid gap-3 md:grid-cols-[1fr_180px_auto]" disabled={!canManageTeam}>
            <label>
              <span className="field-label">E-Mail</span>
              <input className="field" name="email" type="email" required />
            </label>
            <label>
              <span className="field-label">Rolle</span>
              <select className="field" name="role" defaultValue="member">
                <option value="member">Mitglied</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button className="button-primary self-end">Einladen</button>
          </fieldset>
        </form>
      </section>
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Mitglieder</div>
        <div className="divide-y divide-vault-700/70">
          {data.map((member) => (
            <article key={member.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-mono text-sm">{member.user_id}</h2>
                <p className="mt-1 text-xs text-vault-500">{member.role} · {member.accepted ? 'aktiv' : 'eingeladen'}</p>
              </div>
              {canManageTeam && (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <button className="text-xs font-semibold text-red-300">Entfernen</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
