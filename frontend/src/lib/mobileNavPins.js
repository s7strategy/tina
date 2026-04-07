import { tabItems } from '../shell/tabItems.js'

const STORAGE_PINS = 'tina-mobile-nav-pins'
const STORAGE_ONBOARD = 'tina-mobile-nav-onboarded'

const VALID = new Set(tabItems.map((t) => t.key))
const DEFAULT_PINS = ['cal', 'tasks', 'time', 'rewards']

function normalizePins(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return [...DEFAULT_PINS]
  const next = raw.map((k) => (VALID.has(k) ? k : 'cal'))
  const used = new Set()
  const allKeys = tabItems.map((t) => t.key)
  for (let i = 0; i < 4; i++) {
    if (!used.has(next[i])) {
      used.add(next[i])
      continue
    }
    const fill = allKeys.find((k) => !used.has(k)) || 'cal'
    next[i] = fill
    used.add(fill)
  }
  return next
}

export function loadPinnedKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_PINS)
    if (!raw) return [...DEFAULT_PINS]
    return normalizePins(JSON.parse(raw))
  } catch {
    return [...DEFAULT_PINS]
  }
}

export function savePinnedKeys(keys) {
  try {
    localStorage.setItem(STORAGE_PINS, JSON.stringify(normalizePins(keys)))
  } catch {
    /* ignore */
  }
}

/**
 * Coloca `tabKey` no slot 0–3 (esq.1, esq.2, dir.1, dir.2).
 * Se o destino já estava noutro slot, troca com o que estava no slot escolhido.
 * Se ainda não estava na barra, substitui o slot (o ícone anterior deixa de aparecer).
 */
export function applyPinAtSlot(tabKey, slotIndex, pinnedKeys) {
  if (!VALID.has(tabKey) || slotIndex < 0 || slotIndex > 3) return normalizePins([...pinnedKeys])
  const next = [...pinnedKeys]
  const oldIdx = next.indexOf(tabKey)
  if (oldIdx === slotIndex) return normalizePins(next)
  const displaced = next[slotIndex]
  if (oldIdx >= 0) {
    next[oldIdx] = displaced
  }
  next[slotIndex] = tabKey
  return normalizePins(next)
}

export function hasSeenNavOnboarding() {
  try {
    return localStorage.getItem(STORAGE_ONBOARD) === '1'
  } catch {
    return true
  }
}

export function markNavOnboardingSeen() {
  try {
    localStorage.setItem(STORAGE_ONBOARD, '1')
  } catch {
    /* ignore */
  }
}
