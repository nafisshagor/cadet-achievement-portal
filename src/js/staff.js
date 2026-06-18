import { supabase, ROLES, COLLEGES } from './supabase'
import { getCurrentStaff } from './auth'
import { showToast, setButtonLoading, escapeHTML, formatHouse } from './ui'

// ─── Staff Registration ───────────────────────────────────────────────────────

export async function registerStaff() {
  const currentStaff = getCurrentStaff()

  if (!currentStaff || (currentStaff.role !== ROLES.ADMIN && currentStaff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can register staff.', 'error')
    return
  }

  const staffId = document.getElementById('staffId')?.value.trim()
  const fullName = document.getElementById('staffFullName')?.value.trim()
  const role = document.getElementById('staffRoleSelect')?.value

  // College logic:
  // - system_admin role → 'System' placeholder (cross-college)
  // - system_admin user registering others → pick from dropdown
  // - college admin registering others → always their own college (no picker)
  const collegeSelect = document.getElementById('staffCollegeSelect')
  let college = ''
  if (role === 'system_admin') {
    college = 'System'
  } else if (currentStaff.role === ROLES.SYSTEM_ADMIN) {
    college = collegeSelect?.value || ''
  } else {
    // College admin: always own college, no selection allowed
    college = currentStaff.college
  }

  const password = document.getElementById('staffInitialPassword')?.value.trim()

  if (!staffId || !fullName || !role || !password) {
    showToast('Please fill all staff registration fields.', 'warning')
    return
  }

  if (currentStaff.role === ROLES.SYSTEM_ADMIN && role !== 'system_admin' && !college) {
    showToast('Please select a college for this staff member.', 'warning')
    return
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'warning')
    return
  }

  const validRoles = ['admin', 'form_master', 'vice_principal', 'principal', 'system_admin']
  if (!validRoles.includes(role)) {
    showToast('Invalid staff role.', 'error')
    return
  }

  if (role === 'system_admin' && currentStaff.role !== ROLES.SYSTEM_ADMIN) {
    showToast('Only system admins can create system admin accounts.', 'error')
    return
  }

  setButtonLoading('registerStaffBtn', true, 'Registering...')

  // Capture admin session BEFORE signUp (signUp silently replaces the session)
  const { data: adminSessionData } = await supabase.auth.getSession()
  const adminRefreshToken = adminSessionData?.session?.refresh_token
  const adminUserId       = adminSessionData?.session?.user?.id

  try {
    const newEmail = staffId.includes('@')
      ? staffId.toLowerCase()
      : `${staffId.toLowerCase()}@asys.local`

    // ── Step 1: Create the auth user ──────────────────────────────────────────
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: newEmail,
      password,
      options: {
        data: { staff_id: staffId, full_name: fullName, role, college }
      }
    })

    // ── Handle "User already registered" ─────────────────────────────────────
    // This happens when the auth user exists but their staff_profiles row was
    // previously deleted by removeStaff (which only deletes the profile row).
    if (signUpError) {
      const alreadyExists = /already registered|user already exists/i.test(signUpError.message)
      if (!alreadyExists) {
        // Restore admin session before throwing
        if (adminRefreshToken) {
          await supabase.auth.refreshSession({ refresh_token: adminRefreshToken })
        }
        throw new Error(signUpError.message)
      }

      // Restore admin session so we can update the profile
      if (adminRefreshToken) {
        await supabase.auth.refreshSession({ refresh_token: adminRefreshToken })
      }

      // Auth user exists — try to find their profile by staff_id
      const { data: existingProfile } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('staff_id', staffId)
        .maybeSingle()

      if (existingProfile) {
        const { error: updateErr } = await supabase
          .from('staff_profiles')
          .update({ full_name: fullName, role, college })
          .eq('staff_id', staffId)

        if (updateErr) throw new Error(updateErr.message)
        clearStaffForm()
        showToast('Staff profile updated (auth account already existed).', 'info')
      } else {
        throw new Error(
          `Auth account for "${staffId}" already exists but has no profile. ` +
          `Delete the user from Supabase Auth dashboard, then register again.`
        )
      }

      await reloadStaffListSafely(adminUserId)
      return
    }

    if (!signUpData?.user) throw new Error('Failed to create user account.')

    // ── Step 2: Insert staff profile WHILE new user session is active ─────────
    // At this point the Supabase client is signed in as the new user.
    // RLS on staff_profiles typically allows: id = auth.uid() for INSERT.
    // We insert now while auth.uid() == signUpData.user.id so RLS is satisfied.
    const { error: profileError } = await supabase
      .from('staff_profiles')
      .insert([{
        id:        signUpData.user.id,
        staff_id:  staffId,
        full_name: fullName,
        role,
        college
      }])

    // ── Step 3: Restore admin session ─────────────────────────────────────────
    if (adminRefreshToken) {
      const { error: restoreErr } = await supabase.auth.refreshSession({ refresh_token: adminRefreshToken })
      if (restoreErr) {
        console.warn('Could not restore admin session via refresh token:', restoreErr.message)
      }
    }

    if (profileError) throw new Error(profileError.message)

    clearStaffForm()
    showToast('Staff registered successfully.')

  } catch (error) {
    // Always try to restore admin session on error
    if (adminRefreshToken) {
      await supabase.auth.refreshSession({ refresh_token: adminRefreshToken }).catch(() => {})
    }
    showToast(error.message, 'error')
  } finally {
    await reloadStaffListSafely(adminUserId)
    setButtonLoading('registerStaffBtn', false)
  }
}

