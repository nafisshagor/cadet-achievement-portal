import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles/style.css'

import { login, logout, checkSession, initPasswordToggle } from './js/auth'
import { addCadet, bulkUploadCadets, setupCadetRecordsNavigation } from './js/cadets'
import { loadManageCadets, setupManageCadetsFilters } from './js/manage-cadets'
import { loadPassedOutIntakes, setupPassedOutNavigation } from './js/passed-out'
import { printProfile, uploadProfilePhoto, closeProfile } from './js/profile'
import { setupDashboardEvents } from './js/dashboard'
import { saveAchievementFromForm, closeAchievementForm } from './js/achievements'
import {
  registerStaff,
  loadStaffList,
  loadFormMasterAssignmentPage,
  saveFormAssignment,
  loadFacultyTransferPage,
  executeFacultyTransfer,
  loadPromotionCadets,
  closeResetPasswordModal,
  executePasswordReset,
  bulkDeleteStaff
} from './js/staff'
import { setupTheme } from './js/theme'
import { loadPersonalInfo, updatePersonalInfo, changePassword } from './js/personal'

document.addEventListener('DOMContentLoaded', () => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  document.getElementById('loginBtn')?.addEventListener('click', login)
  document.getElementById('logoutBtn')?.addEventListener('click', logout)
  initPasswordToggle() // Initialize password toggle

  // ── Cadets ────────────────────────────────────────────────────────────────
  document.getElementById('addCadetBtn')?.addEventListener('click', addCadet)
  document.getElementById('bulkUploadBtn')?.addEventListener('click', bulkUploadCadets)
  setupCadetRecordsNavigation() // Setup navigation for new two-stage interface
  setupManageCadetsFilters() // Setup filters for manage cadets page
  setupPassedOutNavigation() // Setup navigation for passed out cadets page

  // ── Profile ───────────────────────────────────────────────────────────────
  document.getElementById('backToCadetListBtn')?.addEventListener('click', closeProfile)
  document.getElementById('printBtn')?.addEventListener('click', printProfile)
  document.getElementById('printBtnDesktop')?.addEventListener('click', printProfile)
  document.getElementById('uploadPhotoBtn')?.addEventListener('click', uploadProfilePhoto)

  // ── Achievements ──────────────────────────────────────────────────────────
  document.getElementById('saveAchievementBtn')?.addEventListener('click', saveAchievementFromForm)
  document.getElementById('closeAchievementBtn')?.addEventListener('click', closeAchievementForm)

  // ── Discipline checkboxes — enable/disable count inputs ───────────────────
  ;['discExtraDrills','discConfinements','discParentsCall','discWarnings'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      const countInput = document.getElementById(id + 'Count')
      if (countInput) {
        countInput.disabled = !e.target.checked
        if (!e.target.checked) countInput.value = ''
      }
    })
  })

  // ── Staff Registry ────────────────────────────────────────────────────────
  document.getElementById('registerStaffBtn')?.addEventListener('click', registerStaff)
  document.getElementById('bulkDeleteStaffBtn')?.addEventListener('click', bulkDeleteStaff)

  // Hide college selector when registering a System Admin (they don't belong to one)
  document.getElementById('staffRoleSelect')?.addEventListener('change', (e) => {
    const collegeWrap = document.getElementById('staffCollegeWrap')
    if (!collegeWrap) return
    const isHiddenForRole = e.target.value === 'system_admin'
    if (isHiddenForRole) {
      collegeWrap.classList.add('hidden')
    } else {
      // Only show it back if the current user is a system admin
      const currentRole = document.getElementById('topbarRole')?.textContent || ''
      if (currentRole.includes('System Admin')) {
        collegeWrap.classList.remove('hidden')
      }
    }
  })

  // ── Reset Password Modal ──────────────────────────────────────────────────
  document.getElementById('closeResetModalBtn')?.addEventListener('click', closeResetPasswordModal)
  document.getElementById('executeResetBtn')?.addEventListener('click', executePasswordReset)

  // ── Form Assignment ───────────────────────────────────────────────────────
  document.getElementById('saveAssignmentBtn')?.addEventListener('click', saveFormAssignment)

  // ── Faculty Transfer ──────────────────────────────────────────────────────
  document.getElementById('executeFacultyTransferBtn')?.addEventListener('click', executeFacultyTransfer)

  // ── Cadet Promotion ───────────────────────────────────────────────────────
  document.getElementById('loadPromotionCadetsBtn')?.addEventListener('click', loadPromotionCadets)

  // ── Personal Info ─────────────────────────────────────────────────────────
  document.getElementById('updatePersonalInfoBtn')?.addEventListener('click', updatePersonalInfo)
  document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword)

  // ── Cadet Tabs (Add Cadet page) ───────────────────────────────────────────
  document.querySelectorAll('.cadet-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.cadetTab
      const tabsNav = document.querySelector('.cadet-tabs-nav')
      
      // Update active button
      document.querySelectorAll('.cadet-tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      
      // Update nav data attribute for sliding indicator
      if (tabsNav) {
        tabsNav.setAttribute('data-active', tabId)
      }
      
      // Show/hide tab content
      document.querySelectorAll('.cadet-tab-content').forEach(content => {
        content.classList.add('hidden')
      })
      document.getElementById(tabId)?.classList.remove('hidden')
    })
  })

  // ── Bulk Upload File Input ────────────────────────────────────────────────
  document.getElementById('bulkCadetFile')?.addEventListener('change', event => {
    const file = event.target.files?.[0]
    const fileName = document.getElementById('bulkFileName')
    const button = document.getElementById('bulkUploadBtn')
    const previewArea = document.getElementById('bulkPreviewArea')

    if (fileName) {
      fileName.textContent = file ? file.name : 'Choose file...'
    }

    if (button) {
      button.innerHTML = `
        <i class="fa-solid fa-table"></i>
        <span>Preview Data</span>
      `
    }

    if (previewArea) {
      previewArea.classList.add('hidden')
      previewArea.innerHTML = ''
    }
  })

  // ── Dashboard page-switch side effects ───────────────────────────────────
  // Handled inside setupDashboardEvents via data-page callbacks
  setupDashboardEvents({
    onPageSwitch: async (pageId) => {
      if (pageId === 'personalInfoPage') loadPersonalInfo()
      if (pageId === 'manageCadetsPage') {
        loadManageCadets()
      }
      if (pageId === 'passedOutCadetsPage') loadPassedOutIntakes()
      if (pageId === 'staffRegistryPage') loadStaffList()
      if (pageId === 'formAssignmentPage') loadFormMasterAssignmentPage()
      if (pageId === 'facultyTransferPage') loadFacultyTransferPage()
    }
  })

  setupTheme()
  checkSession()
})
