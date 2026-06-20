import { supabase, ROLES, COLLEGES, COLLEGE_LOGOS, COLLEGE_LOGO_SQUARE } from './supabase'
import { getCurrentStaff } from './auth'
import { loadDashboardStats } from './dashboard'
import { escapeHTML, showToast, setButtonLoading, formatHouse } from './ui'

let allManageCadets = []
let cadetsForSelectedIntake = []
let selectedManageIntake = null
let selectedManageCollege = null   // null = not yet chosen (system admin only)
let selectedCadetIds = new Set()

// ─── Entry Point: Load Manage Cadets ─────────────────────────────────────────

export async function loadManageCadets() {
  const staff = getCurrentStaff()

  if (!staff) return

  if (staff.role !== ROLES.ADMIN && staff.role !== ROLES.SYSTEM_ADMIN) {
    const stage1 = document.getElementById('manageIntakeSelectionStage')
    if (stage1) {
      stage1.innerHTML = `
        <div class="empty-state py-16">
          <i class="fa-solid fa-lock"></i>
          <h3 class="text-lg font-bold text-slate-700">Access Denied</h3>
          <p class="text-slate-500 text-sm">Only admins can manage cadet records.</p>
        </div>
      `
    }
    return
  }

  // Reset stages
  document.getElementById('manageCollegeSelectionStage')?.classList.add('hidden')
  document.getElementById('manageIntakeSelectionStage')?.classList.remove('hidden')
  document.getElementById('manageCadetListStage')?.classList.add('hidden')

  if (staff.role === ROLES.SYSTEM_ADMIN) {
    // Show college selection first
    selectedManageCollege = null
    showManageCollegeSelection()
  } else {
    // College admin: go straight to intakes for their college
    selectedManageCollege = staff.college
    await loadIntakeSelection()
  }
}

// ─── Stage 0: College Selection (System Admin only) ──────────────────────────