/**
 * Reload the staff list after registration.
 * Re-reads currentStaff from the database to make sure it reflects the
 * restored admin session (not the briefly-active new-user session).
 */
async function reloadStaffListSafely(adminUserId) {
  if (!adminUserId) {
    await loadStaffList()
    return
  }
  // Re-fetch the admin's own profile to refresh the in-memory currentStaff
  const { refreshCurrentStaff } = await import('./auth')
  if (typeof refreshCurrentStaff === 'function') {
    await refreshCurrentStaff()
  }
  await loadStaffList()
}

// ─── Staff List ───────────────────────────────────────────────────────────────

let selectedStaffIds = new Set()

export async function loadStaffList() {
  const currentStaff = getCurrentStaff()
  const container = document.getElementById('staffListTable')

  if (!container || !currentStaff) return

  container.innerHTML = `<p class="text-slate-500 text-sm py-4">Loading staff...</p>`

  // System admins see all staff across all colleges; college admins see only their college
  // College admins never see system_admin accounts — those are cross-college and irrelevant to them.
  let query = supabase
    .from('staff_profiles')
    .select('*')

  if (currentStaff.role !== ROLES.SYSTEM_ADMIN) {
    query = query
      .eq('college', currentStaff.college)
      .neq('role', ROLES.SYSTEM_ADMIN)
  }

  const { data, error } = await query.order('full_name', { ascending: true })

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm py-4">Failed to load staff list.</p>`
    return
  }

  if (!data || !data.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users-gear"></i><p>No staff registered yet.</p></div>`
    return
  }

  selectedStaffIds.clear()
  updateBulkDeleteButton()

  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input type="checkbox" id="selectAllStaff" class="staff-checkbox" title="Select all">
            </th>
            <th>Faculty ID</th>
            <th>Full Name</th>
            <th>Role</th>
            <th>College</th>
            <th style="width: 120px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(member => `
            <tr data-staff-id="${member.id}">
              <td>
                ${member.id !== currentStaff.id ? `
                  <input type="checkbox" class="staff-checkbox staff-select-checkbox" data-id="${member.id}">
                ` : ''}
              </td>
              <td class="font-mono text-xs">${escapeHTML(member.staff_id)}</td>
              <td class="font-semibold">${escapeHTML(member.full_name)}</td>
              <td><span class="role-badge role-${escapeHTML(member.role)}">${formatRole(member.role)}</span></td>
              <td class="text-xs">${escapeHTML(member.college)}</td>
              <td>
                ${member.id !== currentStaff.id ? `
                  <div class="flex items-center gap-2">
                    <button data-id="${member.id}" class="edit-staff-btn staff-action-icon edit" title="Edit staff">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    <button data-id="${member.id}" class="remove-staff-btn staff-action-icon delete" title="Delete staff">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ` : '<span class="text-xs text-slate-400">(You)</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  // Select all checkbox
  document.getElementById('selectAllStaff')?.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.staff-select-checkbox')
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked
      if (e.target.checked) {
        selectedStaffIds.add(cb.dataset.id)
      } else {
        selectedStaffIds.delete(cb.dataset.id)
      }
    })
    updateBulkDeleteButton()
  })

  // Individual checkboxes
  document.querySelectorAll('.staff-select-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedStaffIds.add(e.target.dataset.id)
      } else {
        selectedStaffIds.delete(e.target.dataset.id)
      }
      updateBulkDeleteButton()
    })
  })

  // Edit buttons
  container.querySelectorAll('.edit-staff-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditStaffModal(btn.dataset.id, data))
  })

  // Remove buttons
  container.querySelectorAll('.remove-staff-btn').forEach(btn => {
    btn.addEventListener('click', () => removeStaff(btn.dataset.id))
  })
}

