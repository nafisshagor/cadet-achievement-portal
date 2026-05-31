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

export function printProfile() {
  // Save current theme and force light theme for printing
  const html = document.documentElement
  const currentTheme = html.getAttribute('data-theme')
  html.setAttribute('data-theme', 'light')

  // Restore theme after print dialog closes
  const restoreTheme = () => {
    if (currentTheme) {
      html.setAttribute('data-theme', currentTheme)
    } else {
      html.removeAttribute('data-theme')
    }
    window.removeEventListener('afterprint', restoreTheme)
  }
  window.addEventListener('afterprint', restoreTheme)

  // Trigger print
  window.print()

  // Fallback: restore after a delay if afterprint event doesn't fire
  setTimeout(restoreTheme, 1000)
}
