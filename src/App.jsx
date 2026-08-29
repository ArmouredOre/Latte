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

// Full-screen gate shown whenever there is no valid session. Renders Google's
// own button; on success it exchanges the Google credential for our app JWT
// (googleLogin) and hands the profile up via onLogin.
function LoginScreen({ onLogin }) {
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
    google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_blue',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: 260,
    })
  }, [googleReady, onLogin, signingIn])

  if (signingIn) return <LoadingScreen title='Signing you in…' />

  return (
    <div className='login-screen'>
      <div className='login-card'>
        <h1 className='login-logo'>Latte</h1>
        <p className='login-tagline'>
          Your morning companion for staying organized.
        </p>
        <div ref={buttonRef} className='google-btn-mount' />
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

function SheetView({ config, list, setList, onSave, onDeleteList, onBack, unsaved }) {
  const [editingCell, setEditingCell] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
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

  const deleteRow = (id) => {
    setList({
      ...list,
      rows: list.rows.length === 1 ? [] : list.rows.filter(row => row.id !== id),
      saved: false,
    })
  }

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

  const getStatusColor = (status) => {
    const colors = {}
    config.statusOptions.forEach((s, i) => {
      const palette = ['#5A321E', '#B4783C', '#DCA028', '#78503C', '#F0BE50']
      colors[s] = palette[i % palette.length]
    })
    return colors[status] || '#78503C'
  }

  const getStatusTextColor = (status) => {
    const darkBg = ['#5A321E', '#78503C']
    return darkBg.includes(getStatusColor(status)) ? '#FAF0AA' : '#32140A'
  }

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
          <button className='delete-sheet-btn' onClick={onDeleteList} title='Delete this sheet'>Delete Sheet</button>
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
                    return (
                      <td
                        key={col.key}
                        className='cell status-cell'
                        style={{ backgroundColor: getStatusColor(row[col.key]) + '30' }}
                        onClick={() => cycleStatus(row.id)}
                      >
                        <span className='status-badge' style={{ backgroundColor: getStatusColor(row[col.key]), color: getStatusTextColor(row[col.key]) }}>
                          {row[col.key]}
                        </span>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col.key}
                      className='cell editable'
                      onClick={() => setEditingCell({ id: row.id, field: col.key })}
                    >
                      {editingCell?.id === row.id && editingCell?.field === col.key ? (
                        <input
                          type={col.type}
                          value={row[col.key]}
                          onChange={(e) => updateCell(row.id, col.key, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingCell(null) }}
                          autoFocus
                        />
                      ) : (
                        row[col.key] || <span className='placeholder'>{col.placeholder}</span>
                      )}
                    </td>
                  )
                })}
                <td className='cell delete-cell'>
                  <button onClick={() => deleteRow(row.id)} title='Delete row'>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button id='addRowBtn' onClick={addRow}>{config.newRowBtn}</button>
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
  return (
    <div id='listLanding'>
      <h1 id='listTitle'>{config.name}</h1>
      <p id='listDesc'>{config.description}</p>
      {lists.length === 0 && (
        <p className='landing-empty'>Nothing here yet — create your first {config.name.toLowerCase()} below.</p>
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
            <button className='delete-card-btn' onClick={(e) => { e.stopPropagation(); onDelete(i) }} title='Delete'>×</button>
          </div>
        ))}
      </div>
      <button className='home-card new-list-card' onClick={onCreate}>
        <span className='home-card-title'>+ New List</span>
        <span className='home-card-desc'>Create a new list</span>
      </button>
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

function App() {
  // Session: hydrate from localStorage so a refresh stays logged in. The
  // cached profile is only for painting the sidebar; the real gate is the JWT.
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null))

  const [menuCollapsed, setMenuCollapsed] = useState(false)
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
    setLists(EMPTY_LISTS)
    setActiveSection('home')
    setActiveListIndex(null)
  }

  const navigateTo = (section, listIndex = null) => {
    setActiveSection(section)
    setActiveListIndex(listIndex)
  }

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

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div id='body'>
      <div id='menu' className={menuCollapsed ? 'collapsed' : ''}>
        {menuCollapsed ? (
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
            <button id='menuCollapse' onClick={() => setMenuCollapsed(true)}>←</button>
          </>
        )}
      </div>
      <div id='workspace'>
        <div id='navbar'>
          <button className={activeSection === 'home' ? 'nav-btn active' : 'nav-btn'} onClick={() => navigateTo('home')}>Home</button>
          {listTypes.map(type => (
            <button key={type} className={activeSection === type ? 'nav-btn active' : 'nav-btn'} onClick={() => navigateTo(type)}>
              {LIST_CONFIG[type].name}
            </button>
          ))}
          <button className='nav-btn'>Calendar</button>
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
              <button className='home-card'>
                <span className='home-card-title'>Calendar</span>
                <span className='home-card-desc'>View your month at a glance</span>
              </button>
            </div>
          </div>
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