function updateBulkDeleteButton() {
  const btn = document.getElementById('bulkDeleteStaffBtn')
  const countSpan = document.getElementById('selectedStaffCount')
  
  if (!btn || !countSpan) return

  countSpan.textContent = selectedStaffIds.size
  
  if (selectedStaffIds.size > 0) {
    btn.classList.remove('hidden')
  } else {
    btn.classList.add('hidden')
  }
}

async function openEditStaffModal(staffId, staffData) {
  const staff = staffData.find(s => s.id === staffId)
  if (!staff) return

  const modal = document.createElement('div')
  modal.id = 'editStaffModal'
  modal.className = 'modal-backdrop'
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3>Edit Staff Member</h3>
        <button class="modal-close" onclick="document.getElementById('editStaffModal').remove()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="portal-label">Faculty ID</label>
          <input id="editStaffId" type="text" value="${escapeHTML(staff.staff_id)}" class="portal-input" readonly>
        </div>
        <div>
          <label class="portal-label">Full Name</label>
          <input id="editStaffName" type="text" value="${escapeHTML(staff.full_name)}" class="portal-input">
        </div>
        <div>
          <label class="portal-label">Role</label>
          <select id="editStaffRole" class="portal-input">
            <option value="form_master" ${staff.role === 'form_master' ? 'selected' : ''}>Form Master</option>
            <option value="admin" ${staff.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="vice_principal" ${staff.role === 'vice_principal' ? 'selected' : ''}>Vice Principal</option>
            <option value="principal" ${staff.role === 'principal' ? 'selected' : ''}>Principal</option>
          </select>
        </div>
        <button id="saveEditStaffBtn" class="portal-btn-primary w-full py-3" data-id="${staffId}">
          <i class="fa-solid fa-floppy-disk"></i> Save Changes
        </button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  document.getElementById('saveEditStaffBtn')?.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id
    const fullName = document.getElementById('editStaffName')?.value.trim()
    const role = document.getElementById('editStaffRole')?.value

    if (!fullName || !role) {
      showToast('Please fill all fields.', 'warning')
      return
    }

    setButtonLoading('saveEditStaffBtn', true, 'Saving...')

    const { error } = await supabase
      .from('staff_profiles')
      .update({ full_name: fullName, role })
      .eq('id', id)

    setButtonLoading('saveEditStaffBtn', false)

    if (error) {
      showToast(error.message, 'error')
      return
    }

    showToast('Staff member updated successfully.')
    modal.remove()
    await loadStaffList()
  })
}