function showManageCollegeSelection() {
  // Ensure stage 0 is injected
  ensureManageCollegeStage()

  document.getElementById('manageCollegeSelectionStage')?.classList.remove('hidden')
  document.getElementById('manageIntakeSelectionStage')?.classList.add('hidden')
  document.getElementById('manageCadetListStage')?.classList.add('hidden')

  const container = document.getElementById('manageCollegeCardsContainer')
  if (!container) return

  container.innerHTML = COLLEGES.map(college => {
    const logo = COLLEGE_LOGOS[college]
    const isSquare = COLLEGE_LOGO_SQUARE.has(college)
    const shortName = college.replace(' Cadet College', '')
    return `
      <button class="intake-card manage-college-select-card" data-college="${escapeHTML(college)}">
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

  container.querySelectorAll('.manage-college-select-card').forEach(card => {
    card.addEventListener('click', async () => {
      selectedManageCollege = card.dataset.college
      document.getElementById('manageCollegeSelectionStage')?.classList.add('hidden')
      await loadIntakeSelection()
    })
  })
}

function ensureManageCollegeStage() {
  if (document.getElementById('manageCollegeSelectionStage')) return

  const page = document.getElementById('manageCadetsPage')
  const heroEl = page?.querySelector('.page-hero.manage-hero')
  const intakeStage = document.getElementById('manageIntakeSelectionStage')

  const stage0 = document.createElement('div')
  stage0.id = 'manageCollegeSelectionStage'
  stage0.className = 'hidden'
  stage0.innerHTML = `
    <div class="glass compact-card mb-5">
      <div class="flex items-center gap-3">
        <div class="page-icon blue"><i class="fa-solid fa-building-columns"></i></div>
        <div>
          <h3 class="compact-section-title text-slate-800">Select College to Manage</h3>
          <p class="text-slate-500 text-sm">Choose a cadet college to manage its cadet records.</p>
        </div>
      </div>
    </div>
    <div id="manageCollegeCardsContainer" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"></div>
  `

  // Insert before the intake selection stage
  if (intakeStage) {
    page.insertBefore(stage0, intakeStage)
  } else {
    page.appendChild(stage0)
  }
}

// ─── Stage 1: Intake Selection ────────────────────────────────────────────────

async function loadIntakeSelection() {
  const container = document.getElementById('manageIntakeCardsContainer')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  // Show stage 1, hide others
  document.getElementById('manageCollegeSelectionStage')?.classList.add('hidden')
  document.getElementById('manageIntakeSelectionStage')?.classList.remove('hidden')
  document.getElementById('manageCadetListStage')?.classList.add('hidden')

  // Update header to show selected college with logo
  updateManageIntakeHeader(selectedManageCollege || staff.college, staff)

  container.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Loading intakes...</div>`

  const college = selectedManageCollege || staff.college

  // Fetch all cadets for this college
  const { data, error } = await supabase
    .from('cadets')
    .select('*')
    .eq('college', college)

  if (error) {
    container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Failed to load intakes.</div>`
    return
  }

  allManageCadets = data || []

  // Update total count
  const totalEl = document.getElementById('totalCadetsCount')
  if (totalEl) totalEl.textContent = allManageCadets.length

  // Get unique intakes with counts
  const intakeMap = {}
  allManageCadets.forEach(cadet => {
    if (cadet.intake) {
      intakeMap[cadet.intake] = (intakeMap[cadet.intake] || 0) + 1
    }
  })

  const intakes = Object.keys(intakeMap).sort((a, b) => Number(b) - Number(a))

  if (!intakes.length) {
    container.innerHTML = `
      <div class="col-span-full empty-state glass rounded-[var(--radius-lg)] py-16">
        <i class="fa-solid fa-users-slash"></i>
        <h3 class="text-lg font-bold text-slate-700">No Cadets Found</h3>
        <p class="text-slate-500 text-sm">No cadet records available yet.</p>
      </div>
    `
    return
  }

  // Render intake cards
  container.innerHTML = intakes.map(intake => {
    const ordinal = getOrdinal(intake)
    const count = intakeMap[intake]
    return `
      <button class="intake-card manage-intake-card" data-intake="${escapeHTML(intake)}">
        <div class="intake-card-icon">
          <i class="fa-solid fa-users-cog"></i>
        </div>
        <div class="intake-card-label">Intake</div>
        <div class="intake-card-value">${escapeHTML(ordinal)}</div>
        <div class="intake-card-count">${count} cadets</div>
      </button>
    `
  }).join('')

  // Add click handlers
  document.querySelectorAll('.manage-intake-card').forEach(card => {
    card.addEventListener('click', () => {
      const intake = card.dataset.intake
      selectIntake(intake)
    })
  })
}

function updateManageIntakeHeader(college, staff) {
  // Ensure the college info banner exists inside the intake selection stage
  const stage = document.getElementById('manageIntakeSelectionStage')
  if (!stage) return

  let banner = document.getElementById('manageCollegeBanner')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'manageCollegeBanner'
    banner.className = 'glass compact-card mb-5'
    stage.insertBefore(banner, stage.firstChild)
  }

  const logo = COLLEGE_LOGOS[college]
  const isSquare = COLLEGE_LOGO_SQUARE.has(college)
  const isSystemAdmin = staff.role === ROLES.SYSTEM_ADMIN

  banner.innerHTML = `
    <div class="flex items-center gap-4 flex-wrap">
      ${isSystemAdmin ? `
        <button id="backToManageCollegesBtn" class="portal-btn-ghost px-4 py-2 text-sm flex-shrink-0">
          <i class="fa-solid fa-arrow-left"></i> All Colleges
        </button>
      ` : ''}
      <div class="flex items-center gap-3 flex-1">
        <div class="college-banner-logo${isSquare ? ' college-banner-logo--square' : ''}">
          ${logo
            ? `<img src="${escapeHTML(logo)}" alt="${escapeHTML(college)}" class="college-banner-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <span class="college-banner-logo-fallback"${logo ? ' style="display:none"' : ''}><i class="fa-solid fa-building-columns"></i></span>
        </div>
        <div>
          <h3 class="compact-section-title text-slate-800">${escapeHTML(college)}</h3>
          <p class="text-slate-500 text-sm">Select an intake to manage its cadet records.</p>
        </div>
      </div>
    </div>
  `

  // Attach back-to-colleges handler
  if (isSystemAdmin) {
    document.getElementById('backToManageCollegesBtn')?.addEventListener('click', () => {
      selectedManageCollege = null
      document.getElementById('manageIntakeSelectionStage')?.classList.add('hidden')
      showManageCollegeSelection()
    })
  }
}

// ─── Stage 2: View Cadets for Selected Intake ────────────────────────────────

async function selectIntake(intake) {
  selectedManageIntake = intake
  selectedCadetIds.clear()

  // Hide stage 1, show stage 2
  document.getElementById('manageIntakeSelectionStage')?.classList.add('hidden')
  document.getElementById('manageCadetListStage')?.classList.remove('hidden')

  // Update display
  document.getElementById('manageSelectedIntakeDisplay').textContent = getOrdinal(intake)

  // Filter cadets for this intake
  cadetsForSelectedIntake = allManageCadets.filter(c => c.intake === intake)

  // Update count
  document.getElementById('manageIntakeCadetCount').textContent = cadetsForSelectedIntake.length

  // Populate class filter
  populateClassFilter(cadetsForSelectedIntake)

  // Render table
  renderManageCadetsTable(cadetsForSelectedIntake)
}

function populateClassFilter(cadets) {
  const classes = [...new Set(cadets.map(c => c.class_name).filter(Boolean))].sort()
  const classSelect = document.getElementById('manageClassFilter')
  if (classSelect) {
    const currentValue = classSelect.value
    classSelect.innerHTML = '<option value="">All Classes</option>' +
      classes.map(cls => `<option value="${escapeHTML(cls)}" ${cls === currentValue ? 'selected' : ''}>${escapeHTML(cls)}</option>`).join('')
  }
}

// ─── Render Cadets Table ──────────────────────────────────────────────────────

function renderManageCadetsTable(cadets) {
  const container = document.getElementById('manageCadetsTableContainer')

  if (!cadets.length) {
    container.innerHTML = `
      <div class="empty-state py-16">
        <i class="fa-solid fa-users-slash"></i>
        <h3 class="text-lg font-bold text-slate-700">No Cadets Found</h3>
        <p class="text-slate-500 text-sm">No cadet records match your filters.</p>
      </div>
    `
    return
  }

  // Sort by cadet number
  const sortedCadets = [...cadets].sort((a, b) => {
    const numA = parseInt(String(a.cadet_no || '').replace(/\D/g, '')) || 0
    const numB = parseInt(String(b.cadet_no || '').replace(/\D/g, '')) || 0
    return numA - numB
  })

  container.innerHTML = `
    <div class="mb-4 flex items-center gap-3 flex-wrap">
      <button id="bulkChangeIntakeBtn" class="bulk-action-btn hidden" style="background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #2563eb;">
        <i class="fa-solid fa-calendar-days"></i>
        <span>Change Intake (<span id="selectedCadetsCount">0</span>)</span>
      </button>
      <button id="bulkDeleteCadetsBtn" class="bulk-action-btn hidden">
        <i class="fa-solid fa-trash"></i>
        <span>Delete (<span id="selectedCadetsCountDelete">0</span>)</span>
      </button>
    </div>
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input type="checkbox" id="selectAllCadets" class="staff-checkbox" title="Select all">
            </th>
            <th style="width: 80px;">Cadet No</th>
            <th>Name</th>
            <th style="width: 80px;">Class</th>
            <th style="width: 70px;">Form</th>
            <th style="width: 120px;">House</th>
            <th style="width: 120px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sortedCadets.map(cadet => `
            <tr>
              <td>
                <input type="checkbox" class="staff-checkbox cadet-select-checkbox" data-id="${cadet.id}" ${selectedCadetIds.has(cadet.id) ? 'checked' : ''}>
              </td>
              <td class="font-mono font-bold">${escapeHTML(cadet.cadet_no || 'N/A')}</td>
              <td class="font-semibold">${escapeHTML(cadet.name || 'Unnamed')}</td>
              <td>${escapeHTML(cadet.class_name || 'N/A')}</td>
              <td><span class="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full font-bold">${escapeHTML(cadet.form || 'N/A')}</span></td>
              <td class="text-xs">${formatHouse(cadet.house)}</td>
              <td>
                <div class="flex items-center gap-2">
                  <button type="button" class="cadet-edit-action staff-action-icon edit" data-cadet-id="${cadet.id}" title="Edit Cadet">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="cadet-delete-action staff-action-icon delete" data-cadet-id="${cadet.id}" title="Delete Cadet">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  // Attach click handlers DIRECTLY using .onclick (most reliable method)
  container.querySelectorAll('.cadet-edit-action').forEach(btn => {
    btn.onclick = function(e) {
      e.preventDefault()
      e.stopPropagation()
      const id = this.getAttribute('data-cadet-id')
      console.log('[ManageCadets] Edit clicked for cadet:', id)
      if (id) openEditCadetModal(id)
      return false
    }
  })

  container.querySelectorAll('.cadet-delete-action').forEach(btn => {
    btn.onclick = function(e) {
      e.preventDefault()
      e.stopPropagation()
      const id = this.getAttribute('data-cadet-id')
      console.log('[ManageCadets] Delete clicked for cadet:', id)
      if (id) deleteManagedCadet(id)
      return false
    }
  })

  // Setup bulk selection
  setupBulkSelection()

  updateBulkButtons()
}

// ─── Bulk Selection ───────────────────────────────────────────────────────────

function setupBulkSelection() {
  // Select all checkbox
  document.getElementById('selectAllCadets')?.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.cadet-select-checkbox')
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked
      if (e.target.checked) {
        selectedCadetIds.add(cb.dataset.id)
      } else {
        selectedCadetIds.delete(cb.dataset.id)
      }
    })
    updateBulkButtons()
  })

  // Individual checkboxes
  document.querySelectorAll('.cadet-select-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedCadetIds.add(e.target.dataset.id)
      } else {
        selectedCadetIds.delete(e.target.dataset.id)
      }
      updateBulkButtons()
    })
  })

  // Bulk action buttons
  document.getElementById('bulkChangeIntakeBtn')?.addEventListener('click', openBulkChangeIntakeModal)
  document.getElementById('bulkDeleteCadetsBtn')?.addEventListener('click', bulkDeleteCadets)
}

