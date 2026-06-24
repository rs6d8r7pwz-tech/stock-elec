// Identité de l'appareil (navigateur) — stockée durablement dans localStorage.
// Effacer les données du navigateur = nouvel appareil (nouvelle autorisation requise).

const DEVICE_KEY = 'electreau_device_id'

export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() ||
      'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10))
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// Libellé lisible de l'appareil à partir du user-agent (ex: "Chrome sur Windows").
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Appareil inconnu'
  const ua = navigator.userAgent

  let os = 'OS inconnu'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let nav = 'Navigateur'
  if (/Edg\//i.test(ua)) nav = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) nav = 'Opera'
  else if (/Chrome\//i.test(ua)) nav = 'Chrome'
  else if (/Firefox\//i.test(ua)) nav = 'Firefox'
  else if (/Safari\//i.test(ua)) nav = 'Safari'

  const mobile = /Mobile|iPhone|Android/i.test(ua) ? ' (mobile)' : ''
  return `${nav} sur ${os}${mobile}`
}