async function removeStaff(staffId) {
  const currentStaff = getCurrentStaff()

  if (!currentStaff || (currentStaff.role !== ROLES.ADMIN && currentStaff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can remove staff.', 'error')
    return
  }

  const confirmed = confirm('Are you sure you want to remove this staff member?')
  if (!confirmed) return

  try {
    const { error, count } = await supabase
      .from('staff_profiles')
      .delete({ count: 'exact' })
      .eq('id', staffId)

    if (error) throw new Error(error.message)

    // count === 0 means RLS blocked the delete silently — the row was not deleted
    if (count === 0) {
      throw new Error(
        'Delete was blocked by a database security policy. ' +
        'Make sure the RLS policies on staff_profiles allow admins to delete rows. ' +
        'Run the SQL fix script in Supabase to resolve this.'
      )
    }

    showToast('Staff member removed.')
    await loadStaffList()
  } catch (error) {
    showToast(error.message, 'error')
  }
}

export async function bulkDeleteStaff() {
  const currentStaff = getCurrentStaff()

  if (!currentStaff || (currentStaff.role !== ROLES.ADMIN && currentStaff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can delete staff.', 'error')
    return
  }

  if (selectedStaffIds.size === 0) {
    showToast('No staff members selected.', 'warning')
    return
  }

  const confirmed = confirm(`Are you sure you want to delete ${selectedStaffIds.size} staff member(s)?`)
  if (!confirmed) return

  try {
    const idsArray = Array.from(selectedStaffIds)

    const { error, count } = await supabase
      .from('staff_profiles')
      .delete({ count: 'exact' })
      .in('id', idsArray)

    if (error) throw new Error(error.message)

    if (count === 0) {
      throw new Error(
        'Delete was blocked by a database security policy. ' +
        'Run the SQL fix script in Supabase to resolve this.'
      )
    }

    showToast(`${count} staff member(s) removed.`)
    selectedStaffIds.clear()
    await loadStaffList()
  } catch (error) {
    showToast(error.message, 'error')
  }
}

// ─── Reset Password (not available without service role key) ──────────────────

export function closeResetPasswordModal() {
  const modal = document.getElementById('resetPasswordModal')
  if (modal) modal.classList.add('hidden')
}

export async function executePasswordReset() {
  showToast('Password reset requires admin deployment. Staff can change their own password from Personal Info.', 'info')
  closeResetPasswordModal()
}

// ─── Form Master Assignment ───────────────────────────────────────────────────

export async function loadFormMasterAssignmentPage() {
  const currentStaff = getCurrentStaff()
  if (!currentStaff || (currentStaff.role !== ROLES.ADMIN && currentStaff.role !== ROLES.SYSTEM_ADMIN)) return

  await Promise.all([
    loadFormMasterSelect(),
    loadIntakeSelect(),
    loadAssignmentList()
  ])
}

async function loadFormMasterSelect() {
  const select = document.getElementById('assignFMSelect')
  if (!select) return

  const currentStaff = getCurrentStaff()

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, full_name, staff_id')
    .eq('college', currentStaff.college)
    .eq('role', ROLES.FORM_MASTER)
    .order('full_name', { ascending: true })

  if (error || !data) return

  select.innerHTML = `<option value="">— Select Form Master —</option>` +
    data.map(fm => `<option value="${fm.id}">${escapeHTML(fm.full_name)} (${escapeHTML(fm.staff_id)})</option>`).join('')
}

async function loadIntakeSelect() {
  const select = document.getElementById('assignIntake')
  if (!select) return

  const currentStaff = getCurrentStaff()

  // Get unique intakes from cadets table for this college
  const { data, error } = await supabase
    .from('cadets')
    .select('intake')
    .eq('college', currentStaff.college)
    .order('intake', { ascending: false })

  if (error || !data) {
    select.innerHTML = `<option value="">— No intakes found —</option>`
    return
  }

  // Get unique intakes
  const uniqueIntakes = [...new Set(data.map(c => c.intake).filter(Boolean))]

  if (uniqueIntakes.length === 0) {
    select.innerHTML = `<option value="">— No intakes found —</option>`
    return
  }

  select.innerHTML = `<option value="">— Select Intake —</option>` +
    uniqueIntakes.map(intake => `<option value="${escapeHTML(intake)}">${escapeHTML(intake)}</option>`).join('')
}

export async function saveFormAssignment() {
  const currentStaff = getCurrentStaff()

  if (!currentStaff || (currentStaff.role !== ROLES.ADMIN && currentStaff.role !== ROLES.SYSTEM_ADMIN)) {
    showToast('Only admins can assign form masters.', 'error')
    return
  }

  const staffUserId = document.getElementById('assignFMSelect')?.value
  const intake = document.getElementById('assignIntake')?.value
  const form = document.getElementById('assignForm')?.value

  if (!staffUserId || !intake || !form) {
    showToast('Please fill all assignment fields.', 'warning')
    return
  }

  setButtonLoading('saveAssignmentBtn', true, 'Saving...')

  const { data: existing } = await supabase
    .from('form_master_assignments')
    .select('id')
    .eq('college', currentStaff.college)
    .eq('intake', intake)
    .eq('form', form)

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('form_master_assignments')
      .update({ staff_user_id: staffUserId })
      .eq('college', currentStaff.college)
      .eq('intake', intake)
      .eq('form', form)

    setButtonLoading('saveAssignmentBtn', false)
    if (error) { showToast(error.message, 'error'); return }
  } else {
    const { error } = await supabase
      .from('form_master_assignments')
      .insert([{ staff_user_id: staffUserId, college: currentStaff.college, intake, form }])

    setButtonLoading('saveAssignmentBtn', false)
    if (error) { showToast(error.message, 'error'); return }
  }

  showToast('Form master assigned successfully.')
  await loadAssignmentList()
}

async function loadAssignmentList() {
  const container = document.getElementById('assignmentList')
  const currentStaff = getCurrentStaff()

  if (!container || !currentStaff) return

  // Fetch assignments
  const { data: assignments, error } = await supabase
    .from('form_master_assignments')
    .select('id, intake, form, college, staff_user_id')
    .eq('college', currentStaff.college)
    .order('intake', { ascending: true })

  if (error) {
    console.error('Failed to load assignments:', error)
    container.innerHTML = `<p class="text-red-500 text-sm">Failed to load assignments. ${escapeHTML(error.message || '')}</p>`
    return
  }

  if (!assignments || !assignments.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-chalkboard-user"></i><p>No form master assignments yet.</p></div>`
    return
  }

  // Fetch staff profiles separately
  const staffIds = [...new Set(assignments.map(a => a.staff_user_id).filter(Boolean))]
  let profileMap = {}

  if (staffIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('staff_profiles')
      .select('id, full_name, staff_id')
      .in('id', staffIds)

    if (!profilesError && profiles) {
      profiles.forEach(p => { profileMap[p.id] = p })
    }
  }

  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead><tr><th>Intake</th><th>Form</th><th>Form Master</th><th>Faculty ID</th><th>Actions</th></tr></thead>
        <tbody>
          ${assignments.map(row => {
            const profile = profileMap[row.staff_user_id] || {}
            return `
            <tr>
              <td class="font-semibold">${escapeHTML(row.intake)}</td>
              <td><span class="inline-block bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-bold">${escapeHTML(row.form)}</span></td>
              <td>${escapeHTML(profile.full_name || 'Unknown')}</td>
              <td class="font-mono text-xs">${escapeHTML(profile.staff_id || '')}</td>
              <td><button data-id="${row.id}" class="remove-assignment-btn text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-xl font-bold transition">Remove</button></td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `

  container.querySelectorAll('.remove-assignment-btn').forEach(btn => {
    btn.addEventListener('click', () => removeAssignment(btn.dataset.id))
  })
}

async function removeAssignment(id) {
  if (!confirm('Remove this form master assignment?')) return

  const { error } = await supabase.from('form_master_assignments').delete().eq('id', id)
  if (error) { showToast(error.message, 'error'); return }

  showToast('Assignment removed.')
  await loadAssignmentList()
}

// ─── Faculty Transfer ─────────────────────────────────────────────────────────

export async function loadFacultyTransferPage() {
  const currentStaff = getCurrentStaff()
  if (!currentStaff || currentStaff.role !== ROLES.SYSTEM_ADMIN) return

  const select = document.getElementById('transferFacultySelect')
  if (!select) return

  const { data, error } = await supabase
    .from('staff_profiles')
    .select('id, full_name, staff_id, role')
    .eq('college', currentStaff.college)
    .order('full_name', { ascending: true })

  if (error || !data) return

  select.innerHTML = `<option value="">— Select Faculty Member —</option>` +
    data.filter(m => m.id !== currentStaff.id)
      .map(m => `<option value="${m.id}">${escapeHTML(m.full_name)} (${formatRole(m.role)})</option>`)
      .join('')

  await loadTransferHistory()
}

export async function executeFacultyTransfer() {
  const currentStaff = getCurrentStaff()

  if (!currentStaff || currentStaff.role !== ROLES.SYSTEM_ADMIN) {
    showToast('Only system admins can transfer faculty across colleges.', 'error')
    return
  }

  const targetId = document.getElementById('transferFacultySelect')?.value
  const destCollege = document.getElementById('transferCollegeSelect')?.value

  if (!targetId || !destCollege) {
    showToast('Please select a faculty member and destination college.', 'warning')
    return
  }

  if (destCollege === currentStaff.college) {
    showToast('Destination must be different from current college.', 'warning')
    return
  }

  if (!confirm(`Transfer this faculty member to ${destCollege}?`)) return

  setButtonLoading('executeFacultyTransferBtn', true, 'Transferring...')

  const { data: targetProfile, error: fetchError } = await supabase
    .from('staff_profiles').select('full_name, college').eq('id', targetId).single()

  if (fetchError) {
    showToast('Could not find staff profile.', 'error')
    setButtonLoading('executeFacultyTransferBtn', false)
    return
  }

  const { error } = await supabase.from('staff_profiles').update({ college: destCollege }).eq('id', targetId)

  if (error) {
    showToast(error.message, 'error')
    setButtonLoading('executeFacultyTransferBtn', false)
    return
  }

  await supabase.from('faculty_transfers').insert([{
    staff_user_id: targetId,
    from_college: targetProfile.college,
    to_college: destCollege,
    transferred_by: currentStaff.id
  }])

  setButtonLoading('executeFacultyTransferBtn', false)
  showToast(`${targetProfile.full_name} transferred to ${destCollege}.`)
  await loadFacultyTransferPage()
}

async function loadTransferHistory() {
  const container = document.getElementById('facultyTransferHistory')
  const currentStaff = getCurrentStaff()
  if (!container || !currentStaff) return

  const { data, error } = await supabase
    .from('faculty_transfers')
    .select('id, from_college, to_college, created_at, staff_profiles!faculty_transfers_staff_user_id_fkey ( full_name, staff_id )')
    .or(`from_college.eq.${currentStaff.college},to_college.eq.${currentStaff.college}`)
    .order('created_at', { ascending: false })
    .limit(20)

  const countEl = document.querySelector('#facultyTransferPage .record-pill')
  if (countEl) countEl.textContent = `${data?.length || 0} records`

  if (error || !data || !data.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>No transfers recorded yet.</p></div>`
    return
  }

  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead><tr><th>Staff Member</th><th>From</th><th>To</th><th>Date</th></tr></thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td class="font-semibold">${escapeHTML(row.staff_profiles?.full_name || 'Unknown')}</td>
              <td class="text-xs">${escapeHTML(row.from_college)}</td>
              <td class="text-emerald-700 font-semibold text-xs">${escapeHTML(row.to_college)}</td>
              <td class="text-xs">${new Date(row.created_at).toLocaleDateString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

// ─── Cadet Promotion ──────────────────────────────────────────────────────────

export async function loadPromotionCadets() {
  const currentStaff = getCurrentStaff()
  const classValue = document.getElementById('promotionClassSelect')?.value
  const collegeFilter = document.getElementById('promotionCollegeFilter')?.value
  const container = document.getElementById('promotionCadetList')

  if (!container || !classValue) {
    showToast('Please select a class to promote from.', 'warning')
    return
  }

  const classMap = {
    VII_TO_VIII: { from: 'VII', to: 'VIII' },
    VIII_TO_IX: { from: 'VIII', to: 'IX' },
    IX_TO_X: { from: 'IX', to: 'X' },
    X_TO_SSC: { from: 'X', to: 'SSC Candidate' },
    SSC_TO_XI: { from: 'SSC Candidate', to: 'XI' },
    XI_TO_XII: { from: 'XI', to: 'XII' },
    XII_TO_PASSED_OUT: { from: 'XII', to: 'Passed Out' }
  }

  const mapping = classMap[classValue]
  if (!mapping) return

  container.innerHTML = `<div class="text-center py-10 text-slate-500">Loading cadets...</div>`

  let query = supabase.from('cadets').select('*').eq('class_name', mapping.from)
  // College admins are always scoped to their own college; only system admins
  // can use the college filter dropdown to cross colleges.
  const effectiveCollege = currentStaff.role === ROLES.SYSTEM_ADMIN
    ? (collegeFilter || currentStaff.college)
    : currentStaff.college
  query = query.eq('college', effectiveCollege)

  const { data, error } = await query.order('cadet_no', { ascending: true })

  if (error) { 
    container.innerHTML = `<div class="text-center py-10 text-red-500">Failed to load cadets.</div>`
    return 
  }

  if (!data || !data.length) {
    container.innerHTML = `
      <div class="empty-state py-16">
        <i class="fa-solid fa-users-slash"></i>
        <h3 class="text-lg font-bold text-slate-700">No Cadets Found</h3>
        <p class="text-slate-500 text-sm">No cadets found in Class ${mapping.from}.</p>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-sm text-amber-800 font-semibold">
      <i class="fa-solid fa-triangle-exclamation flex-shrink-0"></i>
      <span>This will promote <strong>${data.length} cadets</strong> from Class ${mapping.from} → ${mapping.to}.</span>
    </div>
    <div class="overflow-x-auto">
      <table class="portal-table w-full text-sm" style="min-width: 0; table-layout: fixed;">
        <thead>
          <tr>
            <th style="width: 90px; text-align: left;">Cadet No</th>
            <th style="text-align: left;">Name</th>
            <th style="width: 70px; text-align: left;">Class</th>
            <th style="width: 100px; text-align: left;">House</th>
          </tr>
        </thead>
        <tbody>${data.map(c => `
          <tr>
            <td class="font-mono font-bold" style="text-align: left;">${escapeHTML(c.cadet_no)}</td>
            <td class="font-semibold" style="text-align: left;">${escapeHTML(c.name)}</td>
            <td style="text-align: left;">${escapeHTML(c.class_name)}</td>
            <td style="text-align: left;">${formatHouse(c.house)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>
    <button id="executePromotionBtn" class="portal-btn-primary mt-4 px-5 py-3 text-sm w-full" data-from="${mapping.from}" data-to="${mapping.to}" data-college="${collegeFilter || currentStaff.college}">
      <i class="fa-solid fa-arrow-up-right-dots mr-2"></i> Promote ${data.length} Cadets to ${mapping.to}
    </button>
  `

  document.getElementById('executePromotionBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    await executePromotion(btn.dataset.from, btn.dataset.to, btn.dataset.college)
  })
}

async function executePromotion(fromClass, toClass, college) {
  if (!confirm(`Promote all Class ${fromClass} cadets to ${toClass}? This cannot be undone.`)) return

  setButtonLoading('executePromotionBtn', true, 'Promoting...')

  const { error } = await supabase.from('cadets').update({ class_name: toClass }).eq('class_name', fromClass).eq('college', college)

  setButtonLoading('executePromotionBtn', false)

  if (error) { showToast(error.message, 'error'); return }

  showToast(`Cadets promoted from Class ${fromClass} to ${toClass}.`)
  document.getElementById('promotionCadetList').innerHTML = `
    <div class="empty-state py-16">
      <i class="fa-solid fa-circle-check text-emerald-500"></i>
      <h3 class="text-lg font-bold text-emerald-700">Promotion Complete</h3>
      <p class="text-slate-500 text-sm">All cadets have been promoted successfully.</p>
    </div>
  `
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearStaffForm() {
  ['staffId', 'staffFullName', 'staffInitialPassword'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
}

function formatRole(role) {
  return (role || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
