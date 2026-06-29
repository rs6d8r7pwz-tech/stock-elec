import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Petite requête quotidienne (déclenchée par le cron Vercel) pour garder le
// projet Supabase actif et éviter sa mise en pause après ~7 jours d'inactivité.
export async function GET() {
  try {
    // 1) Garde le projet Supabase actif
    await supabase.from('components').select('id', { count: 'exact', head: true })

    // 2) Nettoyage : notes de frais classées depuis plus de 30 jours -> suppression (lignes + PDF)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: vieilles } = await supabase
      .from('notes_frais')
      .select('id, pdf_path')
      .eq('status', 'classee')
      .lt('reviewed_at', cutoff)
    let removed = 0
    if (vieilles && vieilles.length) {
      const paths = vieilles.map((n: any) => n.pdf_path).filter(Boolean)
      if (paths.length) await supabase.storage.from('notes-frais').remove(paths)
      await supabase.from('notes_frais').delete().in('id', vieilles.map((n: any) => n.id))
      removed = vieilles.length
    }
    return NextResponse.json({ ok: true, removed, at: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
