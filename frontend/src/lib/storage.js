import { createDefaultWorkspace } from './seed.js'

const SESSION_KEY = 'tina.session'
const WORKSPACE_PREFIX = 'tina.workspace.'

function safeRead(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota issues in the demo environment.
  }
}

export const sessionStorageService = {
  get() {
    return safeRead(SESSION_KEY)
  },
  set(value) {
    safeWrite(SESSION_KEY, value)
  },
  clear() {
    window.localStorage.removeItem(SESSION_KEY)
  },
}

export function loadWorkspace(userId) {
  return safeRead(`${WORKSPACE_PREFIX}${userId}`) ?? createDefaultWorkspace()
}

export function saveWorkspace(userId, workspace) {
  safeWrite(`${WORKSPACE_PREFIX}${userId}`, workspace)
}
