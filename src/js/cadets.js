import { supabase, ROLES, COLLEGES, COLLEGE_LOGOS, COLLEGE_LOGO_SQUARE, COLLEGE_COLORS, canViewCadets } from './supabase'
import { getCurrentStaff } from './auth'
import { viewCadet, closeProfile, gotoCadetProfilePage } from './profile'
import { openAchievementForm } from './achievements'
import { uploadCadetPhoto } from './storage'
import { loadDashboardStats } from './dashboard'
import { escapeHTML, showToast, setButtonLoading, formatHouse } from './ui'

let allCadets = []
let pendingBulkRecords = []
let selectedIntake = null
let selectedCollegeForRecords = null  // tracks which college system admin has selected

// ─── Load Cadets (Entry Point) ────────────────────────────────────────────────

export async function loadCadets() {
  const staff = getCurrentStaff()
  if (!staff) return

  if (staff.role === ROLES.SYSTEM_ADMIN) {
    // System admin: show college selection first
    selectedCollegeForRecords = null
    showCollegeSelectionStage()
  } else {
    // Everyone else: go straight to intake selection for their own college
    selectedCollegeForRecords = staff.college
    await loadIntakeSelection()
  }
}

// ─── Stage 0: College Selection (System Admin only) ──────────────────────────

function showCollegeSelectionStage() {
  document.getElementById('collegeSelectionStage')?.classList.remove('hidden')
  document.getElementById('intakeSelectionStage')?.classList.add('hidden')
  document.getElementById('cadetListStage')?.classList.add('hidden')

  const container = document.getElementById('collegeCardsContainer')
  if (!container) return

  container.innerHTML = COLLEGES.map(college => {
    const logo = COLLEGE_LOGOS[college]
    const isSquare = COLLEGE_LOGO_SQUARE.has(college)
    const color = COLLEGE_COLORS[college] || ''
    const shortName = college.replace(' Cadet College', '').replace(' Girls', ' Girls')
    return `
      <button class="intake-card college-select-card" data-college="${escapeHTML(college)}"
        ${color ? `style="--college-color:${color}"` : ''}>
        <div class="intake-card-icon college-logo-icon${isSquare ? ' college-logo-icon--square' : ''}">
          ${logo
            ? `<img src="${escapeHTML(logo)}" alt="${escapeHTML(college)}" class="college-card-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <span class="college-card-logo-fallback"${logo ? ' style="display:none"' : ''}><i class="fa-solid fa-building-columns"></i></span>
        </div>
        <div class="intake-card-label" style="font-size:0.65rem;">Cadet College</div>
        <div class="intake-card-value" style="font-size:0.78rem;line-height:1.25;">${escapeHTML(shortName)}</div>
      </button>
    `
  }).join('')

  container.querySelectorAll('.college-select-card').forEach(card => {
    card.addEventListener('click', async () => {
      selectedCollegeForRecords = card.dataset.college
      const label = document.getElementById('activeCollegeLabel')
      if (label) label.textContent = selectedCollegeForRecords
      document.getElementById('collegeSelectionStage')?.classList.add('hidden')
      await loadIntakeSelection()
    })
  })
}

// ─── Stage 1: Intake Selection ────────────────────────────────────────────────

async function loadIntakeSelection() {
  const container = document.getElementById('intakeCardsContainer')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  // Show stage 1, hide others
  document.getElementById('collegeSelectionStage')?.classList.add('hidden')
  document.getElementById('intakeSelectionStage')?.classList.remove('hidden')
  document.getElementById('cadetListStage')?.classList.add('hidden')

  // Show "Back to Colleges" only for system admin
  const backBtn = document.getElementById('backToCollegesBtn')
  if (backBtn) {
    backBtn.classList.toggle('hidden', staff.role !== ROLES.SYSTEM_ADMIN)
  }

  container.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Loading intakes...</div>`

  const college = selectedCollegeForRecords || staff.college

  // Update college label in header
  const label = document.getElementById('activeCollegeLabel')
  if (label) label.textContent = college

  const { data, error } = await supabase
    .from('cadets')
    .select('intake, college, form, id')
    .eq('college', college)
    .order('intake', { ascending: false })

  if (error) {
    container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Failed to load intakes.</div>`
    return
  }

  let scopedData = data || []

  // Filter for form masters (assigned forms only)
  if (staff.role === ROLES.FORM_MASTER) {
    const { data: assignments } = await supabase
      .from('form_master_assignments')
      .select('*')
      .eq('staff_user_id', staff.id)

    scopedData = scopedData.filter(cadet =>
      (assignments || []).some(assignment =>
        assignment.college === cadet.college &&
        assignment.intake === cadet.intake &&
        assignment.form === cadet.form
      )
    )
  }

  // House Masters: fetch all cadets in their house and build intake map from those
  if (staff.role === ROLES.HOUSE_MASTER) {
    const houseName = (staff.house || '').trim()
    if (!houseName) {
      container.innerHTML = `
        <div class="col-span-full empty-state glass rounded-[var(--radius-lg)] py-16">
          <i class="fa-solid fa-house-crack"></i>
          <h3 class="text-lg font-bold text-slate-700">No House Assigned</h3>
          <p class="text-slate-500 text-sm">Ask an admin to assign a house to your profile.</p>
        </div>`
      return
    }

    // Fetch ALL cadets for this college so we can match flexibly
    const { data: allCollegeCadets } = await supabase
      .from('cadets')
      .select('id, intake, house')
      .eq('college', college)

    // Match: cadet.house contains the house name keyword (case-insensitive)
    // e.g. "Badr House" matches "Badr" or "Badr House"
    const houseKeyword = houseName.replace(/\s+house$/i, '').toLowerCase()
    const filtered = (allCollegeCadets || []).filter(c => {
      const ch = (c.house || '').toLowerCase()
      return ch.includes(houseKeyword) || houseKeyword.includes(ch.replace(/\s+house$/i, ''))
    })

    console.log(`[HouseMaster] house="${houseName}" keyword="${houseKeyword}" matched=${filtered.length} cadets`)
    scopedData = filtered
  }

  // Get intake counts
  const intakeMap = {}
  scopedData.forEach(cadet => {
    if (cadet.intake) {
      intakeMap[cadet.intake] = (intakeMap[cadet.intake] || 0) + 1
    }
  })

  const intakes = Object.keys(intakeMap).sort((a, b) => Number(b) - Number(a))

  if (!intakes.length) {
    container.innerHTML = `
      <div class="col-span-full empty-state glass rounded-[var(--radius-lg)] py-16">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3 class="text-lg font-bold text-slate-700">No Intakes Found</h3>
        <p class="text-slate-500 text-sm">No cadet records available yet.</p>
      </div>
    `
    return
  }

  // Render intake cards with count
  container.innerHTML = intakes.map(intake => {
    const ordinal = getOrdinal(intake)
    const count = intakeMap[intake]
    return `
      <button class="intake-card" data-intake="${escapeHTML(intake)}">
        <div class="intake-card-icon">
          <i class="fa-solid fa-graduation-cap"></i>
        </div>
        <div class="intake-card-label">Intake</div>
        <div class="intake-card-value">${escapeHTML(ordinal)}</div>
        <div class="intake-card-count">${count} cadets</div>
      </button>
    `
  }).join('')

  // Add click handlers — scoped to container to avoid duplicate listeners on other cards
  container.querySelectorAll('.intake-card').forEach(card => {
    card.addEventListener('click', () => {
      const intake = card.dataset.intake
      selectIntake(intake)
    })
  })
}

function getOrdinal(n) {
  if (!n) return 'N/A'
  const num = parseInt(n)
  if (isNaN(num)) return n
  const s = ['th', 'st', 'nd', 'rd']
  const v = num % 100
  return num + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Stage 2: Cadet List ──────────────────────────────────────────────────────

async function selectIntake(intake) {
  selectedIntake = intake
  
  // Hide stage 1, show stage 2
  document.getElementById('intakeSelectionStage').classList.add('hidden')
  document.getElementById('cadetListStage').classList.remove('hidden')
  
  // Update display
  document.getElementById('selectedIntakeDisplay').textContent = getOrdinal(intake)
  
  // Load cadets for this intake
  await loadCadetsForIntake(intake)
}

async function loadCadetsForIntake(intake, formFilter = '') {
  const container = document.getElementById('cadetTableContainer')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  container.innerHTML = `<div class="text-center py-10 text-slate-500">Loading cadets...</div>`

  const college = selectedCollegeForRecords || staff.college

  let query = supabase
    .from('cadets')
    .select('*')
    .eq('college', college)
    .eq('intake', intake)
    .order('cadet_no', { ascending: true })

  if (formFilter) {
    query = query.eq('form', formFilter)
  }

  const { data, error } = await query

  if (error) {
    container.innerHTML = `<div class="text-center py-10 text-red-500">Failed to load cadets.</div>`
    return
  }

  let scopedCadets = data || []

  // Filter for form masters (own assigned form only)
  if (staff.role === ROLES.FORM_MASTER) {
    scopedCadets = await filterAssignedCadets(scopedCadets, staff)
  }

  // Filter for house masters (own house only) — flexible match
  if (staff.role === ROLES.HOUSE_MASTER && staff.house) {
    const houseKeyword = staff.house.trim().replace(/\s+house$/i, '').toLowerCase()
    scopedCadets = scopedCadets.filter(c => {
      const ch = (c.house || '').toLowerCase()
      return ch.includes(houseKeyword) || houseKeyword.includes(ch.replace(/\s+house$/i, ''))
    })
  }

  allCadets = scopedCadets
  renderCadetTable(scopedCadets, staff)
}

function renderCadetTable(cadets, staff) {
  const container = document.getElementById('cadetTableContainer')

  if (!cadets.length) {
    container.innerHTML = `
      <div class="empty-state py-16">
        <i class="fa-solid fa-users-slash"></i>
        <h3 class="text-lg font-bold text-slate-700">No Cadets Found</h3>
        <p class="text-slate-500 text-sm">No cadet records for this intake.</p>
      </div>
    `
    return
  }

  const canEdit   = staff.role === ROLES.FORM_MASTER
  const canPrint  = canViewCadets(staff.role)
  const canDelete = staff.role === ROLES.ADMIN || staff.role === ROLES.SYSTEM_ADMIN

  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead>
          <tr>
            <th style="width: 80px;">Cadet No</th>
            <th>Name</th>
            <th style="width: 80px;">Class</th>
            <th style="width: 80px;">Form</th>
            <th style="width: 120px;">House</th>
            <th style="width: 200px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${cadets.map(cadet => {
            const isAssignedToFM = canEdit && isFormMasterAssigned(cadet, staff)
            const canGoToProfile = canPrint  // admins can also access full profile for printing
            
            return `
              <tr>
                <td class="font-mono font-bold">${escapeHTML(cadet.cadet_no || 'N/A')}</td>
                <td class="font-semibold">${escapeHTML(cadet.name || 'Unnamed')}</td>
                <td>${escapeHTML(cadet.class_name || 'N/A')}</td>
                <td><span class="inline-block bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">${escapeHTML(cadet.form || 'N/A')}</span></td>
                <td class="text-xs">${formatHouse(cadet.house)}</td>
                <td>
                  <div class="flex items-center gap-2">
                    <button data-id="${cadet.id}" class="view-cadet-btn portal-btn-primary py-2 px-3 text-xs">
                      <i class="fa-solid fa-eye"></i> View
                    </button>
                    ${canGoToProfile ? `
                      <button data-id="${cadet.id}" class="goto-cadet-profile-btn animated-arrow-btn" title="Go to Cadet Profile">
                        <i class="fa-solid fa-chevron-right"></i>
                      </button>
                    ` : ''}
                    ${canDelete ? `
                      <button data-id="${cadet.id}" class="delete-cadet-btn text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl font-bold transition border border-red-100" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `

  // Add event listeners
  document.querySelectorAll('.view-cadet-btn').forEach(btn => {
    btn.addEventListener('click', () => viewCadet(btn.dataset.id))
  })

  document.querySelectorAll('.goto-cadet-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => gotoCadetProfilePage(btn.dataset.id))
  })

  document.querySelectorAll('.delete-cadet-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCadet(btn.dataset.id))
  })
}

function isFormMasterAssigned(cadet, staff) {
  // If the cadet is in the filtered list, they can edit
  return true
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export function setupCadetRecordsNavigation() {
  // Back button from cadet list → intake selection (or college selection for system admin)
  document.getElementById('backToIntakesBtn')?.addEventListener('click', () => {
    closeProfile()
    document.getElementById('cadetListStage')?.classList.add('hidden')
    document.getElementById('intakeSelectionStage')?.classList.remove('hidden')
    selectedIntake = null
  })

  // Back button from intake selection → college selection (system admin only)
  document.getElementById('backToCollegesBtn')?.addEventListener('click', () => {
    document.getElementById('intakeSelectionStage')?.classList.add('hidden')
    document.getElementById('collegeSelectionStage')?.classList.remove('hidden')
    selectedCollegeForRecords = null
  })

  // Form filter
  document.getElementById('formFilterStage2')?.addEventListener('change', (e) => {
    if (selectedIntake) {
      loadCadetsForIntake(selectedIntake, e.target.value)
    }
  })
}

// ─── Add/Delete Cadets (Keep existing functionality) ──────────────────────────

export async function addCadet() {
  const staff = getCurrentStaff()

  if (!staff || (staff.role !== ROLES.ADMIN && staff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can create cadet records.', 'error')
    return
  }

  const name = document.getElementById('newName')?.value.trim()
  const cadetNo = document.getElementById('newCadetNo')?.value.trim()
  const intake = document.getElementById('newIntake')?.value.trim()
  const className = document.getElementById('newClassName')?.value.trim()
  const house = document.getElementById('newHouse')?.value.trim()
  const photoFile = document.getElementById('newPhotoFile')?.files?.[0]

  if (!name || !cadetNo || !intake || !className || !house) {
    showToast('Name, Cadet No, Intake, Class and House are required.', 'warning')
    return
  }

  setButtonLoading('addCadetBtn', true, 'Saving...')

  try {
    const form = getFormFromCadetNo(cadetNo)
    const photoUrl = photoFile ? await uploadCadetPhoto(photoFile, cadetNo) : null

    const { error } = await supabase
      .from('cadets')
      .insert([
        {
          name,
          cadet_no: cadetNo,
          intake,
          class_name: className,
          form,
          house,
          college: staff.college,
          photo_url: photoUrl
        }
      ])

    if (error) throw error

    clearCadetForm()

    await loadCadets()
    await loadDashboardStats()

    showToast(`Cadet added successfully. Assigned to ${form}.`)
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    setButtonLoading('addCadetBtn', false)
  }
}

export async function deleteCadet(id) {
  const staff = getCurrentStaff()

  if (!staff || (staff.role !== ROLES.ADMIN && staff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can delete cadet records.', 'error')
    return
  }

  const confirmed = confirm('Are you sure you want to delete this cadet record?')
  if (!confirmed) return

  const { error } = await supabase
    .from('cadets')
    .delete()
    .eq('id', id)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  if (selectedIntake) {
    await loadCadetsForIntake(selectedIntake, document.getElementById('formFilterStage2')?.value || '')
  } else {
    await loadCadets()
  }
  
  await loadDashboardStats()

  showToast('Cadet record deleted.')
}

// ─── Bulk Upload (Keep existing) ──────────────────────────────────────────────

export async function bulkUploadCadets() {
  const staff = getCurrentStaff()

  if (!staff || (staff.role !== ROLES.ADMIN && staff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can bulk upload cadets.', 'error')
    return
  }

  const role = document.getElementById('bulkRoleSelect')?.value
  const intake = document.getElementById('bulkIntakeInput')?.value.trim()
  // College admins are locked to their own college; system admins pick from dropdown
  const selectedCollege = staff.role === ROLES.SYSTEM_ADMIN
    ? (document.getElementById('bulkCollegeSelect')?.value || '')
    : staff.college
  const file = document.getElementById('bulkCadetFile')?.files?.[0]
  const previewArea = document.getElementById('bulkPreviewArea')
  const button = document.getElementById('bulkUploadBtn')

  if (role !== 'cadet') {
    showToast('Only cadet upload is supported here.', 'warning')
    return
  }

  if (!intake) {
    showToast('Please enter an intake number.', 'warning')
    return
  }

  if (!selectedCollege) {
    showToast('Please select a cadet college.', 'warning')
    return
  }

  if (!file) {
    showToast('Please select an Excel file.', 'warning')
    return
  }

  if (pendingBulkRecords.length > 0) {
    await uploadPendingBulkRecords(selectedCollege, intake)
    return
  }

  try {
    button.disabled = true
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Reading File...</span>`

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (!rows.length || rows.length < 2) {
      showToast('Excel file does not contain enough data.', 'error')
      return
    }

    const dataRows = rows.slice(1).filter(row =>
      row.some(cell => String(cell || '').trim() !== '')
    )

    if (!dataRows.length) {
      showToast('No valid cadet rows found.', 'error')
      return
    }

    pendingBulkRecords = dataRows.map(row => {
      const cadetNo = String(row[0] || '').trim()
      const name = String(row[1] || '').trim()
      const className = String(row[2] || '').trim()
      const formRaw = String(row[3] || '').trim().toUpperCase()
      const house = String(row[4] || '').trim()

      return {
        cadet_no: cadetNo,
        name,
        class_name: className,
        form: formRaw === 'A' || formRaw === 'B' ? formRaw : getFormFromCadetNo(cadetNo),
        house,
        college: selectedCollege,
        intake: intake,
        photo_url: null
      }
    }).filter(record =>
      record.cadet_no && record.name && record.class_name && record.form && record.house
    )

    if (!pendingBulkRecords.length) {
      showToast('No valid cadet records found. Check required column order.', 'error')
      return
    }

    previewArea.classList.remove('hidden')
    previewArea.innerHTML = renderBulkPreviewTable(pendingBulkRecords)

    button.disabled = false
    button.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><span>Upload ${pendingBulkRecords.length} Cadets</span>`

    showToast(`${pendingBulkRecords.length} cadets ready for upload.`, 'info')
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    button.disabled = false
  }
}

async function uploadPendingBulkRecords(selectedCollege, intake) {
  const button = document.getElementById('bulkUploadBtn')

  if (!pendingBulkRecords.length) {
    showToast('Preview the Excel file first.', 'warning')
    return
  }

  button.disabled = true
  button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Uploading...</span>`

  try {
    const records = pendingBulkRecords.map(record => ({ 
      ...record, 
      college: selectedCollege,
      intake: intake 
    }))

    const { error } = await supabase.from('cadets').insert(records)

    if (error) throw error

    showToast(`${records.length} cadets uploaded successfully.`)

    pendingBulkRecords = []

    document.getElementById('bulkCadetFile').value = ''
    document.getElementById('bulkFileName').textContent = 'Click to choose file...'
    document.getElementById('bulkPreviewArea').classList.add('hidden')
    document.getElementById('bulkPreviewArea').innerHTML = ''

    button.innerHTML = `<i class="fa-solid fa-table"></i><span>Preview Data</span>`

    await loadCadets()
    await loadDashboardStats()
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    button.disabled = false
  }
}

function renderBulkPreviewTable(records) {
  const firstRows = records.slice(0, 8)

  return `
    <div class="bulk-preview-note">Showing first ${firstRows.length} of ${records.length} records.</div>
    <table>
      <thead><tr><th>Cadet No.</th><th>Name</th><th>Class</th><th>Form</th><th>House</th></tr></thead>
      <tbody>
        ${firstRows.map(record => `
          <tr>
            <td>${record.cadet_no}</td>
            <td>${record.name}</td>
            <td>${record.class_name}</td>
            <td>${record.form}</td>
            <td>${record.house}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function filterAssignedCadets(cadets, staff) {
  const { data: assignments, error } = await supabase
    .from('form_master_assignments')
    .select('*')
    .eq('staff_user_id', staff.id)

  if (error) {
    console.error(error)
    return []
  }

  return cadets.filter(cadet =>
    (assignments || []).some(assignment =>
      assignment.college === cadet.college &&
      assignment.intake === cadet.intake &&
      assignment.form === cadet.form
    )
  )
}

function getFormFromCadetNo(cadetNo) {
  const number = Number(String(cadetNo).replace(/\D/g, ''))
  if (!number) return 'A'
  return number % 2 === 1 ? 'A' : 'B'
}

function clearCadetForm() {
  const ids = ['newName', 'newCadetNo', 'newIntake', 'newClassName', 'newHouse', 'newPhotoFile']
  ids.forEach(id => {
    const input = document.getElementById(id)
    if (input) input.value = ''
  })
}
