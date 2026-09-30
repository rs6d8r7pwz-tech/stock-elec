'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Position } from '@/lib/carte/types'

export interface MapPoint { id: string; lat: number; lng: number; nom: string; couleur: string; sousTitre?: string }

interface Props {
  points?: MapPoint[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  userPos?: Position | null
  /** Mode « placer un point » : marqueur déplaçable + clic sur la carte */
  pick?: { pos: Position | null; onChange: (p: Position) => void }
  /** Change cette valeur pour recadrer la carte sur les points */
  fitKey?: string | number
  /** Centre demandé (ex. « autour de moi ») */
  focus?: { pos: Position; zoom?: number; key: number } | null
  /** Cercle de rayon (m) autour de userPos */
  rayonM?: number | null
  className?: string
}

const DEFAUT: [number, number] = [45.856, 3.548] // Thiers
const IGN = (layer: string, fmt: string) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${fmt}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`

function pinSvg(c: string, sel: boolean) {
  const s = sel ? 40 : 30
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
    <path d="M12 1.5C7.6 1.5 4 5 4 9.4c0 5.6 7 12.5 7.3 12.8.4.4 1 .4 1.4 0 .3-.3 7.3-7.2 7.3-12.8C20 5 16.4 1.5 12 1.5z" fill="${c}" stroke="#fff" stroke-width="1.6"/>
    <circle cx="12" cy="9.3" r="3" fill="#fff"/></svg>`
}

