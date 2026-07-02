'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type ActionState = {
  ok: boolean
  message: string
}

export async function updateAccountProfile(_state: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) return { ok: false, message: 'Bitte gib deinen Namen ein.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } })
  if (error) return { ok: false, message: 'Profil konnte nicht gespeichert werden.' }

  revalidatePath('/dashboard/account')
  return { ok: true, message: 'Profil gespeichert.' }
}

export async function updateAccountPassword(_state: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')
  if (password.length < 8) return { ok: false, message: 'Das Passwort muss mindestens 8 Zeichen lang sein.' }
  if (password !== confirmPassword) return { ok: false, message: 'Die Passwörter stimmen nicht überein.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, message: 'Passwort konnte nicht gespeichert werden.' }

  return { ok: true, message: 'Passwort aktualisiert.' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
