import { useState, useRef } from 'react'
import './App.css'

const STORAGE_KEY = 'latte-sheets'

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
    rowTemplate: () => ({ id: Date.now(), task: '', dueDate: '', dueTime: '', status: 'Pending' }),
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
    rowTemplate: () => ({ id: Date.now(), item: '', category: '', status: 'Not Started' }),
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
    rowTemplate: () => ({ id: Date.now(), subject: '', day: '', startTime: '', endTime: '', status: 'Upcoming' }),
    newRowBtn: '+ Add Entry',
  },
}

const DEFAULT_LISTS = {
  todo: [{ name: 'My Tasks', rows: [], saved: true }],
  bucket: [{ name: 'My Goals', rows: [], saved: true }],
  timetable: [{ name: 'Weekly Schedule', rows: [], saved: true }],
}

function loadLists() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        todo: parsed.todo || DEFAULT_LISTS.todo,
        bucket: parsed.bucket || DEFAULT_LISTS.bucket,
        timetable: parsed.timetable || DEFAULT_LISTS.timetable,
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_LISTS
}

function saveLists(lists) {
  const toSave = {}
  Object.keys(lists).forEach(type => {
    toSave[type] = lists[type].filter(s => s.saved)
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
}

function SheetView({ config, list, setList, onDeleteList, onBack, onDiscard, unsaved }) {
  const [editingCell, setEditingCell] = useState(null)
  const [saved, setSaved] = useState(true)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const snapshotRef = useRef(JSON.stringify(list))

  const addRow = () => {
    const updated = { ...list, rows: [...list.rows, config.rowTemplate()], saved: false }
    setList(updated)
    setSaved(false)
  }

  const deleteRow = (id) => {
    const updated = { ...list, rows: list.rows.length === 1 ? [] : list.rows.filter(row => row.id !== id), saved: false }
    setList(updated)
    setSaved(false)
  }

  const updateCell = (id, field, value) => {
    setList({
      ...list,
      rows: list.rows.map(row => row.id === id ? { ...row, [field]: value } : row),
      saved: false,
    })
    setSaved(false)
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
    setSaved(false)
  }

  const handleSave = () => {
    const updated = { ...list, saved: true }
    setList(updated)
    setSaved(true)
    snapshotRef.current = JSON.stringify(updated)
  }

  const handleBack = () => {
    const current = JSON.stringify(list)
    if (current !== snapshotRef.current && !saved) {
      setShowConfirmModal(true)
    } else {
      onBack()
    }
  }

  const handleDiscard = () => {
    onDiscard()
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
          <h1 id='sheetName'>{list.name || config.name}</h1>
          {unsaved && <span className='unsaved-dot' title='Unsaved changes'>●</span>}
        </div>
        <div className='sheet-actions'>
          <button className={`save-btn ${saved ? 'saved' : ''}`} onClick={handleSave} disabled={saved}>
            {saved ? '✓ Saved' : 'Save'}
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
              <button className='modal-btn confirm' onClick={handleSave}>Save</button>
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
      <div id='listCards'>
        {lists.map((l, i) => (
          <div key={i} className='home-card-wrapper'>
            <button className='home-card' onClick={() => onSelect(i)}>
              <span className='home-card-title'>{l.name}</span>
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
    const trimmed = name.trim()
    onCreate(trimmed || `${config.name} ${Date.now()}`)
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
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const [activeListIndex, setActiveListIndex] = useState(null)
  const [lists, setLists] = useState(loadLists)
  const [showNewSheetModal, setShowNewSheetModal] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState({ todo: true, bucket: false, timetable: false })

  const listTypes = ['todo', 'bucket', 'timetable']

  const navigateTo = (section, listIndex = null) => {
    setActiveSection(section)
    setActiveListIndex(listIndex)
  }

  const toggleFolder = (type) => {
    setExpandedFolders(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const createNewList = (type, name) => {
    const newList = { name, rows: [], saved: false }
    const updated = { ...lists, [type]: [...lists[type], newList] }
    setLists(updated)
    setActiveListIndex(updated[type].length - 1)
    setShowNewSheetModal(false)
  }

  const deleteList = (type, index) => {
    const updated = { ...lists, [type]: lists[type].filter((_, i) => i !== index) }
    setLists(updated)
    saveLists(updated)
    if (activeSection === type && activeListIndex === index) {
      setActiveListIndex(null)
    } else if (activeSection === type && activeListIndex != null) {
      const newIdx = lists[type].reduce((acc, _, i) => {
        if (i < activeListIndex && i !== index) return acc + 1
        return acc
      }, 0)
      setActiveListIndex(Math.min(newIdx, updated[type].length - 1))
    }
  }

  const updateList = (type, index, updatedList) => {
    const updated = { ...lists, [type]: lists[type].map((l, i) => i === index ? updatedList : l) }
    setLists(updated)
  }

  const saveSheet = (type, index) => {
    const updated = { ...lists, [type]: lists[type].map((l, i) => i === index ? { ...l, saved: true } : l) }
    setLists(updated)
    saveLists(updated)
  }

  const discardSheet = (type, index) => {
    const updated = { ...lists, [type]: lists[type].map((l, i) => i === index ? { ...l, saved: false } : l) }
    setLists(updated)
  }

  const savedLists = {}
  Object.keys(lists).forEach(type => {
    savedLists[type] = lists[type].filter(s => s.saved)
  })

  return (
    <div id='body'>
      <div id='menu' className={menuCollapsed ? 'collapsed' : ''}>
        {menuCollapsed ? (
          <button id='menuToggle' onClick={() => setMenuCollapsed(false)}>→</button>
        ) : (
          <>
            <div id='user'>
              <span className='user-label'>User</span>
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
                      {savedLists[type].map((sheet, i) => {
                        const originalIndex = lists[type].findIndex(s => s.name === sheet.name && s.saved)
                        const isActive = activeSection === type && activeListIndex === originalIndex
                        return (
                          <button
                            key={originalIndex}
                            className={`sheet-file ${isActive ? 'active' : ''}`}
                            onClick={() => navigateTo(type, originalIndex)}
                          >
                            {sheet.name}
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
        ) : activeListIndex === null ? (
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
            onDeleteList={() => deleteList(activeSection, activeListIndex)}
            onBack={() => navigateTo(activeSection, null)}
            onDiscard={() => discardSheet(activeSection, activeListIndex)}
            unsaved={lists[activeSection][activeListIndex] && !lists[activeSection][activeListIndex].saved}
          />
        )}
      </div>
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