function updateBulkButtons() {
  const changeIntakeBtn = document.getElementById('bulkChangeIntakeBtn')
  const deleteBtn = document.getElementById('bulkDeleteCadetsBtn')
  const countSpan = document.getElementById('selectedCadetsCount')
  const countSpanDelete = document.getElementById('selectedCadetsCountDelete')

  if (countSpan) countSpan.textContent = selectedCadetIds.size
  if (countSpanDelete) countSpanDelete.textContent = selectedCadetIds.size

  if (selectedCadetIds.size > 0) {
    changeIntakeBtn?.classList.remove('hidden')
    deleteBtn?.classList.remove('hidden')
  } else {
    changeIntakeBtn?.classList.add('hidden')
    deleteBtn?.classList.add('hidden')
  }
}

// ─── Filter Cadets ────────────────────────────────────────────────────────────

export function filterManageCadets() {
  if (!selectedManageIntake) return

  const searchValue = document.getElementById('manageCadetSearch')?.value.toLowerCase() || ''
  const formValue = document.getElementById('manageFormFilter')?.value || ''
  const classValue = document.getElementById('manageClassFilter')?.value || ''

  const filtered = cadetsForSelectedIntake.filter(cadet => {
    const matchesSearch =
      cadet.name?.toLowerCase().includes(searchValue) ||
      String(cadet.cadet_no || '').toLowerCase().includes(searchValue)

    const matchesForm = !formValue || cadet.form === formValue
    const matchesClass = !classValue || cadet.class_name === classValue

    return matchesSearch && matchesForm && matchesClass
  })

  renderManageCadetsTable(filtered)
}

