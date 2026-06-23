import { supabase, ROLES } from './supabase'
import { getCurrentStaff } from './auth'
import { setText, escapeHTML } from './ui'
import { setTopbarPhoto } from './personal'

export function renderDashboardForRole(staff) {
  // Personalized greeting based on time of day
  const greeting = getGreeting()
  const firstName = (staff.full_name || '').split(' ')[0] || 'there'
  setText('portalTitle', `${greeting}, ${firstName}`)
  setText('portalSubtitle', getSubtitle(staff.role))
  setText('heroRoleTag', `${formatRole(staff.role)} · ${staff.college || 'CCAMS'}`)
  setText('staffName', staff.full_name)
  setText('staffRole', formatRole(staff.role))
  setText('staffCollege', staff.college)
  setText('topbarRole', formatRole(staff.role))

  // Show staff photo in topbar if available
  setTopbarPhoto(staff.photo_url || null)

  // Hide all sidebar items by default, then show those matching the current role
  document.querySelectorAll('[data-sidebar-role]').forEach(item => {
    const allowedRoles = (item.dataset.sidebarRole || '').split(',').map(r => r.trim())
    if (allowedRoles.includes(staff.role)) {
      item.classList.remove('hidden')
    } else {
      item.classList.add('hidden')
    }
  })

  // Show/hide Administration section based on role (admins only - both types)
  const adminSection = document.getElementById('adminSection')
  if (adminSection) {
    if (staff.role === ROLES.SYSTEM_ADMIN || staff.role === ROLES.ADMIN) {
      adminSection.classList.remove('hidden')
    } else {
      adminSection.classList.add('hidden')
    }
  }

  // Hide System Admin role option in staff registration unless current user is system admin
  document.querySelectorAll('[data-role-restricted]').forEach(item => {
    const requiredRole = item.dataset.roleRestricted
    if (staff.role !== requiredRole) {
      item.style.display = 'none'
    } else {
      item.style.display = ''
    }
  })

  // Show college selector for system admin in staff registry
  const staffCollegeWrap = document.getElementById('staffCollegeWrap')
  if (staffCollegeWrap) {
    if (staff.role === ROLES.SYSTEM_ADMIN) {
      staffCollegeWrap.classList.remove('hidden')
    } else {
      staffCollegeWrap.classList.add('hidden')
    }
  }

  // ── Bulk cadet upload: college admin sees only their own college ──────────
  const bulkCollegeSelect = document.getElementById('bulkCollegeSelect')
  if (bulkCollegeSelect) {
    const wrapper = bulkCollegeSelect.closest('div') || bulkCollegeSelect.parentElement
    if (staff.role !== ROLES.SYSTEM_ADMIN) {
      // Hide the dropdown and show a locked read-only label instead
      bulkCollegeSelect.style.display = 'none'
      // Auto-select the admin's college so the value is ready for the upload function
      for (const opt of bulkCollegeSelect.options) {
        opt.selected = opt.value === staff.college || opt.text === staff.college
      }
      if (wrapper && !wrapper.querySelector('.college-locked-info')) {
        const lockedEl = document.createElement('div')
        lockedEl.className = 'college-locked-info portal-input bg-slate-50 text-slate-600 flex items-center gap-2 cursor-not-allowed'
        lockedEl.innerHTML = `<i class="fa-solid fa-lock text-slate-400 text-xs"></i> ${escapeHTML(staff.college)}`
        wrapper.appendChild(lockedEl)
      }
    } else {
      // System admin: restore the dropdown
      bulkCollegeSelect.style.display = ''
      wrapper?.querySelector('.college-locked-info')?.remove()
    }
  }

  // ── Cadet promotion: college admin sees their college as a locked label ───
  const promotionCollegeFilterWrap = document.getElementById('promotionCollegeFilterWrap')
  const promotionCollegeFilter     = document.getElementById('promotionCollegeFilter')
  if (promotionCollegeFilterWrap && promotionCollegeFilter) {
    if (staff.role !== ROLES.SYSTEM_ADMIN) {
      // Hide the filter entirely — promotion JS always uses currentStaff.college for non-system-admins
      promotionCollegeFilterWrap.classList.add('hidden')
      // Clear any previously set filter value so it can never accidentally cross colleges
      promotionCollegeFilter.value = ''
    } else {
      promotionCollegeFilterWrap.classList.remove('hidden')
    }
  }

  // Show/hide quick action buttons based on role
  document.querySelectorAll('[data-quick-role]').forEach(item => {
    const allowedRoles = (item.dataset.quickRole || '').split(',').map(r => r.trim())
    if (allowedRoles.includes(staff.role)) {
      item.classList.remove('hidden')
    } else {
      item.classList.add('hidden')
    }
  })

  // Add click handlers for quick action buttons
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.dataset.page
      if (pageId) {
        // Trigger the sidebar link for that page
        const sidebarLink = document.querySelector(`[data-page="${pageId}"]`)
        if (sidebarLink) sidebarLink.click()
      }
    })
  })

  if (staff.role === ROLES.FORM_MASTER) {
    setText('cadetListTitle', 'My Assigned Cadets')
  } else {
    setText('cadetListTitle', 'College Cadet Records')
  }
}

