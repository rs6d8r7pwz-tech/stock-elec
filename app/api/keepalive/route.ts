import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Petite requête quotidienne (déclenchée par le cron Vercel) pour garder le
// projet Supabase actif et éviter sa mise en pause après ~7 jours d'inactivité.
export async function GET() {
  try {
    const { error } = await supabase
      .from('components')
      .select('id', { count: 'exact', head: true })
    return NextResponse.json({ ok: !error, at: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
