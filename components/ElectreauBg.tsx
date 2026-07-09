'use client'

import { useEffect, useRef } from 'react'
import { SPRITES } from './electreauSprites'

// Fond animé ELECTREAU : étoiles lumineuses (particules) + ouvrages de l'eau
// dessinés, discrets, qui défilent dans le sens de la vague. prefers-reduced-motion respecté.
export default function ElectreauBg() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current as any
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, DPR = 1, raf = 0, t = 0;
  let items = [], stars = [];
  const SPRITE_ALPHA = 0.17;
  const imgs = SPRITES.map(function (s) { var i = new Image(); i.src = s; return i; });
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mkItem(x) { return { k: Math.floor(Math.random() * imgs.length), x: x, y: rnd(0, H), s: rnd(0.4, 0.95), speed: rnd(0.18, 0.45), bobA: rnd(5, 14), bobP: rnd(0, 6.28), a: rnd(0.6, 1) }; }
  function initItems() { var n = Math.max(8, Math.min(20, Math.round(W * H / 70000))); items = []; for (var i = 0; i < n; i++) items.push(mkItem(Math.random() * W)); }
  function initStars() { var n = Math.min(120, Math.round(W * H / 11000)); stars = []; for (var i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: rnd(0.6, 2.1), b: rnd(0.5, 1), tw: rnd(0, 6.28), ts: rnd(0.015, 0.05), vx: -rnd(0.05, 0.25), vy: rnd(-0.05, 0.05), red: Math.random() < 0.08 }); }
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); initItems(); initStars(); }
  function waves() {
    var bands = [{ amp: 24, len: 0.010, sp: 0.5, y: 0.86, a: 0.10, c: "120,200,245" }, { amp: 32, len: 0.008, sp: 0.35, y: 0.93, a: 0.09, c: "28,160,227" }];
    bands.forEach(function (b) { ctx.beginPath(); ctx.moveTo(0, H); for (var x = 0; x <= W; x += 8) { var y = H * b.y + Math.sin(x * b.len + t * b.sp) * b.amp; ctx.lineTo(x, y); } ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = "rgba(" + b.c + "," + b.a + ")"; ctx.fill(); });
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    var pulse = 0.05 + Math.sin(t * 0.4) * 0.025;
    var g = ctx.createRadialGradient(W * 0.22, H * 0.15, 0, W * 0.22, H * 0.15, Math.max(W, H) * 0.55);
    g.addColorStop(0, "rgba(193,18,31," + pulse + ")"); g.addColorStop(1, "rgba(193,18,31,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    items.forEach(function (o) {
      o.x -= o.speed; var yy = o.y + Math.sin(t * 0.3 + o.bobP) * o.bobA; var im = imgs[o.k];
      if (o.x < -200) { var n = mkItem(W + 150); o.k = n.k; o.x = n.x; o.y = n.y; o.s = n.s; o.speed = n.speed; o.bobA = n.bobA; o.bobP = n.bobP; o.a = n.a; }
      if (im.complete && im.width) { ctx.globalAlpha = SPRITE_ALPHA * o.a; var w = im.width * o.s * 0.5, h = im.height * o.s * 0.5; ctx.drawImage(im, o.x - w / 2, yy - h / 2, w, h); }
    });
    ctx.globalAlpha = 1;
    waves();
    stars.forEach(function (s) {
      s.x += s.vx; s.y += s.vy; if (s.x < -6) { s.x = W + 6; s.y = Math.random() * H; } if (s.y < -6) s.y = H + 6; if (s.y > H + 6) s.y = -6;
      s.tw += s.ts; var a = s.b * (0.5 + 0.5 * Math.sin(s.tw)); var col = s.red ? "255,120,130" : "200,230,255";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fillStyle = "rgba(" + col + "," + a + ")"; ctx.shadowColor = "rgba(" + col + "," + a + ")"; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
    });
    t += 0.016; if (!reduce) raf = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize); resize();
  if (reduce) draw(); else raf = requestAnimationFrame(draw);

    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf) }
  }, [])

  return <canvas ref={ref} id="electreau-bg" aria-hidden="true" />
}
