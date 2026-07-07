'use client'

import { useEffect, useRef } from 'react'

// Fond animé ELECTREAU (esthétique). Thème eau + électricité :
// dégradé navy, réseau de particules bleu/rouge, vagues, et silhouettes
// du métier de l'eau (château d'eau, réservoir, poste de relevage, pompe,
// vanne, tuyauterie, cuve) qui défilent. Respecte prefers-reduced-motion.
export default function ElectreauBg() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0, H = 0, DPR = 1, raf = 0, t = 0
    let particles: any[] = []
    let structures: any[] = []
    const COLORS = { blue: '28,160,227', red: '193,18,31', light: '120,200,245' }

    function initParticles() {
      const count = Math.min(90, Math.round((W * H) / 16000))
      particles = []
      for (let i = 0; i < count; i++) particles.push({
        x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.25,
        vy: -(0.15 + Math.random() * 0.4), r: 1 + Math.random() * 2.2, red: Math.random() < 0.12,
      })
    }

    function waterTower(c: any){c.beginPath();c.moveTo(-8,0);c.lineTo(-8,-42);c.moveTo(8,0);c.lineTo(8,-42);c.moveTo(-8,0);c.lineTo(8,0);c.stroke();c.beginPath();c.moveTo(-8,-42);c.lineTo(-26,-52);c.lineTo(-26,-70);c.quadraticCurveTo(0,-84,26,-70);c.lineTo(26,-52);c.lineTo(8,-42);c.stroke();c.beginPath();c.moveTo(-24,-60);c.lineTo(24,-60);c.stroke();}
    function reservoir(c: any){c.beginPath();c.moveTo(-34,0);c.lineTo(-34,-40);c.moveTo(34,0);c.lineTo(34,-40);c.moveTo(-34,0);c.lineTo(34,0);c.stroke();c.beginPath();c.ellipse(0,-40,34,8,0,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(-34,-40);c.quadraticCurveTo(0,-58,34,-40);c.stroke();c.beginPath();c.moveTo(24,0);c.lineTo(24,-40);c.moveTo(30,0);c.lineTo(30,-40);for(let y=-6;y>-40;y-=8){c.moveTo(24,y);c.lineTo(30,y);}c.stroke();}
    function pumpStation(c: any){c.beginPath();c.rect(-30,-44,60,44);c.stroke();c.beginPath();c.moveTo(-30,-14);c.lineTo(30,-14);c.stroke();c.beginPath();c.arc(-8,-10,7,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(-8,-17);c.lineTo(-8,-54);c.lineTo(30,-54);c.stroke();}
    function pump(c: any){c.beginPath();c.arc(0,-14,12,0,Math.PI*2);c.stroke();c.beginPath();c.arc(0,-14,3,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(-12,-14);c.lineTo(-26,-14);c.moveTo(0,-26);c.lineTo(0,-40);c.stroke();c.beginPath();c.moveTo(-16,0);c.lineTo(16,0);c.moveTo(-12,0);c.lineTo(-12,-6);c.moveTo(12,0);c.lineTo(12,-6);c.stroke();}
    function valve(c: any){c.beginPath();c.moveTo(-16,-18);c.lineTo(-16,-2);c.lineTo(0,-10);c.closePath();c.moveTo(16,-18);c.lineTo(16,-2);c.lineTo(0,-10);c.closePath();c.stroke();c.beginPath();c.moveTo(0,-10);c.lineTo(0,-24);c.moveTo(-9,-24);c.lineTo(9,-24);c.moveTo(-16,-10);c.lineTo(-28,-10);c.moveTo(16,-10);c.lineTo(28,-10);c.stroke();c.beginPath();c.arc(0,-27,4,0,Math.PI*2);c.stroke();}
    function pipes(c: any){c.beginPath();c.moveTo(-30,0);c.lineTo(-6,0);c.quadraticCurveTo(6,0,6,-12);c.lineTo(6,-30);c.stroke();c.beginPath();c.moveTo(-30,-6);c.lineTo(-30,6);c.moveTo(0,-30);c.lineTo(12,-30);c.stroke();}
    function hydro(c: any){const r=10;c.beginPath();c.moveTo(-28+r,-24);c.lineTo(28-r,-24);c.arc(28-r,-24+r,r,-Math.PI/2,Math.PI/2);c.lineTo(-28+r,-4);c.arc(-28+r,-24+r,r,Math.PI/2,3*Math.PI/2);c.closePath();c.stroke();c.beginPath();c.moveTo(-16,-4);c.lineTo(-18,0);c.moveTo(16,-4);c.lineTo(18,0);c.stroke();}
    function drop(c: any){c.beginPath();c.moveTo(0,-28);c.bezierCurveTo(12,-12,10,2,0,2);c.bezierCurveTo(-10,2,-12,-12,0,-28);c.closePath();c.stroke();}
    const SHAPES = [waterTower, reservoir, pumpStation, pump, valve, pipes, hydro, drop]

    function initStructures() {
      const n = Math.max(4, Math.round(W / 340))
      structures = []
      for (let i = 0; i < n; i++) structures.push({
        fn: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        x: Math.random() * (W + 400) - 200, y: H * (0.32 + Math.random() * 0.42),
        s: 0.85 + Math.random() * 1.05, speed: 0.06 + Math.random() * 0.1, flip: Math.random() < 0.5,
      })
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas!.clientWidth; H = canvas!.clientHeight
      canvas!.width = W * DPR; canvas!.height = H * DPR
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
      initParticles(); initStructures()
    }

    function drawStructures() {
      ctx!.lineJoin = 'round'; ctx!.lineCap = 'round'
      structures.forEach((o) => {
        o.x -= o.speed
        if (o.x < -240) { o.x = W + 220; o.y = H * (0.32 + Math.random() * 0.42); o.fn = SHAPES[Math.floor(Math.random() * SHAPES.length)] }
        ctx!.save(); ctx!.translate(o.x, o.y); ctx!.scale(o.flip ? -o.s : o.s, o.s)
        ctx!.lineWidth = 1.3 / o.s; ctx!.strokeStyle = 'rgba(120,200,245,0.09)'; o.fn(ctx); ctx!.restore()
      })
    }

    function drawWaves() {
      const bands = [
        { amp: 26, len: 0.01, speed: 0.35, y: 0.82, a: 0.1, c: COLORS.blue },
        { amp: 20, len: 0.014, speed: 0.55, y: 0.88, a: 0.1, c: COLORS.light },
        { amp: 34, len: 0.008, speed: 0.25, y: 0.94, a: 0.08, c: COLORS.blue },
      ]
      bands.forEach((b) => {
        ctx!.beginPath(); ctx!.moveTo(0, H)
        for (let x = 0; x <= W; x += 8) { const y = H * b.y + Math.sin(x * b.len + t * b.speed) * b.amp; ctx!.lineTo(x, y) }
        ctx!.lineTo(W, H); ctx!.closePath(); ctx!.fillStyle = `rgba(${b.c},${b.a})`; ctx!.fill()
      })
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H)
      const pulse = 0.06 + Math.sin(t * 0.4) * 0.03
      const g = ctx!.createRadialGradient(W * 0.22, H * 0.15, 0, W * 0.22, H * 0.15, Math.max(W, H) * 0.55)
      g.addColorStop(0, `rgba(${COLORS.red},${pulse})`); g.addColorStop(1, 'rgba(193,18,31,0)')
      ctx!.fillStyle = g; ctx!.fillRect(0, 0, W, H)
      drawStructures(); drawWaves()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy
          if (d2 < 130 * 130) {
            const a = (1 - Math.sqrt(d2) / 130) * 0.16
            ctx!.strokeStyle = `rgba(${COLORS.blue},${a})`; ctx!.lineWidth = 1
            ctx!.beginPath(); ctx!.moveTo(p.x, p.y); ctx!.lineTo(q.x, q.y); ctx!.stroke()
          }
        }
      }
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W }
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10
        const c = p.red ? COLORS.red : COLORS.blue
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx!.fillStyle = `rgba(${c},0.75)`
        ctx!.shadowColor = `rgba(${c},0.9)`; ctx!.shadowBlur = 8; ctx!.fill(); ctx!.shadowBlur = 0
      })
      t += 0.016
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    window.addEventListener('resize', resize)
    resize()
    if (reduce) draw()
    else raf = requestAnimationFrame(draw)

    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf) }
  }, [])

  return <canvas ref={ref} id="electreau-bg" aria-hidden="true" />
}
