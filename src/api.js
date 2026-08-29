// Thin wrapper around the Latte FastAPI backend.
// Every network call the UI makes goes through here, so components never
// touch fetch() directly and auth/error handling lives in one place.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'latte-token'

// --- session -----------------------------------------------------------------
// TOKEN_KEY holds the app's OWN JWT (from POST /api/auth/google), not the
// Google token. USER_KEY caches the profile so a page refresh can repaint the
// sidebar without a round-trip. Both are cleared together on logout / 401.

const USER_KEY = 'latte-user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// --- core fetch wrapper -----------------------------------------------------

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let detail
  if (!res.ok) {
    try { detail = (await res.json()).detail } catch { /* body was not JSON */ }
  }

  // A 401 on an authenticated call means our stored JWT is bad/expired —
  // drop it so the app falls back to the login screen. A 401 on the login
  // call itself (auth: false) is a real auth failure; surface its detail.
  if (res.status === 401 && auth) {
    clearSession()
    throw new ApiError(401, 'Your session has expired. Please sign in again.')
  }

  if (!res.ok) {
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return null // DELETE returns no body
  return res.json()
}

// --- auth ------------------------------------------------------------------

// credential = the ID token string handed to us by Google Identity Services.
// On success we store the returned app JWT and return the user profile.
export async function googleLogin(credential) {
  const data = await apiFetch('/api/auth/google', {
    method: 'POST',
    body: { credential },
    auth: false,
  })
  saveSession(data.access_token, data.user)
  return data.user // { id, email, name, picture }
}

// --- sheets --------------------------------------------------------------
// A "sheet" from the backend looks like:
//   { id, list_type, name, rows, created_at, updated_at }
// where list_type is one of 'todo' | 'bucket' | 'timetable' and rows is
// whatever JSON array the frontend chooses to store.

export function listSheets(listType) {
  const qs = listType ? `?list_type=${encodeURIComponent(listType)}` : ''
  return apiFetch(`/api/sheets${qs}`)
}

export function createSheet(name, listType, rows = []) {
  return apiFetch('/api/sheets', {
    method: 'POST',
    body: { name, list_type: listType, rows },
  })
}

// patch = { name?, rows? } — the backend rejects an empty patch with a 400.
export function updateSheet(id, patch) {
  return apiFetch(`/api/sheets/${id}`, { method: 'PUT', body: patch })
}

export function deleteSheet(id) {
  return apiFetch(`/api/sheets/${id}`, { method: 'DELETE' })
}
