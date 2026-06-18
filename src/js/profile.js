import { supabase, ROLES } from './supabase'
import { getCurrentStaff } from './auth'
import { loadAchievements, openEditAchievementForm, deleteAchievement, openAchievementForm } from './achievements'
import { uploadCadetPhoto } from './storage'
import { setText, show, hide, escapeHTML, showToast, setButtonLoading } from './ui'

let activeCadetId = null

// ─── Close Profile ────────────────────────────────────────────────────────────

export function closeProfile() {
  hide('profileSection')
  activeCadetId = null
  
  // Restore the cadet records page if we navigated from there VIA THE ARROW
  // (i.e., breadcrumb was changed to "CADET PROFILE — ...")
  const titleEl = document.getElementById('currentPageTitle')
  const wasOnProfilePage = titleEl?.textContent?.startsWith('CADET PROFILE')
  
  if (wasOnProfilePage) {
    const cadetRecordsPage = document.getElementById('cadetRecordsPage')
    const cadetListStage = document.getElementById('cadetListStage')
    if (cadetRecordsPage && !cadetRecordsPage.classList.contains('hidden')) {
      if (cadetListStage) cadetListStage.classList.remove('hidden')
    }
    // Reset the breadcrumb title back to CADET RECORDS
    if (titleEl) titleEl.textContent = 'CADET RECORDS'
  }
}

// ─── Navigate to Cadet Profile Page (dedicated view) ──────────────────────────

