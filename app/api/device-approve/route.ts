import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function page(title: string, message: string, ok: boolean) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#16294a;display:flex;min-height:100vh;align-items:center;justify-content:center">
    <div style="background:#fff;max-width:420px;width:90%;padding:32px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-size:42px">${ok ? '✅' : '⚠️'}</div>
      <h1 style="color:#16294a;font-size:20px;margin:12px 0 8px">${title}</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.5">${message}</p>
    </div>
  </body></html>`
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return html(page('Lien invalide', 'Aucun jeton fourni.', false), 400)
  }
  try {
    const supa = getSupabaseAdmin()
    const { data: dev, error } = await supa
      .from('trusted_devices')
      .select('*')
      .eq('approve_token', token)
      .maybeSingle()
    if (error) throw error
    if (!dev) {
      return html(page('Lien invalide ou expiré', 'Cet appareil n\'a pas été trouvé. La demande a peut-être déjà été traitée.', false), 404)
    }
    if (dev.status === 'approved') {
      return html(page('Déjà autorisé', `L'appareil « ${dev.label} » pour le compte ${dev.account} est déjà autorisé.`, true))
    }
    await supa.from('trusted_devices')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', dev.id)

    return html(page(
      'Appareil autorisé',
      `L'appareil « ${dev.label} » peut désormais se connecter au compte <b>${dev.account}</b>. L'utilisateur peut se connecter normalement.`,
      true,
    ))
  } catch (e: any) {
    return html(page('Erreur', e?.message || 'Une erreur est survenue.', false), 500)
  }
}
