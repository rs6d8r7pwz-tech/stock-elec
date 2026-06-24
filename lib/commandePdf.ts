import { CommandeLine } from './types'

// Génère (et télécharge) le PDF d'une demande d'achat à partir des lignes.
// Utilisé par la page Commande et par la page Demandes (re-téléchargement).
export async function genererCommandePdf(
  lines: CommandeLine[],
  opts: { reference?: string; date?: Date } = {},
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const now = opts.date || new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const pageW = doc.internal.pageSize.getWidth()

  // En-tête
  doc.setFillColor(22, 41, 74)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.text('⚡ ELECTREAU', 14, 12)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text('Gestion de stock électrique', 14, 19)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text("DEMANDE D'ACHAT", pageW - 14, 12, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`${opts.reference ? opts.reference + ' — ' : ''}${dateStr}`, pageW - 14, 19, { align: 'right' })

  doc.setDrawColor(212, 45, 40); doc.setLineWidth(0.5)
  doc.line(14, 31, pageW - 14, 31)

  const rows = lines.map((l) => [
    l.name,
    l.component_type || '—',
    l.reference || '—',
    String(l.stock ?? '—'),
    String(l.threshold ?? '—'),
    String(l.quantity),
    l.url ? l.url.replace(/^https?:\/\//, '').substring(0, 40) : '—',
  ])

  autoTable(doc, {
    startY: 35,
    head: [['Désignation', 'Type', 'Référence', 'Stock', 'Seuil', 'Qté à commander', 'Lien / URL']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [22, 41, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [224, 245, 251] },
    columnStyles: {
      5: { fontStyle: 'bold', textColor: [212, 45, 40], halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(8); doc.setTextColor(107, 114, 128)
      doc.text(
        `Electreau — Demande d'achat ${opts.reference || ''} — Page ${data.pageNumber}/${pageCount}`,
        pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' },
      )
    },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 6
  if (finalY < doc.internal.pageSize.getHeight() - 20) {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 41, 74)
    const total = lines.reduce((s, l) => s + l.quantity, 0)
    doc.text(`Total : ${lines.length} référence${lines.length > 1 ? 's' : ''} — ${total} pièce${total > 1 ? 's' : ''} à commander`, 14, finalY)
  }

  const fileDate = now.toISOString().slice(0, 10)
  doc.save(`demande-achat-electreau-${opts.reference || fileDate}.pdf`)
}
