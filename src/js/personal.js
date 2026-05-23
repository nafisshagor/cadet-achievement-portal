import { supabase } from './supabase'
import { getCurrentStaff } from './auth'
import { showToast, setButtonLoading } from './ui'

export function loadPersonalInfo() {
  const staff = getCurrentStaff()

  if (!staff) return

  document.getElementById('personalFullName').value = staff.full_name || ''
  document.getElementById('personalStaffId').value = staff.staff_id || ''
  document.getElementById('personalRole').value = formatRole(staff.role || '')
  document.getElementById('personalCollege').value = staff.college || ''
}

export async function updatePersonalInfo() {
  const staff = getCurrentStaff()

  if (!staff) {
    showToast('No staff profile found.', 'error')
    return
  }

  const fullName = document.getElementById('personalFullName')?.value.trim()

  if (!fullName) {
    showToast('Full name cannot be empty.', 'warning')
    return
  }

  setButtonLoading('updatePersonalInfoBtn', true, 'Saving...')

  const { error } = await supabase
    .from('staff_profiles')
    .update({ full_name: fullName })
    .eq('id', staff.id)

  setButtonLoading('updatePersonalInfoBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  staff.full_name = fullName
  document.getElementById('staffName').textContent = fullName

  showToast('Personal information updated successfully.')
}

export async function changePassword() {
  const currentPassword = document.getElementById('currentPassword')?.value
  const newPassword = document.getElementById('newPassword')?.value
  const confirmPassword = document.getElementById('confirmPassword')?.value

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill all password fields.', 'warning')
    return
  }

  if (newPassword.length < 6) {
    showToast('New password must be at least 6 characters.', 'warning')
    return
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'error')
    return
  }

  setButtonLoading('changePasswordBtn', true, 'Updating...')

  // Re-authenticate with current password first
  const staff = getCurrentStaff()
  const virtualEmail = staff.staff_id.includes('@')
    ? staff.staff_id.toLowerCase()
    : `${staff.staff_id.toLowerCase()}@asys.local`

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: virtualEmail,
    password: currentPassword
  })

  if (signInError) {
    setButtonLoading('changePasswordBtn', false)
    showToast('Current password is incorrect.', 'error')
    return
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })

  setButtonLoading('changePasswordBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

  // Clear fields
  document.getElementById('currentPassword').value = ''
  document.getElementById('newPassword').value = ''
  document.getElementById('confirmPassword').value = ''

  showToast('Password changed successfully.')
}

function formatRole(role) {
  return role
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}