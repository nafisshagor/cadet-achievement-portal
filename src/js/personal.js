import { supabase } from './supabase'
import { getCurrentStaff } from './auth'
import { showToast, setButtonLoading } from './ui'

const STAFF_PHOTOS_BUCKET = 'staff-photos'

export function loadPersonalInfo() {
  const staff = getCurrentStaff()
  if (!staff) return

  document.getElementById('personalFullName').value = staff.full_name || ''
  document.getElementById('personalStaffId').value = staff.staff_id || ''
  document.getElementById('personalRole').value = formatRole(staff.role || '')
  // System admins have no college affiliation
  const collegeField = document.getElementById('personalCollege')
  if (collegeField) {
    if (staff.role === 'system_admin') {
      collegeField.value = 'Universal (All Colleges)'
    } else {
      collegeField.value = staff.college || ''
    }
  }

  // Load staff photo
  const photoEl = document.getElementById('staffProfilePhoto')
  if (photoEl) {
    photoEl.src = staff.photo_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.full_name || 'Staff')}&background=10b981&color=fff&size=96`
  }
  // Update topbar pill photo
  setTopbarPhoto(staff.photo_url)
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

export function setTopbarPhoto(photoUrl) {
  const img  = document.getElementById('topbarStaffPhoto')
  const icon = document.getElementById('topbarUserIcon')
  if (!img || !icon) return
  if (photoUrl) {
    img.src = photoUrl
    img.classList.remove('hidden')
    icon.classList.add('hidden')
  } else {
    img.classList.add('hidden')
    icon.classList.remove('hidden')
  }
}

export async function uploadStaffPhoto() {
  const staff = getCurrentStaff()
  if (!staff) return

  const fileInput = document.getElementById('staffPhotoFile')
  const file = fileInput?.files?.[0]
  if (!file) { showToast('Please select a photo file.', 'warning'); return }

  setButtonLoading('uploadStaffPhotoBtn', true, 'Uploading...')

  try {
    const ext = file.name.split('.').pop()
    const filePath = `staff/${staff.id}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('staff-photos')
      .upload(filePath, file, { cacheControl: '3600', upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('staff-photos').getPublicUrl(filePath)
    const photoUrl = data.publicUrl

    const { error: updateError } = await supabase
      .from('staff_profiles')
      .update({ photo_url: photoUrl })
      .eq('id', staff.id)

    if (updateError) throw updateError

    staff.photo_url = photoUrl
    const photoEl = document.getElementById('staffProfilePhoto')
    if (photoEl) photoEl.src = photoUrl

    // Update topbar user pill photo only (NOT the sidebar logo)
    setTopbarPhoto(photoUrl)

    fileInput.value = ''
    showToast('Photo updated successfully.')
  } catch (err) {
    showToast(err.message || 'Upload failed.', 'error')
  } finally {
    setButtonLoading('uploadStaffPhotoBtn', false)
  }
}