export async function loadDashboardStats() {
  const staff = getCurrentStaff()
  if (!staff) return

  const cadets = await getCollegeScopedCadets(staff)
  const cadetIds = cadets.map(cadet => cadet.id)

  let achievements = []

  if (cadetIds.length) {
    const { data, error } = await supabase
      .from('achievements')
      .select('id')
      .in('cadet_id', cadetIds)

    if (!error) achievements = data || []
  }

  const uniqueForms = new Set(
    cadets.map(cadet => `${cadet.intake}-${cadet.form}`).filter(Boolean)
  )

  setText('totalCadets', cadets.length)
  setText('totalAchievements', achievements.length)
  setText('totalForms', uniqueForms.size)
}

export function setupDashboardEvents({ onPageSwitch } = {}) {
  const sidebar = document.getElementById('sidebar')
  const sidebarToggle = document.getElementById('sidebarToggle')
  const sidebarOverlay = document.getElementById('sidebarOverlay')
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn')

  function closeSidebar() {
    sidebar?.classList.remove('open')
    sidebarOverlay?.classList.add('hidden')
  }

  sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.add('open')
    sidebarOverlay?.classList.remove('hidden')
  })

  sidebarOverlay?.addEventListener('click', closeSidebar)
  sidebarCloseBtn?.addEventListener('click', closeSidebar)

  document.querySelectorAll('.sidebar-link').forEach(button => {
    button.addEventListener('click', () => {
      const pageId = button.dataset.page
      if (!pageId) return

      document.querySelectorAll('.dashboard-page').forEach(page => {
        page.classList.add('hidden')
      })

      document.getElementById(pageId)?.classList.remove('hidden')

      // Hide profile section when switching tabs
      const profileSection = document.getElementById('profileSection')
      if (profileSection) {
        profileSection.classList.add('hidden')
      }

      document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active', 'bg-white/10')
      })

      button.classList.add('active', 'bg-white/10')

      const title = button.querySelector('span')?.textContent.trim() || button.textContent.trim()
      document.getElementById('currentPageTitle').textContent = title.toUpperCase()

      if (typeof onPageSwitch === 'function') {
        onPageSwitch(pageId)
      }

      closeSidebar()
    })
  })
}

async function getCollegeScopedCadets(staff) {
  // System admins see ALL cadets across colleges; others see only their college
  let query = supabase
    .from('cadets')
    .select('*')

  if (staff.role !== ROLES.SYSTEM_ADMIN) {
    query = query.eq('college', staff.college)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return []
  }

  // House Master: only own house cadets
  if (staff.role === ROLES.HOUSE_MASTER) {
    const houseKeyword = (staff.house || '').trim().replace(/\s+house$/i, '').toLowerCase()
    if (!houseKeyword) return []
    return (data || []).filter(c => {
      const ch = (c.house || '').toLowerCase()
      return ch.includes(houseKeyword) || houseKeyword.includes(ch.replace(/\s+house$/i, ''))
    })
  }

  if (staff.role !== ROLES.FORM_MASTER) {
    return data || []
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('form_master_assignments')
    .select('*')
    .eq('staff_user_id', staff.id)

  if (assignmentError) {
    console.error(assignmentError)
    return []
  }

  return (data || []).filter(cadet =>
    (assignments || []).some(assignment =>
      assignment.college === cadet.college &&
      assignment.intake === cadet.intake &&
      assignment.form === cadet.form
    )
  )
}

function getSubtitle(role) {
  if (role === ROLES.SYSTEM_ADMIN)    return 'System administrator with full cross-college access and management.'
  if (role === ROLES.ADMIN)           return 'College admin panel for cadet creation, staff registration, and form master assignment.'
  if (role === ROLES.FORM_MASTER)     return 'Manage achievements for your assigned form cadets.'
  if (role === ROLES.VICE_PRINCIPAL)  return 'View and monitor achievement records of your college.'
  if (role === ROLES.PRINCIPAL)       return 'Principal overview of cadet achievement records.'
  if (role === ROLES.HOUSE_MASTER)    return 'View and add remarks on achievement records of cadets in your house.'
  if (role === ROLES.ADJUTANT)        return 'View and add remarks on cadet achievement records across all intakes.'
  if (role === ROLES.MEDICAL_OFFICER) return 'View and add remarks on cadet achievement records across all intakes.'
  return 'Private institutional staff portal.'
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRole(role) {
  return role
    .split('_')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}