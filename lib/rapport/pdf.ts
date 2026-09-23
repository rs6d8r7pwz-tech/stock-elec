'use client'
/**
 * Génération du rapport PDF client (jsPDF + autotable).
 * Page de garde + synthèse, volumes & temps de fonctionnement, une fiche par ouvrage.
 */
import type { ClientDef, FieldDef, Releve, SiteDef, Tournee, Evaluation } from './types'
import { evaluer, fmtDate, fmtNum, isIndex, num, SEUILS } from './rules'

type RGB = [number, number, number]
const NAVY: RGB = [22, 41, 74]
const RED: RGB = [212, 45, 40]
const INK: RGB = [26, 38, 54]
const GRAY: RGB = [107, 114, 128]
const LIGHT: RGB = [224, 245, 251]
const BORDER: RGB = [226, 232, 240]
const OK: RGB = [22, 163, 74]
const WARN: RGB = [180, 83, 9]
const CRIT: RGB = [220, 38, 38]
const WARN_BG: RGB = [254, 243, 199]
const CRIT_BG: RGB = [254, 226, 226]

/** Les polices standard PDF ne connaissent que le jeu WinAnsi : on remplace le reste */
function t(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/³/g, '3').replace(/²/g, '2').replace(/MΩ/g, 'MOhm').replace(/Ω/g, 'Ohm').replace(/∞/g, 'infini')
    .replace(/→/g, '->').replace(/−/g, '-').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=')
    .replace(/\u202f|\u00a0/g, ' ')
    .replace(/[^\x00-\xFF€—–’‘“”…•ŒœŸ]/g, '')
}
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1f = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const nf2f = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const nf1 = { format: (n: number) => (Math.abs(n) < 10 ? nf2f : nf1f).format(n) }

function val(v: any, f: FieldDef): string {
  if (v === undefined || v === null || v === '') return '-'
  if (v === 'INF') return 'Infini'
  if (v === 'LO') return 'LO (bas)'
  if (typeof v === 'number') return t(fmtNum(v, f.kind) + (f.unit ? ' ' + f.unit : ''))
  return t(String(v))
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo-electreau.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.onerror = () => r(null); fr.readAsDataURL(blob) })
  } catch { return null }
}

export interface PdfInput {
  client: ClientDef
  tournee: Tournee
  releves: Releve[]   // relevés de la tournée
  hist: Releve[]      // historique (hors tournée) pour les écarts et graphiques
  loadPhoto: (p: { id: string; url?: string }) => Promise<string | null>
}

interface SiteEval { site: SiteDef; rel: Releve; evals: Record<string, Evaluation> }

