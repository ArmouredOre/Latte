import { useState, useRef, useEffect } from 'react'
import './App.css'
import {
  googleLogin,
  getToken,
  getStoredUser,
  clearSession,
  listSheets,
  createSheet,
  updateSheet,
  deleteSheet,
} from './api'

// In-memory shape per list type: [{ id, name, rows, saved }]
// where `saved` = "matches what's on the server".
const EMPTY_LISTS = { todo: [], bucket: [], timetable: [] }

// Collision-proof row id (Date.now() repeats on fast clicks).
const newRowId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`

// ---- Themes ----------------------------------------------------------------
const THEMES = [
  { id: 'latte', label: 'Latte' },
  { id: 'cappuccino', label: 'Cappuccino' },
  { id: 'espresso', label: 'Espresso', dark: true },
  { id: 'mocha', label: 'Mocha', dark: true },
  { id: 'matcha', label: 'Matcha' },
  { id: 'chai', label: 'Chai' },
  { id: 'strawberry', label: 'Strawberry Latte' },
]
const THEME_IDS = THEMES.map(t => t.id)
const THEME_KEY = 'latte-theme'

// Owns the active theme, writes data-theme on <html>, persists to localStorage.
function useThemeState() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (THEME_IDS.includes(saved)) return saved
    } catch { /* ignore */ }
    return 'latte'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])
  return [theme, setTheme]
}

const GoogleG = () => (
  <svg viewBox='0 0 48 48' width='18' height='18' aria-hidden='true'>
    <path fill='#EA4335' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' />
    <path fill='#4285F4' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' />
    <path fill='#FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' />
    <path fill='#34A853' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' />
  </svg>
)

const PaletteIcon = () => (
  <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor'
       strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <path d='M12 3a9 9 0 1 0 0 18c.9 0 1.4-.7 1.4-1.5 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Z' />
    <circle cx='8' cy='10' r='1.1' /><circle cx='12' cy='7.5' r='1.1' /><circle cx='16' cy='10' r='1.1' />
  </svg>
)

// Theme picker. `variant="floating"` = fixed top-right pill (pre-auth screens);
// `variant="inline"` = a row that sits in the sidebar footer.
function ThemeMenu({ theme, onChange, variant = 'floating' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = THEMES.find(t => t.id === theme) ?? THEMES[0]

  return (
    <div className={`theme-menu theme-menu-${variant}`} ref={ref}>
      {open && (
        <ul className='theme-menu-list' role='listbox' aria-label='Theme'>
          {THEMES.map(t => (
            <li key={t.id}>
              <button
                type='button'
                role='option'
                aria-selected={t.id === theme}
                className={`theme-option ${t.id === theme ? 'is-current' : ''}`}
                onClick={() => { onChange(t.id); setOpen(false) }}
              >
                <span className={`theme-bead theme-bead-${t.id}`} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type='button'
        className='theme-menu-toggle'
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label='Change theme'
        title='Change theme'
        onClick={() => setOpen(o => !o)}
      >
        <PaletteIcon />
        <span className='theme-menu-label'>
          {variant === 'inline' ? 'Theme' : current.label}
        </span>
      </button>
    </div>
  )
}

// Resolves to true once the Google Identity Services script (added in
// index.html) has attached window.google.accounts.id.
function useGoogleReady() {
  const [ready, setReady] = useState(() => !!window.google?.accounts?.id)
  useEffect(() => {
    if (ready) return
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        setReady(true)
        clearInterval(timer)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [ready])
  return ready
}

// True while the viewport is at/below the mobile breakpoint. Drives the
// off-canvas sidebar drawer.
function useIsMobile(query = '(max-width: 768px)') {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}

// Full-screen "brewing" animation shown while an async view transition is in
// flight (initial data fetch, sign-in exchange). The status line escalates so a
// slow free-tier cold start doesn't look like a hang.
function LoadingScreen({ title = 'Pouring your lists…' }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 4000)
    const t2 = setTimeout(() => setPhase(2), 12000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const message =
    phase === 0 ? title
    : phase === 1 ? 'Still brewing…'
    : 'Waking the server — the first load after a while can take up to a minute.'

  return (
    <div className='loading-screen' role='status' aria-live='polite'>
      <svg className='loading-cup' viewBox='0 0 120 120' width='96' height='96' aria-hidden='true'>
        <path className='steam-wisp' d='M46 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <path className='steam-wisp' d='M60 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <path className='steam-wisp' d='M74 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <ellipse className='cup-rim' cx='60' cy='46' rx='30' ry='6' />
        <path className='cup-body' d='M30 46 h60 v22 a18 18 0 0 1 -18 18 h-24 a18 18 0 0 1 -18 -18 z' />
        <path className='cup-handle' d='M90 52 h5 a12 12 0 0 1 0 24 h-5' />
        <ellipse className='cup-coffee' cx='60' cy='46' rx='24' ry='4' />
        <rect className='cup-saucer' x='26' y='98' width='68' height='7' rx='3.5' />
      </svg>
      <span className='loading-word'>Latte</span>
      <p className='loading-msg'>{message}</p>
    </div>
  )
}

// Placeholder shown for a workspace section that isn't built yet.
function ComingSoon({ title }) {
  return (
    <div className='coming-soon'>
      <svg className='loading-cup' viewBox='0 0 120 120' width='108' height='108' aria-hidden='true'>
        <path className='steam-wisp' d='M46 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <path className='steam-wisp' d='M60 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <path className='steam-wisp' d='M74 46 c -5 -8 5 -13 0 -21 c -5 -8 5 -13 0 -21' />
        <ellipse className='cup-rim' cx='60' cy='46' rx='30' ry='6' />
        <path className='cup-body' d='M30 46 h60 v22 a18 18 0 0 1 -18 18 h-24 a18 18 0 0 1 -18 -18 z' />
        <path className='cup-handle' d='M90 52 h5 a12 12 0 0 1 0 24 h-5' />
        <ellipse className='cup-coffee' cx='60' cy='46' rx='24' ry='4' />
        <rect className='cup-saucer' x='26' y='98' width='68' height='7' rx='3.5' />
      </svg>
      <span className='cs-badge'>Coming soon</span>
      <h1 className='cs-title'>Your {title} is still brewing</h1>
      <p className='cs-msg'>This feature is still under development. Check back soon.</p>
    </div>
  )
}

// Full-screen gate shown whenever there is no valid session. Renders Google's
// own button; on success it exchanges the Google credential for our app JWT
// (googleLogin) and hands the profile up via onLogin.
function LoginScreen({ onLogin, onBack }) {
  const googleReady = useGoogleReady()
  const buttonRef = useRef(null)
  const [error, setError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!googleReady || !buttonRef.current) return
    const { google } = window
    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        try {
          setError(null)
          setSigningIn(true)
          const user = await googleLogin(credential)
          onLogin(user)
        } catch (err) {
          setSigningIn(false)
          setError(err.message || 'Sign-in failed. Please try again.')
        }
      },
    })
    buttonRef.current.innerHTML = '' // avoid a duplicate button under StrictMode
    // This GIS button is rendered invisibly under our own styled face
    // (.google-signin-face) so no white Google chrome shows on any theme.
    google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      width: 260,
    })
  }, [googleReady, onLogin, signingIn])

  if (signingIn) return <LoadingScreen title='Signing you in…' />

  return (
    <div className='login-screen'>
      <div className='login-card'>
        {onBack && (
          <button className='login-back' onClick={onBack}>← Back</button>
        )}
        <h1 className='login-logo'>Latte</h1>
        <p className='login-tagline'>
          Your morning companion for staying organized.
        </p>
        <div className='google-signin'>
          <span className='google-signin-face' aria-hidden='true'>
            <GoogleG />
            <span>Continue with Google</span>
          </span>
          <div ref={buttonRef} className='google-signin-real' />
        </div>
        {!googleReady && <p className='login-hint'>Loading sign-in…</p>}
        {error && <p className='login-error'>{error}</p>}
      </div>
    </div>
  )
}

const LIST_CONFIG = {
  todo: {
    name: 'To-Do List',
    description: 'Track your daily tasks with due dates, times, and status. Stay on top of what needs to be done.',
    columns: [
      { key: 'task', label: 'Task', type: 'text', placeholder: 'Enter task...' },
      { key: 'dueDate', label: 'Due Date', type: 'date', placeholder: 'Select date' },
      { key: 'dueTime', label: 'Due Time', type: 'time', placeholder: 'Select time' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    statusOptions: ['Pending', 'In Progress', 'Completed'],
    rowTemplate: () => ({ id: newRowId(), task: '', dueDate: '', dueTime: '', status: 'Pending' }),
    newRowBtn: '+ Add Task',
  },
  bucket: {
    name: 'Bucket List',
    description: 'Dream big. Keep track of the experiences, goals, and adventures you want to accomplish in life.',
    columns: [
      { key: 'item', label: 'Item', type: 'text', placeholder: 'Enter item...' },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Travel, Skill' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    statusOptions: ['Not Started', 'In Progress', 'Done'],
    rowTemplate: () => ({ id: newRowId(), item: '', category: '', status: 'Not Started' }),
    newRowBtn: '+ Add Item',
  },
  timetable: {
    name: 'Timetable',
    description: 'Organize your weekly schedule. Plan your classes, meetings, and recurring activities in one view.',
    columns: [
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Enter subject...' },
      { key: 'day', label: 'Day', type: 'text', placeholder: 'e.g. Monday' },
      { key: 'startTime', label: 'Start Time', type: 'time', placeholder: 'Select time' },
      { key: 'endTime', label: 'End Time', type: 'time', placeholder: 'Select time' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    statusOptions: ['Upcoming', 'Ongoing', 'Done'],
    rowTemplate: () => ({ id: newRowId(), subject: '', day: '', startTime: '', endTime: '', status: 'Upcoming' }),
    newRowBtn: '+ Add Entry',
  },
}

// Compares only the parts that get persisted, so a change to the local-only
// `saved` flag doesn't register as an unsaved edit.
const sheetSnapshot = (list) => JSON.stringify({ name: list.name, rows: list.rows })

// Generic "are you sure" gate for destructive, hard-to-undo actions (deleting
// an entire sheet or list). Row-level deletes stay a single click with an
// undo toast instead — the two are different blast radii on purpose.
function ConfirmDialog({ title, text, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className='modal-overlay' onClick={onCancel}>
      <div className='modal' onClick={(e) => e.stopPropagation()} role='alertdialog' aria-modal='true' aria-label={title}>
        <h2 className='modal-title'>{title}</h2>
        <p className='modal-text'>{text}</p>
        <div className='modal-actions'>
          <button className='modal-btn cancel' onClick={onCancel} autoFocus>Cancel</button>
          <button className='modal-btn danger' onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// Enter/Space activates a non-native `role="button"` element (our table
// cells are <td>s so they can sit in normal tab order without restructuring
// the grid). Space is prevented so it doesn't also scroll the page.
const onActivateKey = (fn) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

function SheetView({ config, list, setList, onSave, onDeleteList, onBack, unsaved }) {
  const [editingCell, setEditingCell] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // { row, index } — undo window
  const [saving, setSaving] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(list.name)

  const saved = list.saved
  const isDraft = list.id == null // never persisted yet
  // Content as it was when this sheet was opened. Edits are measured against
  // this; an unchanged sheet (incl. a fresh draft) never auto-saves.
  const snapshotRef = useRef(sheetSnapshot(list))

  const addRow = () => {
    setList({ ...list, rows: [...list.rows, config.rowTemplate()], saved: false })
  }

  // Single click, no confirmation — but the row stays recoverable for a few
  // seconds via an undo toast instead of a modal on every row delete.
  const deleteRow = (id) => {
    const index = list.rows.findIndex(row => row.id === id)
    if (index === -1) return
    setPendingDelete({ row: list.rows[index], index })
    setList({
      ...list,
      rows: list.rows.filter(row => row.id !== id),
      saved: false,
    })
  }

  const undoDeleteRow = () => {
    if (!pendingDelete) return
    const rows = [...list.rows]
    rows.splice(pendingDelete.index, 0, pendingDelete.row)
    setList({ ...list, rows, saved: false })
    setPendingDelete(null)
  }

  useEffect(() => {
    if (!pendingDelete) return
    const t = setTimeout(() => setPendingDelete(null), 6000)
    return () => clearTimeout(t)
  }, [pendingDelete])

  const updateCell = (id, field, value) => {
    setList({
      ...list,
      rows: list.rows.map(row => row.id === id ? { ...row, [field]: value } : row),
      saved: false,
    })
  }

  const cycleStatus = (id) => {
    const order = config.statusOptions
    setList({
      ...list,
      rows: list.rows.map(row => {
        if (row.id === id) {
          const next = order[(order.indexOf(row.status) + 1) % order.length]
          return { ...row, status: next }
        }
        return row
      }),
      saved: false,
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const ok = await onSave() // App does the PUT and flips list.saved
    setSaving(false)
    if (ok) {
      snapshotRef.current = sheetSnapshot(list)
      setShowConfirmModal(false)
    }
    return ok
  }

  const handleBack = () => {
    const dirty = sheetSnapshot(list) !== snapshotRef.current
    if (isDraft && !dirty) {
      onDeleteList() // untouched draft — drop it, nothing was persisted
      return
    }
    if (!saved && dirty) {
      setShowConfirmModal(true)
      return
    }
    onBack()
  }

  // "Save" button inside the unsaved-changes modal: persist, then leave.
  const handleSaveAndLeave = async () => {
    const ok = await handleSave()
    if (ok) onBack()
  }

  const startRename = () => {
    setNameDraft(list.name)
    setEditingName(true)
  }

  const commitRename = () => {
    setEditingName(false)
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== list.name) {
      setList({ ...list, name: trimmed, saved: false }) // auto-save persists it
    }
  }

  // Step 5: debounced auto-save. Fires ~1.2s after the last edit, but only once
  // the sheet actually differs from how it was opened — so an untouched draft
  // is never persisted. `list` is a fresh object per change, so the effect
  // re-runs and the timer restarts (standard debounce).
  useEffect(() => {
    if (saved || saving) return
    if (sheetSnapshot(list) === snapshotRef.current) return
    const timer = setTimeout(() => { handleSave() }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, saved, saving])

  const handleDiscard = () => {
    if (isDraft) {
      onDeleteList() // never persisted — drop the draft entirely
      return
    }
    // revert name + rows to the last saved snapshot, keep id, mark clean
    setList({ ...list, ...JSON.parse(snapshotRef.current), saved: true })
    onBack()
  }

  // status colour comes from the theme via a status-{0,1,2} class
  const statusIndex = (status) => Math.max(0, config.statusOptions.indexOf(status))

  return (
    <div className='sheet-view'>
      <div className='sheet-header'>
        <div className='sheet-title-row'>
          <button className='back-btn' onClick={handleBack} title='Go back'>← Back</button>
          {editingName ? (
            <input
              className='sheet-name-input'
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditingName(false)
              }}
              autoFocus
            />
          ) : (
            <h1
              id='sheetName'
              className='sheet-name'
              onClick={startRename}
              title='Click to rename'
            >
              {list.name || config.name}
            </h1>
          )}
          {unsaved && <span className='unsaved-dot' title='Unsaved changes'>●</span>}
        </div>
        <div className='sheet-actions'>
          <button className={`save-btn ${saved ? 'saved' : ''}`} onClick={handleSave} disabled={saved || saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button className='delete-sheet-btn' onClick={() => setConfirmDeleteSheet(true)} title='Delete this sheet'>Delete Sheet</button>
        </div>
      </div>
      <div id='sheetContainer'>
        <table id='sheet'>
          <thead>
            <tr>
              <th>#</th>
              {config.columns.map(col => <th key={col.key}>{col.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((row, index) => (
              <tr key={row.id}>
                <td className='row-number'>{index + 1}</td>
                {config.columns.map(col => {
                  if (col.type === 'status') {
                    const cycle = () => cycleStatus(row.id)
                    return (
                      <td
                        key={col.key}
                        className='cell status-cell'
                        tabIndex={0}
                        role='button'
                        aria-label={`${col.label}: ${row[col.key]}. Press Enter to change.`}
                        onClick={cycle}
                        onKeyDown={onActivateKey(cycle)}
                      >
                        <span className={`status-badge status-${statusIndex(row[col.key])}`}>
                          {row[col.key]}
                        </span>
                      </td>
                    )
                  }
                  const isEditing = editingCell?.id === row.id && editingCell?.field === col.key
                  const startEdit = () => setEditingCell({ id: row.id, field: col.key })
                  return (
                    <td
                      key={col.key}
                      className='cell editable'
                      tabIndex={isEditing ? -1 : 0}
                      role='button'
                      aria-label={`${col.label}: ${row[col.key] || col.placeholder}. Press Enter to edit.`}
                      onClick={startEdit}
                      onKeyDown={onActivateKey(startEdit)}
                    >
                      {isEditing ? (
                        <input
                          type={col.type}
                          value={row[col.key]}
                          onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') setEditingCell(null)
                          }}
                          autoFocus
                        />
                      ) : (
                        row[col.key] || <span className='placeholder'>{col.placeholder}</span>
                      )}
                    </td>
                  )
                })}
                <td className='cell delete-cell'>
                  <button onClick={() => deleteRow(row.id)} aria-label={`Delete row ${index + 1}`} title='Delete row'>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button id='addRowBtn' onClick={addRow}>{config.newRowBtn}</button>
      {pendingDelete && (
        <div className='undo-toast' role='status'>
          <span>Row removed</span>
          <button className='undo-toast-btn' onClick={undoDeleteRow}>Undo</button>
        </div>
      )}
      {confirmDeleteSheet && (
        <ConfirmDialog
          title='Delete this sheet?'
          text={`"${list.name || config.name}" and everything in it — ${list.rows.length} item${list.rows.length !== 1 ? 's' : ''} — will be permanently deleted.`}
          onCancel={() => setConfirmDeleteSheet(false)}
          onConfirm={() => { setConfirmDeleteSheet(false); onDeleteList() }}
        />
      )}
      {showConfirmModal && (
        <div className='modal-overlay' onClick={() => setShowConfirmModal(false)}>
          <div className='modal' onClick={(e) => e.stopPropagation()}>
            <h2 className='modal-title'>Unsaved Changes</h2>
            <p className='modal-text'>You have unsaved changes in this sheet. What would you like to do?</p>
            <div className='modal-actions three-btns'>
              <button className='modal-btn cancel' onClick={() => setShowConfirmModal(false)}>Stay</button>
              <button className='modal-btn discard' onClick={handleDiscard}>Discard</button>
              <button className='modal-btn confirm' onClick={handleSaveAndLeave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ListLanding({ type, config, lists, onSelect, onCreate, onDelete }) {
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null)
  const empty = lists.length === 0

  return (
    <div id='listLanding'>
      <h1 id='listTitle'>{config.name}</h1>
      <p id='listDesc'>{config.description}</p>
      {empty && (
        <p className='landing-empty'>Nothing here yet.</p>
      )}
      <div id='listCards'>
        {lists.map((l, i) => (
          <div key={l.id ?? i} className='home-card-wrapper'>
            <button className='home-card' onClick={() => onSelect(i)}>
              <span className='home-card-title'>
                {l.name}
                {!l.saved && <span className='dirty-dot' title='Unsaved changes'> ●</span>}
              </span>
              <span className='home-card-desc'>{l.rows.length} item{l.rows.length !== 1 ? 's' : ''}</span>
            </button>
            <button
              className='delete-card-btn'
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteIndex(i) }}
              aria-label={`Delete ${l.name}`}
              title='Delete'
            >×</button>
          </div>
        ))}
      </div>
      <button
        className={`home-card new-list-card${empty ? ' primary' : ''}`}
        onClick={onCreate}
      >
        <span className='home-card-title'>+ New List</span>
      </button>
      {confirmDeleteIndex !== null && (
        <ConfirmDialog
          title='Delete this list?'
          text={`"${lists[confirmDeleteIndex].name}" and everything in it — ${lists[confirmDeleteIndex].rows.length} item${lists[confirmDeleteIndex].rows.length !== 1 ? 's' : ''} — will be permanently deleted.`}
          onCancel={() => setConfirmDeleteIndex(null)}
          onConfirm={() => { onDelete(confirmDeleteIndex); setConfirmDeleteIndex(null) }}
        />
      )}
    </div>
  )
}

function NewSheetModal({ config, onCreate, onCancel }) {
  const [name, setName] = useState('')

  const handleSubmit = () => {
    onCreate(name.trim() || `Untitled ${config.name}`)
  }

  return (
    <div className='modal-overlay' onClick={onCancel}>
      <div className='modal' onClick={(e) => e.stopPropagation()}>
        <h2 className='modal-title'>Create New {config.name}</h2>
        <input
          className='modal-input'
          type='text'
          placeholder='Enter sheet name...'
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus
        />
        <div className='modal-actions'>
          <button className='modal-btn cancel' onClick={onCancel}>Cancel</button>
          <button className='modal-btn confirm' onClick={handleSubmit}>Create</button>
        </div>
      </div>
    </div>
  )
}

// Public landing page for logged-out visitors. Mirrors the in-app home
// section (title, tagline, gold feature cards) but with no sidebar and a single
// sign-in call to action instead of clickable list types.
function LandingPage({ onGetStarted }) {
  return (
    <div className='landing'>
      <div className='landing-inner'>
        <h1 id='homeTitle'>Latte</h1>
        <p id='homeDesc'>
          Your morning companion for staying organized. Manage your tasks,
          bucket lists, schedules, and more — all in one place.
        </p>
        <div id='homeCards'>
          {['todo', 'bucket', 'timetable'].map(type => (
            <div key={type} className='home-card static'>
              <span className='home-card-title'>{LIST_CONFIG[type].name}</span>
              <span className='home-card-desc'>
                {LIST_CONFIG[type].description.split('.')[0]}.
              </span>
            </div>
          ))}
          <div className='home-card static'>
            <span className='home-card-title'>Calendar</span>
            <span className='home-card-desc'>View your month at a glance</span>
          </div>
        </div>
        <button className='landing-cta' onClick={onGetStarted}>
          Get started — Sign in with Google
        </button>
      </div>
    </div>
  )
}

function App() {
  // Session: hydrate from localStorage so a refresh stays logged in. The
  // cached profile is only for painting the sidebar; the real gate is the JWT.
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null))
  const [showLogin, setShowLogin] = useState(false) // landing page -> login screen
  const [theme, setTheme] = useThemeState()

  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false) // mobile sidebar drawer
  const [activeSection, setActiveSection] = useState('home')
  const [activeListIndex, setActiveListIndex] = useState(null)
  const [lists, setLists] = useState(EMPTY_LISTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNewSheetModal, setShowNewSheetModal] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState({ todo: true, bucket: false, timetable: false })

  const listTypes = ['todo', 'bucket', 'timetable']

  // Any failed request lands here. A 401 means the JWT is dead -> sign out;
  // anything else shows a dismissable banner.
  const handleApiError = (err) => {
    if (err?.status === 401) {
      setUser(null)
      return
    }
    setError(err?.message || 'Something went wrong. Please try again.')
  }

  // Load every sheet once, right after we have a session, and group by type.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    listSheets()
      .then((sheets) => {
        if (cancelled) return
        const grouped = { todo: [], bucket: [], timetable: [] }
        for (const s of sheets) {
          if (!grouped[s.list_type]) continue
          grouped[s.list_type].push({ id: s.id, name: s.name, rows: s.rows, saved: true })
        }
        setLists(grouped)
      })
      .catch((err) => { if (!cancelled) handleApiError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  // Auto-dismiss the error banner after a few seconds.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(t)
  }, [error])

  const handleLogout = () => {
    window.google?.accounts?.id?.disableAutoSelect?.()
    clearSession()
    setUser(null)
    setShowLogin(false) // back to the landing page
    setLists(EMPTY_LISTS)
    setActiveSection('home')
    setActiveListIndex(null)
  }

  const navigateTo = (section, listIndex = null) => {
    setActiveSection(section)
    setActiveListIndex(listIndex)
    setMenuOpen(false) // tapping a destination closes the mobile drawer
  }

  // The drawer is a mobile-only concept: close it when we grow to desktop, and
  // let Escape dismiss it while it's open.
  useEffect(() => { if (!isMobile) setMenuOpen(false) }, [isMobile])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const toggleFolder = (type) => {
    setExpandedFolders(prev => ({ ...prev, [type]: !prev[type] }))
  }

  // Draft-first: a new sheet lives only in memory (id: null) until the first
  // real edit or a manual Save persists it. This avoids leaving empty sheets
  // on the server when a user creates one by mistake and backs out.
  const createNewList = (type, name) => {
    setShowNewSheetModal(false)
    const newIndex = lists[type].length
    setLists(prev => ({
      ...prev,
      [type]: [...prev[type], {
        id: null,
        name,
        rows: [LIST_CONFIG[type].rowTemplate()], // one row ready to fill in
        saved: false,
      }],
    }))
    navigateTo(type, newIndex)
  }

  const deleteList = async (type, index) => {
    const target = lists[type][index]
    try {
      if (target?.id != null) await deleteSheet(target.id)
    } catch (err) {
      handleApiError(err)
      return
    }
    const nextArr = lists[type].filter((_, i) => i !== index)
    setLists(prev => ({ ...prev, [type]: nextArr }))
    if (activeSection === type && activeListIndex === index) {
      setActiveListIndex(null)
    } else if (activeSection === type && activeListIndex != null && activeListIndex > index) {
      setActiveListIndex(activeListIndex - 1)
    }
  }

  // Local-only: cell edits shouldn't hit the network on every keystroke.
  const updateList = (type, index, updatedList) => {
    setLists(prev => ({
      ...prev,
      [type]: prev[type].map((l, i) => (i === index ? updatedList : l)),
    }))
  }

  // Persist the sheet. First save (id == null) creates it; later saves update.
  // Returns true on success so SheetView can react.
  const saveSheet = async (type, index) => {
    const sheet = lists[type][index]
    try {
      const s = sheet.id == null
        ? await createSheet(sheet.name, type, sheet.rows)
        : await updateSheet(sheet.id, { name: sheet.name, rows: sheet.rows })
      setLists(prev => ({
        ...prev,
        [type]: prev[type].map((l, i) =>
          i === index ? { ...l, id: s.id, name: s.name, rows: s.rows, saved: true } : l
        ),
      }))
      return true
    } catch (err) {
      handleApiError(err)
      return false
    }
  }

  const floatingThemeMenu = <ThemeMenu theme={theme} onChange={setTheme} variant='floating' />

  if (!user) {
    return (
      <>
        {floatingThemeMenu}
        {showLogin
          ? <LoginScreen onLogin={setUser} onBack={() => setShowLogin(false)} />
          : <LandingPage onGetStarted={() => setShowLogin(true)} />}
      </>
    )
  }

  if (loading) {
    return <>{floatingThemeMenu}<LoadingScreen /></>
  }

  return (
    <div id='body'>
      {isMobile && menuOpen && (
        <button
          id='menuBackdrop'
          aria-label='Close menu'
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div
        id='menu'
        className={`${menuCollapsed && !isMobile ? 'collapsed' : ''}${menuOpen ? ' open' : ''}`}
      >
        {menuCollapsed && !isMobile ? (
          <button id='menuToggle' onClick={() => setMenuCollapsed(false)}>→</button>
        ) : (
          <>
            <div id='user'>
              {user.picture && (
                <img
                  className='user-avatar'
                  src={user.picture}
                  alt=''
                  referrerPolicy='no-referrer'
                />
              )}
              <span className='user-label'>{user.name || user.email}</span>
              <button className='logout-btn' onClick={handleLogout} title='Log out'>
                Log out
              </button>
            </div>
            <div id='list'>
              {listTypes.map(type => (
                <div key={type} className='folder-group'>
                  <button
                    className={`folder-header ${expandedFolders[type] ? 'open' : ''}`}
                    onClick={() => toggleFolder(type)}
                  >
                    <span className='folder-arrow'>{expandedFolders[type] ? '▾' : '▸'}</span>
                    {LIST_CONFIG[type].name}
                  </button>
                  {expandedFolders[type] && (
                    <div className='folder-children'>
                      {lists[type].length === 0 && (
                        <span className='folder-empty'>No lists yet</span>
                      )}
                      {lists[type].map((sheet, i) => {
                        const isActive = activeSection === type && activeListIndex === i
                        return (
                          <button
                            key={sheet.id ?? i}
                            className={`sheet-file ${isActive ? 'active' : ''}`}
                            onClick={() => navigateTo(type, i)}
                          >
                            {sheet.name}
                            {!sheet.saved && <span className='dirty-dot' title='Unsaved changes'> ●</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <ThemeMenu theme={theme} onChange={setTheme} variant='inline' />
            <button
              id='menuCollapse'
              aria-label={isMobile ? 'Close menu' : 'Collapse menu'}
              onClick={() => (isMobile ? setMenuOpen(false) : setMenuCollapsed(true))}
            >←</button>
          </>
        )}
      </div>
      <div id='workspace'>
        <div id='navbar'>
          {isMobile && (
            <button
              id='menuOpenBtn'
              className='nav-btn'
              aria-label='Open menu'
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >☰</button>
          )}
          <button className={activeSection === 'home' ? 'nav-btn active' : 'nav-btn'} onClick={() => navigateTo('home')}>Home</button>
          {listTypes.map(type => (
            <button key={type} className={activeSection === type ? 'nav-btn active' : 'nav-btn'} onClick={() => navigateTo(type)}>
              {LIST_CONFIG[type].name}
            </button>
          ))}
          <button
            className={activeSection === 'calendar' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => navigateTo('calendar')}
          >
            Calendar
          </button>
        </div>
        {activeSection === 'home' ? (
          <div id='homeSection'>
            <h1 id='homeTitle'>Latte</h1>
            <p id='homeDesc'>Your morning companion for staying organized. Manage your tasks, bucket lists, schedules, and more — all in one place.</p>
            <div id='homeCards'>
              {listTypes.map(type => (
                <button key={type} className='home-card' onClick={() => navigateTo(type)}>
                  <span className='home-card-title'>{LIST_CONFIG[type].name}</span>
                  <span className='home-card-desc'>{LIST_CONFIG[type].description.split('.')[0]}.</span>
                </button>
              ))}
              <button className='home-card' onClick={() => navigateTo('calendar')}>
                <span className='home-card-title'>Calendar</span>
                <span className='home-card-desc'>View your month at a glance</span>
              </button>
            </div>
          </div>
        ) : activeSection === 'calendar' ? (
          <ComingSoon title='Calendar' />
        ) : (activeListIndex === null || !lists[activeSection][activeListIndex]) ? (
          <ListLanding
            type={activeSection}
            config={LIST_CONFIG[activeSection]}
            lists={lists[activeSection]}
            onSelect={(i) => navigateTo(activeSection, i)}
            onCreate={() => setShowNewSheetModal(true)}
            onDelete={(i) => deleteList(activeSection, i)}
          />
        ) : (
          <SheetView
            key={`${activeSection}-${activeListIndex}`}
            config={LIST_CONFIG[activeSection]}
            list={lists[activeSection][activeListIndex]}
            setList={(updated) => updateList(activeSection, activeListIndex, updated)}
            onSave={() => saveSheet(activeSection, activeListIndex)}
            onDeleteList={() => deleteList(activeSection, activeListIndex)}
            onBack={() => navigateTo(activeSection, null)}
            unsaved={lists[activeSection][activeListIndex] && !lists[activeSection][activeListIndex].saved}
          />
        )}
      </div>
      {error && (
        <div className='error-banner' role='alert'>
          <span>{error}</span>
          <button className='error-dismiss' onClick={() => setError(null)}>×</button>
        </div>
      )}
      {showNewSheetModal && (
        <NewSheetModal
          config={LIST_CONFIG[activeSection]}
          onCreate={(name) => createNewList(activeSection, name)}
          onCancel={() => setShowNewSheetModal(false)}
        />
      )}
    </div>
  )
}

export default App
