'use client'

import { useEffect, useRef, useState } from 'react'

// Recadrage manuel (rectangle ajustable) + filtre "scan" (N&B contrasté).
// Par défaut le cadre couvre toute la photo : l'utilisateur le resserre sur le ticket,
// ou valide tel quel. Fonctionne souris + tactile (pointer events).

type Rect = { x: number; y: number; w: number; h: number }

export default function CropScanModal({
  src, onCancel, onDone,
}: { src: string; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [disp, setDisp] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [flou, setFlou] = useState(false)
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ mode: string; sx: number; sy: number; orig: Rect } | null>(null)

  // Dimensionne l'image affichée (max 86vw x 60vh) et initialise le cadre plein
  function onImgLoad() {
    const img = imgRef.current!
    const maxW = Math.min(window.innerWidth * 0.86, 520)
    const maxH = window.innerHeight * 0.6
    let w = img.naturalWidth, h = img.naturalHeight
    const r = Math.min(maxW / w, maxH / h, 1)
    w = Math.round(w * r); h = Math.round(h * r)
    setDisp({ w, h })
    setRect({ x: 0, y: 0, w, h })
  }

  function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }

  function onPointerDown(mode: string) {
    return (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...rect } }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const { mode, sx, sy, orig } = drag.current
    const dx = e.clientX - sx, dy = e.clientY - sy
    let { x, y, w, h } = orig
    const MIN = 30
    if (mode === 'move') {
      x = clamp(orig.x + dx, 0, disp.w - w); y = clamp(orig.y + dy, 0, disp.h - h)
    } else {
      if (mode.includes('e')) w = clamp(orig.w + dx, MIN, disp.w - orig.x)
      if (mode.includes('s')) h = clamp(orig.h + dy, MIN, disp.h - orig.y)
      if (mode.includes('w')) { const nx = clamp(orig.x + dx, 0, orig.x + orig.w - MIN); w = orig.w + (orig.x - nx); x = nx }
      if (mode.includes('n')) { const ny = clamp(orig.y + dy, 0, orig.y + orig.h - MIN); h = orig.h + (orig.y - ny); y = ny }
    }
    setRect({ x, y, w, h })
  }
  function onPointerUp() { drag.current = null }

  async function valider() {
    setBusy(true)
    const img = imgRef.current!
    const sc = img.naturalWidth / disp.w // facteur affichage -> naturel
    const cw = Math.round(rect.w * sc), ch = Math.round(rect.h * sc)
    // Redimensionne (max 1600 px sur le plus grand côté) : PDF léger et rapide, reste lisible
    const MAX = 1600
    const ds = Math.min(1, MAX / Math.max(cw, ch))
    const ow = Math.max(1, Math.round(cw * ds)), oh = Math.max(1, Math.round(ch * ds))
    const canvas = document.createElement('canvas')
    canvas.width = ow; canvas.height = oh
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, Math.round(rect.x * sc), Math.round(rect.y * sc), cw, ch, 0, 0, ow, oh)
    // Filtre scan : niveaux de gris + contraste
    const id = ctx.getImageData(0, 0, ow, oh)
    const d = id.data
    const C = 1.45, inter = 128 * (1 - C)
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
      let v = C * g + inter
      v = v < 0 ? 0 : v > 255 ? 255 : v
      d[i] = d[i + 1] = d[i + 2] = v
    }
    ctx.putImageData(id, 0, 0)
    onDone(canvas.toDataURL('image/jpeg', 0.85))
    setBusy(false)
  }

  // Détection de flou simple (variance d'un Laplacien) sur la photo source
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const s = 220, r = Math.min(s / img.naturalWidth, s / img.naturalHeight, 1)
      const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r))
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const cx = c.getContext('2d')!; cx.drawImage(img, 0, 0, w, h)
      const px = cx.getImageData(0, 0, w, h).data
      const gray = new Float64Array(w * h)
      for (let i = 0; i < w * h; i++) gray[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]
      let mean = 0; const lap: number[] = []
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
        lap.push(v); mean += v
      }
      mean /= lap.length || 1
      let varr = 0; for (const v of lap) varr += (v - mean) ** 2
      varr /= lap.length || 1
      setFlou(varr < 60) // seuil prudent : ne flague que les photos très floues
    }
    img.src = src
  }, [src])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl p-3 max-w-[92vw]">
        <p className="text-sm font-medium mb-2 text-center" style={{ color: 'var(--navy)' }}>
          Ajuste le cadre sur le ticket, puis valide
        </p>
        <div ref={wrapRef} className="relative mx-auto" style={{ width: disp.w || 'auto', height: disp.h || 'auto', touchAction: 'none' }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt="" onLoad={onImgLoad} style={{ width: disp.w || 'auto', height: disp.h || 'auto', display: 'block', userSelect: 'none' }} draggable={false} />
          {disp.w > 0 && (
            <div className="absolute border-2" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderColor: 'var(--red)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', touchAction: 'none' }}
              onPointerDown={onPointerDown('move')}>
              {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                <div key={h} onPointerDown={onPointerDown(h)} style={{
                  position: 'absolute', width: 26, height: 26, background: 'var(--red)', borderRadius: 14, touchAction: 'none',
                  left: h.includes('w') ? -13 : undefined, right: h.includes('e') ? -13 : undefined,
                  top: h.includes('n') ? -13 : undefined, bottom: h.includes('s') ? -13 : undefined,
                }} />
              ))}
            </div>
          )}
        </div>
        {flou && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--danger)' }}>
            ⚠ Photo peut-être floue — vérifie que le montant et la TVA sont lisibles, sinon reprends-la.
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>Reprendre</button>
          <button onClick={valider} disabled={busy || disp.w === 0} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--red)' }}>
            {busy ? '…' : 'Améliorer & valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