export default function MapView({ points = [], selectedId, onSelect, userPos, pick, fitKey, focus, rayonM, className }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const L = useRef<any>(null)
  const map = useRef<any>(null)
  const cluster = useRef<any>(null)
  const userLayer = useRef<any>(null)
  const pickMarker = useRef<any>(null)
  const onSelectRef = useRef(onSelect)
  const pickRef = useRef(pick)
  onSelectRef.current = onSelect
  pickRef.current = pick
  const [ready, setReady] = useState(false)

  // Initialisation (une seule fois, côté navigateur)
  useEffect(() => {
    let annule = false
    ;(async () => {
      const Lm = (await import('leaflet')).default
      ;(window as any).L = Lm
      // @ts-ignore — plugin sans types, s'attache à window.L
      await import('leaflet.markercluster')
      if (annule || !divRef.current) return
      L.current = Lm
      const m = Lm.map(divRef.current, { zoomControl: true, attributionControl: true, tap: true } as any)
      const plan = Lm.tileLayer(IGN('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'), {
        maxZoom: 19, maxNativeZoom: 19, attribution: '© IGN Géoplateforme',
      })
      const photo = Lm.tileLayer(IGN('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'), {
        maxZoom: 20, maxNativeZoom: 19, attribution: '© IGN Géoplateforme',
      })
      const osm = Lm.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      })
      let fond = 'plan'
      try { fond = localStorage.getItem('carte_fond') || 'plan' } catch { /* */ }
      const fonds: Record<string, any> = { 'Plan IGN': plan, 'Photo aérienne': photo, 'OpenStreetMap': osm }
      const initial = ({ plan, photo, osm } as Record<string, any>)[fond] || plan
      initial.addTo(m)
      Lm.control.layers(fonds, undefined, { position: 'topright' }).addTo(m)
      m.on('baselayerchange', (e: any) => {
        const k = e.layer === photo ? 'photo' : e.layer === osm ? 'osm' : 'plan'
        try { localStorage.setItem('carte_fond', k) } catch { /* */ }
      })
      Lm.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m)
      m.setView(DEFAUT, 11)

      cluster.current = (Lm as any).markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 45, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: true,
      })
      m.addLayer(cluster.current)
      userLayer.current = Lm.layerGroup().addTo(m)

      m.on('click', (e: any) => {
        if (pickRef.current) pickRef.current.onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
      })
      map.current = m
      setReady(true)
      setTimeout(() => m.invalidateSize(), 200)
    })()
    return () => {
      annule = true
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Taille du conteneur (changement d'onglet, rotation…)
  useEffect(() => {
    if (!ready || !divRef.current) return
    const ro = new ResizeObserver(() => map.current?.invalidateSize())
    ro.observe(divRef.current)
    return () => ro.disconnect()
  }, [ready])

  // Marqueurs des points
  useEffect(() => {
    if (!ready) return
    const Lm = L.current
    cluster.current.clearLayers()
    const ms = points.map((p) => {
      const sel = p.id === selectedId
      const s = sel ? 40 : 30
      const mk = Lm.marker([p.lat, p.lng], {
        icon: Lm.divIcon({ html: pinSvg(p.couleur, sel), className: '', iconSize: [s, s], iconAnchor: [s / 2, s - 2] }),
        zIndexOffset: sel ? 1000 : 0,
        title: p.nom,
      })
      mk.bindTooltip(`<b>${esc(p.nom)}</b>${p.sousTitre ? `<br/><span style="opacity:.75">${esc(p.sousTitre)}</span>` : ''}`,
        { direction: 'top', offset: [0, -s + 4] })
      mk.on('click', () => onSelectRef.current?.(p.id))
      return mk
    })
    cluster.current.addLayers(ms)
  }, [ready, points, selectedId])

  // Recadrage sur les points
  useEffect(() => {
    if (!ready || fitKey === undefined) return
    if (pick?.pos) { map.current.setView([pick.pos.lat, pick.pos.lng], Math.max(map.current.getZoom(), 17)); return }
    const pts = points.map((p) => [p.lat, p.lng])
    if (pts.length === 1) map.current.setView(pts[0], 16)
    else if (pts.length > 1) map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 16 })
  }, [ready, fitKey]) // eslint-disable-line

  // Centre demandé
  useEffect(() => {
    if (!ready || !focus) return
    map.current.setView([focus.pos.lat, focus.pos.lng], focus.zoom ?? 15)
  }, [ready, focus?.key]) // eslint-disable-line

  // Position de l'utilisateur
  useEffect(() => {
    if (!ready) return
    const Lm = L.current
    userLayer.current.clearLayers()
    if (!userPos) return
    if (rayonM) {
      Lm.circle([userPos.lat, userPos.lng], { radius: rayonM, color: '#1d6fd6', weight: 1.5, fillOpacity: 0.05, dashArray: '6 6', interactive: false })
        .addTo(userLayer.current)
    }
    if (userPos.precision && userPos.precision > 5) {
      Lm.circle([userPos.lat, userPos.lng], { radius: userPos.precision, color: '#1d6fd6', weight: 0, fillOpacity: 0.15, interactive: false })
        .addTo(userLayer.current)
    }
    Lm.circleMarker([userPos.lat, userPos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1d6fd6', fillOpacity: 1 })
      .bindTooltip('Vous êtes ici').addTo(userLayer.current)
  }, [ready, userPos?.lat, userPos?.lng, userPos?.precision, rayonM]) // eslint-disable-line

  // Marqueur « placer le point »
  useEffect(() => {
    if (!ready) return
    const Lm = L.current
    if (!pick || !pick.pos) {
      pickMarker.current?.remove()
      pickMarker.current = null
      return
    }
    const ll = [pick.pos.lat, pick.pos.lng]
    if (!pickMarker.current) {
      pickMarker.current = Lm.marker(ll, {
        draggable: true,
        zIndexOffset: 2000,
        icon: Lm.divIcon({ html: pinSvg('#16294a', true), className: '', iconSize: [40, 40], iconAnchor: [20, 38] }),
      }).addTo(map.current)
      pickMarker.current.on('dragend', () => {
        const p = pickMarker.current.getLatLng()
        pickRef.current?.onChange({ lat: p.lat, lng: p.lng })
      })
      map.current.setView(ll, Math.max(map.current.getZoom(), 17))
    } else {
      pickMarker.current.setLatLng(ll)
      if (!map.current.getBounds().pad(-0.1).contains(ll)) map.current.panTo(ll)
    }
  }, [ready, pick?.pos?.lat, pick?.pos?.lng, !!pick]) // eslint-disable-line

  return <div ref={divRef} className={className} style={{ zIndex: 0 }} />
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
