import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'b.brochier@outlook.fr'
const FROM = process.env.RESEND_FROM || 'Portail Electreau <onboarding@resend.dev>'

async function sendApprovalEmail(opts: {
  account: string; label: string; userAgent: string; token: string; origin: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'RESEND_API_KEY manquant' }

  const approveUrl = `${opts.origin}/api/device-approve?token=${encodeURIComponent(opts.token)}`
  const when = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1a2636">
    <div style="background:#16294a;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
      <strong style="font-size:16px">Portail Electreau — Nouvelle demande d'appareil</strong>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 10px 10px">
      <p>Un nouvel appareil tente de se connecter pour la première fois :</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Compte</td><td style="padding:6px 0"><strong>${opts.account}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Appareil</td><td style="padding:6px 0">${opts.label}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="padding:6px 0">${when}</td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280">${opts.userAgent}</p>
      <p style="margin:22px 0">
        <a href="${approveUrl}" style="background:#d42d28;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">
          ✓ Autoriser cet appareil
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : l'appareil restera bloqué.</p>
    </div>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [ADMIN_EMAIL],
      subject: `Autorisation appareil — ${opts.account}`,
      html,
    }),
  })
  if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${await res.text()}` }
  return { sent: true }
}

export async function POST(req: NextRequest) {
  try {
    const { account, deviceId, label, userAgent } = await req.json()
    if (!account || !deviceId) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }
    const supa = getSupabaseAdmin()
    const origin = new URL(req.url).origin

    const { data: existing, error: selErr } = await supa
      .from('trusted_devices')
      .select('*')
      .eq('account', account)
      .eq('device_id', deviceId)
      .maybeSingle()
    if (selErr) throw selErr

    if (existing) {
      if (existing.status === 'approved') {
        await supa.from('trusted_devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', existing.id)
        return NextResponse.json({ status: 'approved' })
      }
      if (existing.status === 'revoked') {
        return NextResponse.json({ status: 'revoked' })
      }
      // pending : on renvoie l'email pour relancer l'admin
      const mail = await sendApprovalEmail({
        account, label: label || existing.label || 'Appareil', userAgent: userAgent || '',
        token: existing.approve_token, origin,
      })
      return NextResponse.json({ status: 'pending', emailed: mail.sent })
    }

    // Nouvel appareil -> création en attente + email
    const token = (globalThis.crypto?.randomUUID?.() ||
      Math.random().toString(36).slice(2) + Date.now().toString(36))
    const { error: insErr } = await supa.from('trusted_devices').insert({
      account, device_id: deviceId, label: label || 'Appareil',
      user_agent: userAgent || '', status: 'pending', approve_token: token,
    })
    if (insErr) throw insErr

    const mail = await sendApprovalEmail({
      account, label: label || 'Appareil', userAgent: userAgent || '', token, origin,
    })
    return NextResponse.json({ status: 'pending', emailed: mail.sent, mailError: mail.sent ? undefined : mail.reason })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