export async function genererRapportPdf(inp: PdfInput): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 14, CW = W - 2 * M
  const logo = await loadLogo()
  const { client, tournee } = inp

  const hist = inp.hist.filter((h) => h.tournee_id !== tournee.id)
  const bySite: Record<string, Releve> = {}
  inp.releves.forEach((r) => { bySite[r.site_id] = r })
  const faits: SiteEval[] = []
  for (const s of client.sites) {
    const rel = bySite[s.id]
    if (!rel) continue
    const evals: Record<string, Evaluation> = {}
    for (const f of s.fields) evals[f.key] = evaluer(f, rel.valeurs[f.key], s.id, rel.date_releve, hist, rel.valeurs)
    faits.push({ site: s, rel, evals })
  }
  const nonFaits = client.sites.filter((s) => !bySite[s.id])
  const dates = inp.releves.map((r) => new Date(r.date_releve).getTime()).sort((a, b) => a - b)
  const d0 = dates.length ? new Date(dates[0]).toISOString() : tournee.created_at
  const d1 = dates.length ? new Date(dates[dates.length - 1]).toISOString() : d0
  const periode = fmtDate(d0) === fmtDate(d1) ? fmtDate(d0) : `du ${fmtDate(d0)} au ${fmtDate(d1)}`
  const intervenants = Array.from(new Set(inp.releves.map((r) => r.saisi_par).filter(Boolean)))
  const alertes = faits.flatMap((fe) => fe.site.fields
    .filter((f) => ['warn', 'crit'].includes(fe.evals[f.key].niveau))
    .map((f) => ({ fe, f, ev: fe.evals[f.key] })))
  const nbCrit = alertes.filter((a) => a.ev.niveau === 'crit').length
  const nbMesures = faits.reduce((n, fe) => n + Object.keys(fe.rel.valeurs).length, 0)
  const nbPhotos = faits.reduce((n, fe) => n + (fe.rel.photos?.length || 0), 0)

  const titreSection = (y: number, txt: string, sous?: string) => {
    doc.setFillColor(...RED); doc.rect(M, y - 4.2, 1.4, 5.6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY)
    doc.text(t(txt), M + 4, y)
    if (sous) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY); doc.text(t(sous), M + 4, y + 5) }
    return y + (sous ? 10 : 6)
  }
  const enTetePage = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 12, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255)
    doc.text(t(`${client.code} — Rapport de relevés d'exploitation`), M, 7.8)
    doc.setFont('helvetica', 'normal')
    doc.text(t(periode), W - M, 7.8, { align: 'right' })
  }
  const nouvellePage = () => { doc.addPage(); enTetePage(); return 22 }

  // ════════════════ PAGE DE GARDE ════════════════
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 92, 'F')
  doc.setFillColor(...RED); doc.rect(0, 92, W, 1.6, 'F')
  if (logo) {
    doc.setFillColor(255, 255, 255); doc.roundedRect(M, 14, 62, 17, 2, 2, 'F')
    doc.addImage(logo, 'PNG', M + 3.5, 17, 55, 11.4)
  }
  doc.setTextColor(153, 217, 239); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(t('RAPPORT DE RELEVÉS D’EXPLOITATION'), M, 48)
  doc.setTextColor(255, 255, 255); doc.setFontSize(22)
  doc.text(t(client.nom), M, 60, { maxWidth: CW })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(220, 230, 245)
  doc.text(t(client.service), M, 69)
  doc.setFontSize(10)
  doc.text(t(`Tournée de relevés ${periode}`), M, 82)

  // Carte d'informations
  let y = 104
  doc.setDrawColor(...BORDER); doc.setFillColor(255, 255, 255); doc.roundedRect(M, y, CW, 32, 2, 2, 'FD')
  const info = [
    ['Client', `${client.nom} (${client.code})`],
    ['Période des relevés', periode],
    ['Intervenant(s)', intervenants.join(', ') || tournee.created_by],
    ['Édité le', fmtDate(new Date().toISOString(), true)],
  ]
  info.forEach(([k, v], i) => {
    const cx = M + 6 + (i % 2) * (CW / 2), cy = y + 10 + Math.floor(i / 2) * 13
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.text(t(k.toUpperCase()), cx, cy)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK)
    doc.text(t(v), cx, cy + 5, { maxWidth: CW / 2 - 10 })
  })

  // Indicateurs
  y = 146
  const kpis: [string, string, RGB?][] = [
    [`${faits.length} / ${client.sites.length}`, 'Ouvrages relevés'],
    [nf0.format(nbMesures), 'Mesures relevées'],
    [String(alertes.length), nbCrit ? `Points d'attention (dont ${nbCrit} critique${nbCrit > 1 ? 's' : ''})` : "Points d'attention", alertes.length ? (nbCrit ? CRIT : WARN) : OK],
    [String(nbPhotos), 'Photos jointes'],
  ]
  const kw = (CW - 3 * 4) / 4
  kpis.forEach(([v, l, c], i) => {
    const x = M + i * (kw + 4)
    doc.setFillColor(...LIGHT); doc.roundedRect(x, y, kw, 26, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...(c || NAVY)); doc.text(t(v), x + 5, y + 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY)
    doc.text(doc.splitTextToSize(t(l), kw - 8), x + 5, y + 18.5)
  })

  // Points d'attention
  y = titreSection(186, "Synthèse des points d'attention", alertes.length ? 'Valeurs hors seuils ou écarts inhabituels relevés pendant la tournée' : undefined)
  if (!alertes.length) {
    doc.setFillColor(220, 252, 231); doc.roundedRect(M, y, CW, 14, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...OK)
    doc.text(t('Aucune anomalie relevée sur les ouvrages visités.'), M + 6, y + 8.8)
    y += 20
  } else {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 22 },
      head: [['Ouvrage', 'Point de mesure', 'Valeur', 'Constat']],
      body: alertes.map(({ fe, f, ev }) => [
        t(`${fe.site.nom}\n${fe.site.commune}`), t(`${f.section} — ${f.label}`), val(fe.rel.valeurs[f.key], f),
        t((ev.niveau === 'crit' ? 'CRITIQUE — ' : '') + ev.messages.join(' ; ')),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor: INK, lineColor: BORDER, lineWidth: 0.2, valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 1: { cellWidth: 52 }, 2: { cellWidth: 24, halign: 'right' } },
      didParseCell: (d: any) => {
        if (d.section !== 'body') return
        const a = alertes[d.row.index]
        if (d.column.index === 3) { d.cell.styles.textColor = a.ev.niveau === 'crit' ? CRIT : WARN; d.cell.styles.fillColor = a.ev.niveau === 'crit' ? CRIT_BG : WARN_BG }
      },
      didDrawPage: (d: any) => { if (d.pageNumber > 1) enTetePage() },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ════════════════ VOLUMES & FONCTIONNEMENT ════════════════
  y = nouvellePage()
  y = titreSection(y, 'Volumes relevés', 'Écart entre l’index relevé et le passage précédent, et volume moyen journalier')
  const vols: { fe: SiteEval; f: FieldDef; ev: Evaluation; v: number }[] = []
  const heures: { fe: SiteEval; f: FieldDef; ev: Evaluation; v: number }[] = []
  for (const fe of faits) for (const f of fe.site.fields) {
    const v = num(fe.rel.valeurs[f.key]); if (v === null) continue
    if (f.kind === 'index_m3') vols.push({ fe, f, ev: fe.evals[f.key], v })
    if (f.kind === 'heures' && !f.key.startsWith('uv') && !f.key.includes('_uv')) heures.push({ fe, f, ev: fe.evals[f.key], v })
  }
  const prevTxt = (ev: Evaluation, f: FieldDef) => ev.precedent ? `${val(ev.precedent.valeur, f)}\n${fmtDate(ev.precedent.date)}` : '-'
  const ecartTxt = (ev: Evaluation, unit: string) => ev.diff === undefined ? '-' : `${ev.diff > 0 ? '+' : ''}${nf0.format(ev.diff)} ${unit}`
  if (vols.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 22 },
      head: [['Ouvrage', 'Compteur', 'Index relevé', 'Précédent', 'Volume', 'Moy. / jour']],
      body: vols.map(({ fe, f, ev, v }) => [t(fe.site.nom), t(f.label), t(nf0.format(v) + ' m³'), t(prevTxt(ev, f)),
        t(ecartTxt(ev, 'm³')), ev.parJour !== undefined ? t(nf1.format(ev.parJour) + ' m³/j') : '-']),
      theme: 'striped',
      styles: { fontSize: 7.8, cellPadding: 1.8, textColor: INK, valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold' }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: GRAY }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' } },
      didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 4 && (vols[d.row.index].ev.diff ?? 0) < 0) d.cell.styles.textColor = WARN },
      didDrawPage: () => enTetePage(),
    })
    y = (doc as any).lastAutoTable.finalY + 8
    // Graphique : volume moyen journalier par compteur (barres horizontales, une seule série)
    const bars = vols.filter((x) => x.ev.parJour !== undefined && x.ev.parJour >= 0)
      .map((x) => ({ l: `${x.fe.site.nom} — ${x.f.label}`, v: x.ev.parJour! }))
      .sort((a, b) => b.v - a.v).slice(0, 14)
    if (bars.length >= 2) {
      const bh = 5.2, gap = 2, hh = 12 + bars.length * (bh + gap)
      if (y + hh > H - 20) y = nouvellePage()
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...NAVY)
      doc.text(t('Volume moyen journalier depuis le passage précédent (m³/jour)'), M, y); y += 5
      const lw = 72, maxV = Math.max(...bars.map((b) => b.v)) || 1, bw = CW - lw - 22
      bars.forEach((b, i) => {
        const by = y + i * (bh + gap)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...INK)
        const lbl = doc.splitTextToSize(t(b.l), lw - 2)[0]
        doc.text(lbl, M + lw - 2, by + bh / 2 + 1.2, { align: 'right' })
        doc.setFillColor(...BORDER); doc.rect(M + lw, by, bw, bh, 'F')
        doc.setFillColor(...NAVY); doc.roundedRect(M + lw, by, Math.max(0.8, (b.v / maxV) * bw), bh, 0.8, 0.8, 'F')
        doc.setTextColor(...GRAY); doc.text(t(nf1.format(b.v)), M + lw + bw + 2, by + bh / 2 + 1.2)
      })
      y += bars.length * (bh + gap) + 6
    }
  }
  if (heures.length) {
    if (y > H - 50) y = nouvellePage()
    y = titreSection(y + 2, 'Temps de fonctionnement des pompes', 'Compteurs horaires et heures de marche depuis le passage précédent')
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 22 },
      head: [['Ouvrage', 'Pompe', 'Compteur', 'Précédent', 'Marche', 'Moy. / jour']],
      body: heures.map(({ fe, f, ev, v }) => [t(fe.site.nom), t(f.section), t(nf0.format(v) + ' h'), t(prevTxt(ev, f)),
        t(ecartTxt(ev, 'h')), ev.parJour !== undefined ? t(nf1.format(ev.parJour) + ' h/j') : '-']),
      theme: 'striped',
      styles: { fontSize: 7.8, cellPadding: 1.8, textColor: INK, valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold' }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: GRAY }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' } },
      didParseCell: (d: any) => {
        if (d.section !== 'body' || d.column.index !== 4) return
        const df = heures[d.row.index].ev.diff
        if (df !== undefined && df < 0) d.cell.styles.textColor = WARN
        if (df === 0) d.cell.styles.textColor = GRAY
      },
      didDrawPage: () => enTetePage(),
    })
  }

  // ════════════════ FICHES OUVRAGES ════════════════
  let communeCourante = ''
  y = nouvellePage()
  for (const fe of faits) {
    const { site, rel, evals } = fe
    if (y > H - 70) y = nouvellePage()
    if (site.commune !== communeCourante) {
      communeCourante = site.commune
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...RED)
      doc.text(t(site.commune.toUpperCase()), M, y); y += 3
    }
    // Bandeau ouvrage
    doc.setFillColor(...NAVY); doc.roundedRect(M, y, CW, 13, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(255, 255, 255)
    doc.text(t(site.nom), M + 4, y + 8.4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(t(`Relevé le ${fmtDate(rel.date_releve, true)} — ${rel.saisi_par}`), W - M - 4, y + 8.4, { align: 'right' })
    y += 17
    if (site.description) {
      doc.setFontSize(7.8); doc.setTextColor(...GRAY)
      const lines = doc.splitTextToSize(t(site.description), CW)
      doc.text(lines, M, y); y += lines.length * 3.4 + 1.5
    }
    const nbA = site.fields.filter((f) => ['warn', 'crit'].includes(evals[f.key].niveau)).length
    // Tableau des mesures (lignes de section)
    const body: any[] = []
    const meta: ({ f: FieldDef } | null)[] = []
    let sec = ''
    for (const f of site.fields) {
      if (f.section !== sec) {
        sec = f.section
        body.push([{ content: t(sec), colSpan: 5, styles: { fillColor: LIGHT, textColor: NAVY, fontStyle: 'bold', fontSize: 7.8 } }]); meta.push(null)
      }
      const v = rel.valeurs[f.key]
      const ev = evals[f.key]
      const passe = rel.passes?.includes(f.key) || v === undefined
      const ecart = isIndex(f.kind) && ev.diff !== undefined
        ? `${ev.diff > 0 ? '+' : ''}${fmtNum(ev.diff, f.kind)} ${f.unit}${ev.parJour !== undefined ? `  (${nf1.format(ev.parJour)}/j)` : ''}`
        : (ev.precedent && typeof v === 'number' && typeof ev.precedent.valeur === 'number' && f.kind !== 'texte'
          ? `${v - ev.precedent.valeur > 0 ? '+' : ''}${fmtNum(v - ev.precedent.valeur, f.kind)}` : '')
      const statut = passe ? 'Non relevé' : ev.niveau === 'crit' ? 'Critique' : ev.niveau === 'warn' ? 'À surveiller' : ev.niveau === 'info' ? 'Info' : 'Conforme'
      body.push([t(f.label), passe ? '-' : val(v, f), ev.precedent ? t(`${val(ev.precedent.valeur, f)} (${fmtDate(ev.precedent.date)})`) : '-', t(ecart || '-'), t(statut)])
      meta.push({ f })
    }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 22 },
      head: [['Point de mesure', 'Valeur relevée', 'Relevé précédent', 'Écart', 'Statut']],
      body, theme: 'grid',
      styles: { fontSize: 7.8, cellPadding: 1.6, textColor: INK, lineColor: BORDER, lineWidth: 0.15, valign: 'middle' },
      headStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 40, halign: 'right', textColor: GRAY }, 3: { cellWidth: 34, halign: 'right' }, 4: { halign: 'center' } },
      didParseCell: (d: any) => {
        if (d.section !== 'body') return
        const m = meta[d.row.index]; if (!m) return
        const ev = evals[m.f.key]
        if (d.column.index === 4) {
          const s = d.cell.raw as string
          d.cell.styles.fontStyle = 'bold'
          if (s === 'Critique') { d.cell.styles.textColor = CRIT; d.cell.styles.fillColor = CRIT_BG }
          else if (s.startsWith('À')) { d.cell.styles.textColor = WARN; d.cell.styles.fillColor = WARN_BG }
          else if (s === 'Non relevé') { d.cell.styles.textColor = GRAY; d.cell.styles.fontStyle = 'italic' }
          else if (s === 'Conforme') d.cell.styles.textColor = OK
          else d.cell.styles.textColor = GRAY
        }
        if (d.column.index === 1 && (ev.niveau === 'warn' || ev.niveau === 'crit')) d.cell.styles.textColor = ev.niveau === 'crit' ? CRIT : WARN
      },
      didDrawPage: () => enTetePage(),
    })
    y = (doc as any).lastAutoTable.finalY + 3
    // Messages d'alerte détaillés
    const msgs = site.fields.filter((f) => ['warn', 'crit'].includes(evals[f.key].niveau))
      .map((f) => `${f.section} — ${f.label} : ${evals[f.key].messages.join(' ; ')}`)
    if (msgs.length) {
      const lines = msgs.flatMap((m) => doc.splitTextToSize(t('• ' + m), CW - 8))
      const hh = lines.length * 3.6 + 5
      if (y + hh > H - 18) y = nouvellePage()
      doc.setFillColor(...WARN_BG); doc.roundedRect(M, y, CW, hh, 1.5, 1.5, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...WARN)
      doc.text(lines, M + 4, y + 4.6); y += hh + 3
    }
    // Observations
    const obs = (rel.observations || '').trim()
    {
      const lines = doc.splitTextToSize(t(obs || 'RAS'), CW - 8)
      const hh = lines.length * 3.8 + 10
      if (y + hh > H - 18) y = nouvellePage()
      doc.setDrawColor(...BORDER); doc.setFillColor(250, 251, 253); doc.roundedRect(M, y, CW, hh, 1.5, 1.5, 'FD')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY); doc.text('OBSERVATIONS', M + 4, y + 5)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(lines, M + 4, y + 9.5)
      y += hh + 3
    }
    // Mini-graphique : historique du volume journalier du 1er compteur
    const cpt = site.fields.find((f) => f.kind === 'index_m3')
    if (cpt) {
      const pts = [...hist.filter((h) => h.site_id === site.id), rel]
        .filter((r) => num(r.valeurs[cpt.key]) !== null)
        .sort((a, b) => +new Date(a.date_releve) - +new Date(b.date_releve))
      const series: { d: string; v: number }[] = []
      for (let i = 1; i < pts.length; i++) {
        const dj = (+new Date(pts[i].date_releve) - +new Date(pts[i - 1].date_releve)) / 86400000
        const dv = num(pts[i].valeurs[cpt.key])! - num(pts[i - 1].valeurs[cpt.key])!
        if (dj > 0.5 && dv >= 0) series.push({ d: pts[i].date_releve, v: dv / dj })
      }
      const last = series.slice(-10)
      if (last.length >= 2) {
        const ch = 34
        if (y + ch > H - 18) y = nouvellePage()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY)
        doc.text(t(`ÉVOLUTION — ${cpt.label} (m³/jour moyen entre deux passages)`), M, y + 3)
        const gx = M, gy = y + 7, gw = CW, gh = ch - 14
        const maxV = Math.max(...last.map((p) => p.v)) || 1
        const slot = gw / last.length, bw = Math.min(12, slot * 0.6)
        doc.setDrawColor(...BORDER); doc.setLineWidth(0.2); doc.line(gx, gy + gh, gx + gw, gy + gh)
        last.forEach((p, i) => {
          const h = Math.max(0.6, (p.v / maxV) * gh)
          const bx = gx + i * slot + (slot - bw) / 2
          const isCur = i === last.length - 1 && p.d === rel.date_releve
          doc.setFillColor(...(isCur ? RED : NAVY)); doc.roundedRect(bx, gy + gh - h, bw, h, 0.8, 0.8, 'F')
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.setTextColor(...GRAY)
          doc.text(t(new Date(p.d).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })), bx + bw / 2, gy + gh + 3.5, { align: 'center' })
          doc.setTextColor(...INK); doc.text(t(nf0.format(p.v)), bx + bw / 2, gy + gh - h - 1, { align: 'center' })
        })
        y += ch + 2
      }
    }
    // Photos
    if (rel.photos?.length) {
      const pw = (CW - 8) / 3, ph = pw * 0.75
      let i = 0
      for (const p of rel.photos) {
        const d = await inp.loadPhoto(p)
        if (!d) continue
        if (i % 3 === 0) { if (y + ph > H - 18) y = nouvellePage() }
        const x = M + (i % 3) * (pw + 4)
        try {
          const pr = doc.getImageProperties(d)
          let w = pw, h = (pw * pr.height) / pr.width
          if (h > ph) { h = ph; w = (ph * pr.width) / pr.height }
          doc.setFillColor(241, 245, 249); doc.roundedRect(x, y, pw, ph, 1.5, 1.5, 'F')
          doc.addImage(d, 'JPEG', x + (pw - w) / 2, y + (ph - h) / 2, w, h)
        } catch { /* image illisible */ }
        i++
        if (i % 3 === 0) y += ph + 4
      }
      if (i % 3 !== 0) y += ph + 4
    }
    if (nbA === 0) { /* rien */ }
    // Équipements
    if (site.infos?.length) {
      const txt = site.infos.map(([k, v]) => `${k} : ${v}`).join('   •   ')
      const lines = doc.splitTextToSize(t(txt), CW)
      if (y + lines.length * 3.2 + 4 > H - 18) y = nouvellePage()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...GRAY)
      doc.text(lines, M, y + 2); y += lines.length * 3.2 + 3
    }
    y += 7
  }

  // Ouvrages non relevés + seuils utilisés
  if (y > H - 60) y = nouvellePage()
  if (nonFaits.length) {
    y = titreSection(y, 'Ouvrages non relevés lors de cette tournée')
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 22 },
      head: [['Commune', 'Ouvrage']], body: nonFaits.map((s) => [t(s.commune), t(s.nom)]),
      theme: 'striped', styles: { fontSize: 8, cellPadding: 1.8, textColor: INK }, headStyles: { fillColor: GRAY },
      didDrawPage: () => enTetePage(),
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }
  if (y > H - 40) y = nouvellePage()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY); doc.text("SEUILS D'ALERTE APPLIQUÉS", M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...GRAY)
  const seuils = [
    `Chlore libre : ${fmtNum(SEUILS.chloreMin)} à ${fmtNum(SEUILS.chloreMax)} mg/l`,
    `Isolement moteur : attention < ${fmtNum(SEUILS.isolementAlerte)} MOhm, critique < ${fmtNum(SEUILS.isolementCritique)} MOhm`,
    `Turbidité : attention > ${fmtNum(SEUILS.turbiditeAlerte)} NTU, critique > ${fmtNum(SEUILS.turbiditeCritique)} NTU`,
    `Intensité UV < ${SEUILS.uvPctMin} % — Intensité moteur : variation > ${SEUILS.variationIntensite * 100} % ou écart entre groupes > ${SEUILS.ecartGroupes * 100} %`,
    'Index de compteur inférieur au relevé précédent : à vérifier (changement de compteur ou erreur).',
  ]
  doc.text(seuils.map(t), M, y + 4.5, { lineHeightFactor: 1.4 })

  // Pieds de page
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY)
    doc.text(t('ELECTREAU — Pompage et traitement de l’eau'), M, H - 6.5)
    doc.text(`Page ${i} / ${n}`, W - M, H - 6.5, { align: 'right' })
  }
  return doc.output('blob')
}

export function nomFichierPdf(client: ClientDef, dateIso: string) {
  const d = new Date(dateIso)
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `Rapport_${client.code.replace(/\s+/g, '_')}_${s}.pdf`
}

export function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nom
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
