import { revalidatePath } from 'next/cache'

import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan, planLimit } from '@/lib/plan-gates'
import { TeamInviteForm } from './TeamForm'

type TeamMemberRow = {
  id: string
  user_id: string
  role: string
  accepted: boolean
}

async function inviteMember(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  try {
    const response = await backendFetch('/team/invite', tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        email: String(formData.get('email') ?? ''),
        role: String(formData.get('role') ?? 'member'),
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, message: payload.detail ?? 'Die Einladung konnte nicht gesendet werden.' }
    }
  } catch {
    return { ok: false, message: 'Die API ist nicht erreichbar. Starte den Backend-Server und versuche es erneut.' }
  }
  revalidatePath('/dashboard/settings/team')
  return { ok: true, message: 'Einladung wurde gesendet.' }
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
  let loadError: string | null = null
  if (tenant) {
    try {
      const response = await backendFetch('/team', tenant.id)
      if (response.ok) {
        data = (await response.json()) as TeamMemberRow[]
      } else {
        loadError = 'Teammitglieder konnten nicht geladen werden.'
      }
    } catch {
      loadError = 'Die API ist nicht erreichbar. Starte den Backend-Server, um Teammitglieder zu laden.'
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Team"
        description={<>Lade weitere Personen in deinen PriceVault-Mandanten ein. Dein aktuelles Sitzlimit: {limits.seats}.</>}
      />
      {!canManageTeam && (
        <div className="panel mb-6 border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Teamverwaltung ist im Agency-Plan verfügbar.
        </div>
      )}
      <section className="panel p-5">
        <TeamInviteForm action={inviteMember} disabled={!canManageTeam} />
      </section>
      {loadError && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      )}
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
                  <button className="text-xs font-semibold text-red-700">Entfernen</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
