'use client'
// Lien entre les ouvrages du Rapport et les points GPS de la Carte ELECTReau
// (bouton « Y aller »). Le client Carte porte le même nom que le `code` du
// client Rapport (« CCBE AEP », « CCBE EU »).
import { useEffect, useState } from 'react'
import { chargerTout } from '@/lib/carte/store'
import type { CartePoint } from '@/lib/carte/types'
import type { ClientDef } from './types'

/**
 * Correspondance ouvrage du rapport (id) → nom du point dans la Carte.
 * Les noms diffèrent souvent entre l'Excel du client et la Carte : on les relie ici.
 * Un ouvrage absent de cette liste est relié automatiquement si un point de la
 * Carte porte exactement le même nom (accents / majuscules ignorés).
 * Pour ajouter un lien : 'id_ouvrage': 'Nom du point dans la Carte'.
 */
const LIENS: Record<string, Record<string, string>> = {
  ccbe_aep: {
    izeaux_layat: 'Forage de Layat',
    izeaux_chambard: 'Réservoir de Chambard',
    izeaux_coublevie: 'Réservoir de Coublevie',
    renage_criel: 'Réservoir de Criel',
    renage_rua: 'Réservoir de la Rua',
    renage_meaubec: 'Réservoir de Meaubec',
    beauc_bains: 'Forage des Bains',
    beauc_mollard: 'Réservoir de Mollard Ceval',
    beauc_650: 'Réservoir 650m3',
    burcins_4routes: 'Station des 4 Routes',
    burcins_cuetant: 'Captage de Bas Cuetan',
    burcins_groschene: 'Réservoir du Gros Chênes',
    lemps_moulin: 'Reprise du Moulin',
    lemps_champaudes: 'Réservoir des Champaudes',
    bizonnes_buclas: 'Forage Bucclas',
    bizonnes_mont: 'Réservoir du Mont',
    chabons_vaux: 'Station de Vaux',
    chabons_resvaux: 'Réservoir de Vaux',
    oyeu_thyvolet: 'Réservoir du Thivoley',
    oyeu_blaune: 'Station de Blaune',
    oyeu_oyen: "Réservoir d'Oyen",
    apprieu_gagere: 'Station de Côte Gagère',
    apprieu_couchonniere: 'Réservoir de Couchonnière',
    apprieu_plambois: 'RES PLAN BOIS',
    apprieu_futeau: 'Surpresseur du Futeau',
    apprieu_bertine: 'Surpresseur Bertine',
    secto_colombe_pabd_ouest: 'PABD OUEST',
    secto_oyeu_montfollet: 'SECTO MONTFOLLET',
    secto_le_grand_lemps_chartreuse: 'SECTO CHARTREUSE',
    // confirmés par Bastien le 14/10/2026
    lemps_lac: 'Forage du Lac',
    apprieu_cattin: 'Pompage de Planche Cattin',
    secto_colombe_interco_lgl: 'INTERO LGL COLOMBE',
    secto_chabons_bois_vert: 'SECTO BOIS VERT',
  },
  ccbe_eu: {
    pr_paulbert: 'PR Paul Bert',
    pr_fays: 'PR du Fays',
    pr_sure: 'PR de la Sûre',
    pr_maraisfleury: 'PR du Marais Fleury',
    pr_bruyeres: 'PR Bruyères',
    pr_plaine: 'PR de la Plaine',
    pr_plancecattin: 'PR Planche Cattin',
    pr_rivier: 'PR le Rivier',
    pr_ponvert: 'PR Ponvert',
    pr_tessy: 'PR Tessy',
    pr_bertine: 'PR Bertine',
    pr_maladiere: 'PR Maladière',
    pr_suchet: 'PR du Suchet',
    pr_eglise: 'PR Eglise',
    step_bevenais: 'STEP Bevenais',
    pr_cotesquare: 'PR Côté square',
    do_lacal: 'D.O La Cale',
    dotrim_plancecattin: 'D.O Planche Cattin',
    dotrim_lgl_est: 'DO LGL EST',
    dotrim_lgl_ouest: 'DO LGL OUEST',
    step_beaucroissant: 'PR STEP Beaucroissant', // confirmé le 14/10/2026
  },
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Points GPS de la Carte pour un client du Rapport, indexés par id d'ouvrage. */
export function usePointsCarte(client: ClientDef): Record<string, CartePoint> {
  const [pts, setPts] = useState<CartePoint[]>([])
  const [carteClientId, setCarteClientId] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    chargerTout()
      .then((d) => {
        if (!vivant) return
        const c = d.clients.find((x) => norm(x.nom) === norm(client.code))
        setCarteClientId(c ? c.id : null)
        setPts(c ? d.points.filter((p) => p.client_id === c.id) : [])
      })
      .catch(() => { /* pas de réseau ni de cache : pas de bouton « Y aller » */ })
    return () => { vivant = false }
  }, [client.code])

  const res: Record<string, CartePoint> = {}
  if (!carteClientId || !pts.length) return res
  const parNom = new Map(pts.map((p) => [norm(p.nom), p]))
  const liens = LIENS[client.id] || {}
  for (const s of client.sites) {
    const p = (liens[s.id] && parNom.get(norm(liens[s.id]))) || parNom.get(norm(s.nom))
    if (p) res[s.id] = p
  }
  return res
}