// ─── Edit Cadet Modal ─────────────────────────────────────────────────────────

async function openEditCadetModal(cadetId) {
  // Use loose equality and String conversion to handle both number and string IDs
  const cadet = allManageCadets.find(c => String(c.id) === String(cadetId))
  console.log('[ManageCadets] Found cadet:', cadet, 'from list of', allManageCadets.length)
  
  if (!cadet) {
    showToast('Cadet not found. Please refresh the page.', 'error')
    return
  }

  // Remove any existing modal first
  document.getElementById('editCadetModal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'editCadetModal'
  modal.className = 'modal-backdrop'
  modal.innerHTML = `
    <div class="modal-box" style="max-width: 600px;">
      <div class="modal-header">
        <h3>Edit Cadet Information</h3>
        <button class="modal-close" onclick="document.getElementById('editCadetModal').remove()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="portal-label">Cadet No <span class="text-red-500">*</span></label>
            <input id="editCadetNo" type="text" value="${escapeHTML(cadet.cadet_no || '')}" class="portal-input">
          </div>
          <div>
            <label class="portal-label">Intake <span class="text-red-500">*</span></label>
            <input id="editIntake" type="text" value="${escapeHTML(cadet.intake || '')}" class="portal-input">
          </div>
        </div>
        <div>
          <label class="portal-label">Full Name <span class="text-red-500">*</span></label>
          <input id="editCadetName" type="text" value="${escapeHTML(cadet.name || '')}" class="portal-input">
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="portal-label">Class <span class="text-red-500">*</span></label>
            <input id="editClass" type="text" value="${escapeHTML(cadet.class_name || '')}" class="portal-input">
          </div>
          <div>
            <label class="portal-label">Form <span class="text-red-500">*</span></label>
            <select id="editForm" class="portal-input">
              <option value="A" ${cadet.form === 'A' ? 'selected' : ''}>A</option>
              <option value="B" ${cadet.form === 'B' ? 'selected' : ''}>B</option>
            </select>
          </div>
          <div>
            <label class="portal-label">House <span class="text-red-500">*</span></label>
            <input id="editHouse" type="text" value="${escapeHTML(cadet.house || '')}" class="portal-input">
          </div>
        </div>
        <button id="saveEditCadetBtn" class="portal-btn-primary w-full py-3" data-id="${cadet.id}">
          <i class="fa-solid fa-floppy-disk"></i> Save Changes
        </button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  document.getElementById('saveEditCadetBtn').onclick = function() {
    saveEditedCadet(this.getAttribute('data-id'))
  }
}

async function saveEditedCadet(cadetId) {
  const cadetNo = document.getElementById('editCadetNo')?.value.trim()
  const name = document.getElementById('editCadetName')?.value.trim()
  const intake = document.getElementById('editIntake')?.value.trim()
  const className = document.getElementById('editClass')?.value.trim()
  const form = document.getElementById('editForm')?.value
  const house = document.getElementById('editHouse')?.value.trim()

  if (!cadetNo || !name || !intake || !className || !form || !house) {
    showToast('All fields are required.', 'warning')
    return
  }

  setButtonLoading('saveEditCadetBtn', true, 'Saving...')

  const { error } = await supabase
    .from('cadets')
    .update({
      cadet_no: cadetNo,
      name,
      intake,
      class_name: className,
      form,
      house
    })
    .eq('id', cadetId)

  setButtonLoading('saveEditCadetBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  showToast('Cadet information updated successfully.')
  document.getElementById('editCadetModal')?.remove()

  await refreshAfterChange()
}

// ─── Delete Cadet ─────────────────────────────────────────────────────────────

async function deleteManagedCadet(cadetId) {
  const cadet = allManageCadets.find(c => String(c.id) === String(cadetId))
  console.log('[ManageCadets] Delete - Found cadet:', cadet)
  
  if (!cadet) {
    showToast('Cadet not found. Please refresh the page.', 'error')
    return
  }

  const confirmed = confirm(`⚠️ WARNING: Are you sure you want to delete ${cadet.name}?\n\nCadet No: ${cadet.cadet_no}\nIntake: ${cadet.intake}\n\nThis action cannot be undone!`)
  if (!confirmed) return

  const { error } = await supabase
    .from('cadets')
    .delete()
    .eq('id', cadetId)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  showToast(`Cadet ${cadet.name} deleted successfully.`)

  await refreshAfterChange()
}

// ─── Bulk Change Intake ───────────────────────────────────────────────────────

function openBulkChangeIntakeModal() {
  if (selectedCadetIds.size === 0) {
    showToast('Please select cadets first.', 'warning')
    return
  }

  const modal = document.createElement('div')
  modal.id = 'bulkChangeIntakeModal'
  modal.className = 'modal-backdrop'
  modal.innerHTML = `
    <div class="modal-box" style="max-width: 500px;">
      <div class="modal-header">
        <h3>Change Intake for ${selectedCadetIds.size} Cadet(s)</h3>
        <button class="modal-close" onclick="document.getElementById('bulkChangeIntakeModal').remove()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="space-y-4">
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <i class="fa-solid fa-info-circle mr-2"></i>
          This will change the intake for all ${selectedCadetIds.size} selected cadet(s).
        </div>
        <div>
          <label class="portal-label">New Intake <span class="text-red-500">*</span></label>
          <input id="bulkNewIntake" type="text" placeholder="e.g. 61, 62, 63" class="portal-input">
        </div>
        <button id="executeBulkChangeIntakeBtn" class="portal-btn-primary w-full py-3">
          <i class="fa-solid fa-calendar-days"></i> Change Intake for ${selectedCadetIds.size} Cadet(s)
        </button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  document.getElementById('executeBulkChangeIntakeBtn')?.addEventListener('click', executeBulkChangeIntake)
}

async function executeBulkChangeIntake() {
  const newIntake = document.getElementById('bulkNewIntake')?.value.trim()

  if (!newIntake) {
    showToast('Please enter a new intake number.', 'warning')
    return
  }

  const confirmed = confirm(`Change intake to "${newIntake}" for ${selectedCadetIds.size} cadet(s)?`)
  if (!confirmed) return

  setButtonLoading('executeBulkChangeIntakeBtn', true, 'Updating...')

  const idsArray = Array.from(selectedCadetIds)

  const { error } = await supabase
    .from('cadets')
    .update({ intake: newIntake })
    .in('id', idsArray)

  setButtonLoading('executeBulkChangeIntakeBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  showToast(`Intake changed to "${newIntake}" for ${idsArray.length} cadet(s).`)
  document.getElementById('bulkChangeIntakeModal')?.remove()

  selectedCadetIds.clear()
  await refreshAfterChange()
}

// ─── Bulk Delete Cadets ───────────────────────────────────────────────────────

async function bulkDeleteCadets() {
  if (selectedCadetIds.size === 0) {
    showToast('Please select cadets first.', 'warning')
    return
  }

  const confirmed = confirm(`Are you sure you want to delete ${selectedCadetIds.size} cadet(s)? This action cannot be undone.`)
  if (!confirmed) return

  const idsArray = Array.from(selectedCadetIds)

  const { error } = await supabase
    .from('cadets')
    .delete()
    .in('id', idsArray)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  showToast(`${idsArray.length} cadet(s) deleted successfully.`)

  selectedCadetIds.clear()
  await refreshAfterChange()
}

// ─── Refresh Helpers ──────────────────────────────────────────────────────────

async function refreshAfterChange() {
  const staff = getCurrentStaff()
  if (!staff) return

  const college = selectedManageCollege || staff.college

  // Reload all cadets
  const { data, error } = await supabase
    .from('cadets')
    .select('*')
    .eq('college', college)

  if (!error) {
    allManageCadets = data || []
    const totalEl = document.getElementById('totalCadetsCount')
    if (totalEl) totalEl.textContent = allManageCadets.length
  }

  // If we're in stage 2, refresh that view
  if (selectedManageIntake) {
    cadetsForSelectedIntake = allManageCadets.filter(c => c.intake === selectedManageIntake)
    document.getElementById('manageIntakeCadetCount').textContent = cadetsForSelectedIntake.length

    // If no cadets left in this intake, go back to intake selection
    if (!cadetsForSelectedIntake.length) {
      goBackToIntakeSelection()
    } else {
      filterManageCadets()
    }
  }

  await loadDashboardStats()
}

function goBackToIntakeSelection() {
  selectedManageIntake = null
  selectedCadetIds.clear()
  document.getElementById('manageCadetListStage')?.classList.add('hidden')
  document.getElementById('manageIntakeSelectionStage')?.classList.remove('hidden')
  loadIntakeSelection()
}

// ─── Setup Event Listeners ────────────────────────────────────────────────────

export function setupManageCadetsFilters() {
  document.getElementById('manageCadetSearch')?.addEventListener('input', filterManageCadets)
  document.getElementById('manageFormFilter')?.addEventListener('change', filterManageCadets)
  document.getElementById('manageClassFilter')?.addEventListener('change', filterManageCadets)
  document.getElementById('backToManageIntakesBtn')?.addEventListener('click', goBackToIntakeSelection)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrdinal(n) {
  if (!n) return 'N/A'
  const num = parseInt(n)
  if (isNaN(num)) return n
  const s = ['th', 'st', 'nd', 'rd']
  const v = num % 100
  return num + (s[(v - 20) % 10] || s[v] || s[0])
}