export async function gotoCadetProfilePage(id) {
  const { data: cadet, error } = await supabase
    .from('cadets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    showToast(error.message, 'error')
    return
  }

  activeCadetId = id

  // Hide the cadet list stage to show only the profile (full-page view)
  const cadetListStage = document.getElementById('cadetListStage')
  if (cadetListStage) cadetListStage.classList.add('hidden')

  // Update breadcrumb
  const titleEl = document.getElementById('currentPageTitle')
  if (titleEl) titleEl.textContent = `CADET PROFILE — ${cadet.name?.toUpperCase() || ''}`

  await renderProfile(cadet)
  show('profileSection')

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ─── View Cadet Profile (READ-ONLY MODAL) ─────────────────────────────────────

export async function viewCadet(id) {
  const { data: cadet, error } = await supabase
    .from('cadets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    showToast(error.message, 'error')
    return
  }

  // Fetch achievements
  const { data: achievements } = await supabase
    .from('achievements')
    .select('*')
    .eq('cadet_id', id)
    .order('achievement_date', { ascending: false })

  showReadOnlyProfileModal(cadet, achievements || [])
}

function getOrdinal(n) {
  if (!n) return 'N/A'
  const num = parseInt(n)
  if (isNaN(num)) return n
  const s = ['th', 'st', 'nd', 'rd']
  const v = num % 100
  return num + (s[(v - 20) % 10] || s[v] || s[0])
}

async function showReadOnlyProfileModal(cadet, achievements) {
  // Remove any existing modal
  document.getElementById('readOnlyProfileModal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'readOnlyProfileModal'
  modal.className = 'readonly-profile-backdrop'

  const photoUrl = cadet.photo_url || 'https://placehold.co/250x300?text=No+Photo'

  modal.innerHTML = `
    <div class="readonly-profile-box">
      <button class="readonly-profile-close" id="closeReadOnlyProfileBtn" aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <!-- Hero -->
      <div class="readonly-profile-hero">
        <p class="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300/80 mb-3">Official Cadet Profile — CCAMS</p>
        <h2 class="text-2xl sm:text-3xl font-black mb-3 leading-tight">${escapeHTML(cadet.name || 'Unnamed Cadet')}</h2>
        <div class="flex flex-wrap gap-4 text-sm font-semibold text-white/90">
          <div class="inline-flex items-center gap-2">
            <i class="fa-solid fa-building-columns text-emerald-300/80 text-xs"></i>
            <span>${escapeHTML(cadet.college || 'N/A')}</span>
          </div>
          <div class="inline-flex items-center gap-2">
            <i class="fa-solid fa-calendar-days text-emerald-300/80 text-xs"></i>
            Intake: ${escapeHTML(getOrdinal(cadet.intake))}
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="readonly-profile-body">
        <div class="readonly-profile-grid">
          <!-- Photo -->
          <div>
            <img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(cadet.name)}" class="readonly-profile-photo">
          </div>

          <!-- Details -->
          <div class="readonly-detail-card">
            <div class="readonly-detail-row">
              <span class="readonly-detail-label">▸ Cadet No</span>
              <span class="readonly-detail-value">${escapeHTML(cadet.cadet_no || 'N/A')}</span>
            </div>
            <div class="readonly-detail-row">
              <span class="readonly-detail-label">▸ Intake</span>
              <span class="readonly-detail-value">${escapeHTML(cadet.intake || 'N/A')}</span>
            </div>
            <div class="readonly-detail-row">
              <span class="readonly-detail-label">▸ Class</span>
              <span class="readonly-detail-value">${escapeHTML(cadet.class_name || 'N/A')}</span>
            </div>
            <div class="readonly-detail-row">
              <span class="readonly-detail-label">▸ Form</span>
              <span class="readonly-detail-value">${escapeHTML(cadet.form || 'N/A')}</span>
            </div>
            <div class="readonly-detail-row">
              <span class="readonly-detail-label">▸ House</span>
              <span class="readonly-detail-value">${escapeHTML(cadet.house || 'N/A')}</span>
            </div>
          </div>
        </div>

        <!-- Achievements -->
        <div class="readonly-achievements-section">
          <h3 class="readonly-achievements-title">
            <i class="fa-solid fa-trophy"></i>
            Achievements & Honours
            <span class="readonly-achievements-count">${achievements.length} record${achievements.length !== 1 ? 's' : ''}</span>
          </h3>
          <div id="readOnlyAchievementsContainer"></div>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  document.body.style.overflow = 'hidden'

  // Render achievements (read-only mode)
  await loadAchievements(cadet.id, 'readOnlyAchievementsContainer', false)

  // Close on X button
  document.getElementById('closeReadOnlyProfileBtn')?.addEventListener('click', closeReadOnlyProfileModal)

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeReadOnlyProfileModal()
  })

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeReadOnlyProfileModal()
      document.removeEventListener('keydown', escHandler)
    }
  }
  document.addEventListener('keydown', escHandler)
}

function closeReadOnlyProfileModal() {
  document.getElementById('readOnlyProfileModal')?.remove()
  document.body.style.overflow = ''
}

export async function renderProfile(cadet) {
  const staff = getCurrentStaff()
  const canEdit = staff?.role === ROLES.FORM_MASTER

  // Photo
  const photo = document.getElementById('cadetPhoto')
  if (photo) {
    photo.src = cadet.photo_url || 'https://placehold.co/250x300?text=No+Photo'
    photo.alt = cadet.name || 'Cadet Photo'
  }

  // Helper function to add ordinal suffix
  const getOrdinal = (n) => {
    if (!n) return 'N/A'
    const num = parseInt(n)
    if (isNaN(num)) return n
    const s = ['th', 'st', 'nd', 'rd']
    const v = num % 100
    return num + (s[(v - 20) % 10] || s[v] || s[0])
  }

  // Basic info
  setText('cadetName', cadet.name || 'Unnamed Cadet')
  setText('cadetCollege', cadet.college || 'N/A')
  setText('cadetIntakeHeader', getOrdinal(cadet.intake))
  setText('cadetHouse', cadet.house || 'N/A')
  setText('profileCadetNo', cadet.cadet_no || 'N/A')
  setText('profileIntake', cadet.intake || 'N/A')
  setText('profileClass', cadet.class_name || 'N/A')
  setText('profileForm', cadet.form || 'N/A')

  // Photo upload control (form masters only)
  const photoUploadWrap = document.getElementById('photoUploadWrap')
  if (photoUploadWrap) {
    if (canEdit) {
      photoUploadWrap.classList.remove('hidden')
    } else {
      photoUploadWrap.classList.add('hidden')
    }
  }

  // Add Achievement button (form masters only) — wire both mobile and desktop versions
  const addAchievementBtn = document.getElementById('addAchievementFromProfileBtn')
  const addAchievementBtnDesktop = document.getElementById('addAchievementFromProfileBtnDesktop')
  ;[addAchievementBtn, addAchievementBtnDesktop].forEach(btn => {
    if (!btn) return
    if (canEdit) {
      btn.classList.remove('hidden')
      btn.onclick = () => { openAchievementForm(cadet.id) }
    } else {
      btn.classList.add('hidden')
    }
  })

  // Store cadet id on photo upload button
  const photoUploadBtn = document.getElementById('uploadPhotoBtn')
  if (photoUploadBtn) photoUploadBtn.dataset.cadetId = cadet.id

  await loadAchievements(cadet.id, 'profileAchievements', canEdit)
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export async function uploadProfilePhoto() {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only form masters can update cadet photos.', 'error')
    return
  }

  const fileInput = document.getElementById('profilePhotoFile')
  const file = fileInput?.files?.[0]

  if (!file) {
    showToast('Please select a photo file.', 'warning')
    return
  }

  if (!activeCadetId) {
    showToast('No cadet selected.', 'error')
    return
  }

  setButtonLoading('uploadPhotoBtn', true, 'Uploading...')

  try {
    const { data: cadet } = await supabase
      .from('cadets')
      .select('cadet_no')
      .eq('id', activeCadetId)
      .single()

    const photoUrl = await uploadCadetPhoto(file, cadet?.cadet_no || activeCadetId)

    const { error } = await supabase
      .from('cadets')
      .update({ photo_url: photoUrl })
      .eq('id', activeCadetId)

    if (error) throw error

    const photo = document.getElementById('cadetPhoto')
    if (photo) photo.src = photoUrl

    fileInput.value = ''
    showToast('Photo updated successfully.')
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    setButtonLoading('uploadPhotoBtn', false)
  }
}

// ─── Print ────────────────────────────────────────────────────────────────────

export async function printProfile() {
  if (!activeCadetId) {
    showToast('No cadet profile is open.', 'warning')
    return
  }

  // Fetch cadet info
  const { data: cadet } = await supabase
    .from('cadets')
    .select('*')
    .eq('id', activeCadetId)
    .single()

  if (!cadet) { showToast('Could not load cadet data.', 'error'); return }

  // Fetch all achievements
  const { data: achievements } = await supabase
    .from('achievements')
    .select('*')
    .eq('cadet_id', activeCadetId)
    .order('achievement_date', { ascending: true })

  const allAch = achievements || []

  // ── Parse academics into a keyed map ──────────────────────────────────────
  // Key: gradeLabel (VII, VIII, IX, X, XI, XII, SSC, HSC)
  const academicMap = {}
  allAch.filter(a => a.category === 'Academics').forEach(a => {
    const parsed = parseAcademicForPrint(a)
    if (parsed.gradeLabel) {
      // If duplicate, keep the latest (last one wins)
      academicMap[parsed.gradeLabel] = parsed
    }
  })

  // ── Separate competition achievements ────────────────────────────────────
  const extraCurricular = allAch.filter(a =>
    a.category !== 'Academics' && extractActivityType(a) === 'Extra-Curricular'
  )
  const coCurricular = allAch.filter(a =>
    a.category !== 'Academics' && extractActivityType(a) === 'Co-Curricular'
  )
  const otherAch = allAch.filter(a =>
    a.category !== 'Academics' &&
    extractActivityType(a) !== 'Extra-Curricular' &&
    extractActivityType(a) !== 'Co-Curricular'
  )

  // ── Build the print frame ─────────────────────────────────────────────────
  const frame = document.createElement('div')
  frame.id = 'ccams-print-frame'
  frame.innerHTML = buildPrintHTML(cadet, academicMap, extraCurricular, coCurricular, otherAch)
  document.body.appendChild(frame)

  // Force light theme
  const html = document.documentElement
  const prevTheme = html.getAttribute('data-theme')
  html.setAttribute('data-theme', 'light')

  const cleanup = () => {
    frame.remove()
    if (prevTheme) html.setAttribute('data-theme', prevTheme)
    else html.removeAttribute('data-theme')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  setTimeout(cleanup, 3000) // fallback

  window.print()
}

// ─── Parse academic achievement for print ────────────────────────────────────

function parseAcademicForPrint(item) {
  const desc = item.description || ''
  let layout = 'terms', gradeLabel = '', year = ''
  const examData = {}

  if (item.achievement_date) {
    const m = String(item.achievement_date).match(/^(\d{4})/)
    if (m) year = m[1]
  }

  if (desc.startsWith('ACADEMICS|')) {
    desc.substring(10).split('|').forEach(pair => {
      const [key, ...valParts] = pair.split('=')
      const val = valParts.join('=')
      if      (key === 'layout')  layout     = val
      else if (key === 'grade')   gradeLabel = val
      else if (key === 'year')    year       = val
      else                        examData[key] = val
    })
  }
  return { layout, gradeLabel, year, examData }
}

// ─── Extract activity type from achievement META ──────────────────────────────

function extractActivityType(item) {
  const desc = item.description || ''
  const metaLine = desc.split('\n').find(l => l.startsWith('META|'))
  if (!metaLine) return ''
  let activityType = ''
  metaLine.substring(5).split('|').forEach(pair => {
    const [key, ...v] = pair.split('=')
    if (key === 'activityType') activityType = v.join('=')
  })
  return activityType
}

// ─── Format competition title for print ──────────────────────────────────────

function formatAchForPrint(item) {
  const desc = item.description || ''
  const metaLine = desc.split('\n').find(l => l.startsWith('META|')) || ''
  let honours = '', extra = ''
  metaLine.substring(5).split('|').forEach(pair => {
    const [key, ...v] = pair.split('=')
    if (key === 'honours') honours = v.join('=')
    if (key === 'extra')   extra   = v.join('=')
  })

  const typeLabels = {
    'Inter-house': 'Inter House', 'Inter-college': 'Inter Cadet College',
    'National': 'National', 'International': 'International'
  }
  const typeLabel = typeLabels[item.category] || item.category
  const title = item.title || ''
  const level = item.level || ''

  // Strip the type prefix from title for a cleaner display
  let shortTitle = title
  if (shortTitle.startsWith(typeLabel + ' ')) shortTitle = shortTitle.slice(typeLabel.length + 1)

  const extras = [level, honours, extra].filter(Boolean).join(' · ')
  return { shortTitle, extras, category: item.category, typeLabel }
}

// ─── Build complete print HTML ────────────────────────────────────────────────

function buildPrintHTML(cadet, academicMap, extraCurricular, coCurricular, otherAch) {
  const getOrd = n => {
    const num = parseInt(n); if (isNaN(num)) return n || ''
    const s = ['th','st','nd','rd'], v = num % 100
    return num + (s[(v-20)%10] || s[v] || s[0])
  }

  // ── Academic table columns definition ────────────────────────────────────
  // Each column has: key (gradeLabel), label, subRows array of {id, label}
  const ACAD_COLS = [
    { key: 'VII',  label: 'VII',  rows: [
      { id: 't1', label: '1st Term' },
      { id: 't2', label: '2nd Term' },
      { id: 't3', label: '3rd Term' }
    ]},
    { key: 'VIII', label: 'VIII', rows: [
      { id: 't1', label: '1st Term' },
      { id: 't2', label: '2nd Term' },
      { id: 't3', label: '3rd Term' }
    ]},
    { key: 'IX',   label: 'IX',   rows: [
      { id: 't1', label: '1st Term' },
      { id: 't2', label: '2nd Term' },
      { id: 't3', label: '3rd Term' }
    ]},
    { key: 'X',    label: 'X',    rows: [
      { id: 't1',   label: '1st Term' },
      { id: 'pre',  label: 'Pre-Test' },
      { id: 'test', label: 'Test Exam' }
    ]},
    { key: 'XI',   label: 'XI',   rows: [
      { id: 't1', label: '1st Term' },
      { id: 't2', label: '2nd Term' },
      { id: 't3', label: '3rd Term' }
    ]},
    { key: 'XII',  label: 'XII',  rows: [
      { id: 'pre',   label: 'Pre-Test' },
      { id: 'test',  label: 'Test Exam' },
      { id: 'model', label: 'Progress Test' }
    ]},
    { key: 'SSC',  label: 'SSC',  rows: [
      { id: 'board', label: 'GPA' },
      { id: 'bpos',  label: 'Board Pos.' }
    ]},
    { key: 'HSC',  label: 'HSC',  rows: [
      { id: 'board', label: 'GPA' },
      { id: 'bpos',  label: 'Board Pos.' }
    ]}
  ]

  // Max sub-rows across all columns (for row span calculation)
  const maxRows = Math.max(...ACAD_COLS.map(c => c.rows.length))

  // Helper: get value for a cell
  function getAcadCell(colKey, rowId) {
    const d = academicMap[colKey]
    if (!d) return ''
    const e = d.examData
    switch (rowId) {
      case 't1':    return e.t1gpa    || ''
      case 't2':    return e.t2gpa    || ''
      case 't3':    return e.t3gpa    || ''
      case 'pre':   return e.pregpa   || ''
      case 'test':  return e.testgpa  || ''
      case 'model': return e.modelgpa || ''
      case 'board': return e.boardgpa || ''
      case 'bpos':  return e.boardpos || ''
      default:      return ''
    }
  }

  function getAcadPos(colKey, rowId) {
    const d = academicMap[colKey]
    if (!d) return ''
    const e = d.examData
    switch (rowId) {
      case 't1':    return e.t1pos    || ''
      case 't2':    return e.t2pos    || ''
      case 't3':    return e.t3pos    || ''
      case 'pre':   return e.prepos   || ''
      case 'test':  return e.testpos  || ''
      case 'model': return e.modelpos || ''
      default:      return ''
    }
  }

  // ── Build the academic table ──────────────────────────────────────────────
  // Row 1: class headers (each spans its sub-column count)
  const headerRow = ACAD_COLS.map(col =>
    `<th colspan="${col.rows.length}" class="pt-acad-class">${col.label}</th>`
  ).join('')

  // Row 2: exam sub-labels
  const subLabelRow = ACAD_COLS.flatMap(col =>
    col.rows.map(r => `<th class="pt-acad-sub">${r.label}</th>`)
  ).join('')

  // Data rows: GPA row + Position row
  const gpaRow = `<td class="pt-row-label">GPA</td>` +
    ACAD_COLS.flatMap(col =>
      col.rows.map(r => {
        const val = getAcadCell(col.key, r.id)
        return `<td class="pt-acad-cell ${val ? 'pt-has-val' : ''}">${val}</td>`
      })
    ).join('')

  const posRow = `<td class="pt-row-label">Position</td>` +
    ACAD_COLS.flatMap(col =>
      col.rows.map(r => {
        const val = r.id === 'bpos' ? getAcadCell(col.key, 'bpos') : getAcadPos(col.key, r.id)
        return `<td class="pt-acad-cell ${val ? 'pt-has-val' : ''}">${val}</td>`
      })
    ).join('')

  // ── Competition achievements ──────────────────────────────────────────────
  function renderAchList(items) {
    if (!items.length) return '<span class="pt-empty">—</span>'
    return items.map(item => {
      const f = formatAchForPrint(item)
      return `<div class="pt-ach-item">
        <span class="pt-ach-title">${escapeHTML(f.shortTitle)}</span>
        ${f.extras ? `<span class="pt-ach-level">${escapeHTML(f.extras)}</span>` : ''}
      </div>`
    }).join('')
  }

  const allCompetition = [...extraCurricular, ...coCurricular, ...otherAch]

  // Group competition items by category for display
  const byCategory = {}
  allCompetition.forEach(item => {
    const cat = item.category || 'Other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(item)
  })

  const catOrder = ['Inter-house', 'Inter-college', 'National', 'International']
  const catLabels = {
    'Inter-house': 'Inter House',
    'Inter-college': 'Inter Cadet College',
    'National': 'National',
    'International': 'International'
  }

  const achievementsHTML = catOrder
    .filter(cat => byCategory[cat]?.length)
    .map(cat => `
      <div class="pt-ach-cat-block">
        <div class="pt-ach-cat-label">${catLabels[cat] || cat}</div>
        <div class="pt-ach-cat-items">${renderAchList(byCategory[cat])}</div>
      </div>
    `).join('') || '<span class="pt-empty">No competition records found.</span>'

  // ── Photo ─────────────────────────────────────────────────────────────────
  const photoSrc = cadet.photo_url || ''
  const photoHTML = photoSrc
    ? `<img class="pt-photo" src="${escapeHTML(photoSrc)}" alt="Cadet Photo">`
    : `<div class="pt-photo-placeholder">No Photo</div>`

  return `
  <div class="pt-page">

    <!-- ══ HEADER ══════════════════════════════════════════ -->
    <div class="pt-header">
      <div class="pt-header-left">
        <div class="pt-college">${escapeHTML(cadet.college || '')}</div>
        <div class="pt-title">Cadet Achievement Record</div>
        <div class="pt-subtitle">Cadet College Achievement Management System (CCAMS)</div>
      </div>
      <div class="pt-header-center">
        <div class="pt-cadet-name">${escapeHTML(cadet.name || '')}</div>
        <div class="pt-cadet-meta">
          <span>Cadet No: <strong>${escapeHTML(cadet.cadet_no || '—')}</strong></span>
          <span>Intake: <strong>${escapeHTML(getOrd(cadet.intake))}</strong></span>
          <span>Class: <strong>${escapeHTML(cadet.class_name || '—')}</strong></span>
          <span>Form: <strong>${escapeHTML(cadet.form || '—')}</strong></span>
          <span>House: <strong>${escapeHTML(cadet.house || '—')}</strong></span>
        </div>
      </div>
      <div class="pt-header-right">
        ${photoHTML}
      </div>
    </div>

    <!-- ══ ACADEMIC RECORD TABLE ════════════════════════════ -->
    <div class="pt-section-title">Academic Record</div>
    <div class="pt-acad-wrap">
      <table class="pt-acad-table">
        <thead>
          <tr>
            <th class="pt-row-label-head" rowspan="2">Exam</th>
            ${headerRow}
          </tr>
          <tr>${subLabelRow}</tr>
        </thead>
        <tbody>
          <tr>${gpaRow}</tr>
          <tr class="pt-pos-row">${posRow}</tr>
        </tbody>
      </table>
    </div>

    <!-- ══ ACHIEVEMENTS ════════════════════════════════════ -->
    <div class="pt-lower">

      <div class="pt-lower-col">
        <div class="pt-section-title">Achievements &amp; Honours</div>
        <div class="pt-ach-container">${achievementsHTML}</div>
      </div>

      <div class="pt-lower-col">
        <div class="pt-section-title">Discipline Record</div>
        <table class="pt-disc-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>VII</th><th>VIII</th><th>IX</th><th>X</th><th>XI</th><th>XII</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Conduct Grade</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr><td>Extra Drills</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr><td>Confinements</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr><td>Restrictions</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- ══ FOOTER ════════════════════════════════════════════ -->
    <div class="pt-footer">
      <div>Form Master's Signature: ___________________________</div>
      <div>Principal's Signature: ___________________________</div>
      <div>Date: _______________</div>
    </div>

  </div>`
}

