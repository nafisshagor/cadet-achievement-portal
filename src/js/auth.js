import { supabase } from './supabase'
import { loadCadets } from './cadets'
import { loadDashboardStats, renderDashboardForRole } from './dashboard'
import { hide, show, setButtonLoading, showToast } from './ui'

let currentStaff = null

export function getCurrentStaff() {
  return currentStaff
}

// Password toggle functionality
export function initPasswordToggle() {
  const toggleBtn = document.getElementById('togglePassword')
  const passwordInput = document.getElementById('password')
  
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password'
      passwordInput.type = type
      
      const icon = toggleBtn.querySelector('i')
      if (icon) {
        icon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'
      }
    })
  }
}

export async function login() {
  const facultyID = document.getElementById('email')?.value.trim()
  const password = document.getElementById('password')?.value

  if (!facultyID || !password) {
    shakeLoginForm()
    showToast('Please enter your Faculty ID and password.', 'warning')
    return
  }

  setButtonLoading('loginBtn', true, 'Signing in...')

  const virtualEmail = facultyID.includes('@')
    ? facultyID.toLowerCase()
    : `${facultyID.toLowerCase()}@asys.local`

  const { error } = await supabase.auth.signInWithPassword({
    email: virtualEmail,
    password
  })

  setButtonLoading('loginBtn', false)

  if (error) {
    // Wrong credentials: shake the form + clear password, no time-consuming animation
    shakeLoginForm()
    const friendly = /invalid login credentials/i.test(error.message)
      ? 'Incorrect Faculty ID or password. Please try again.'
      : error.message
    showToast(friendly, 'error')
    const passwordInput = document.getElementById('password')
    if (passwordInput) {
      passwordInput.value = ''
      passwordInput.focus()
    }
    return
  }

  // Show login animation
  showLoginOverlay()

  // Wait for the animation to play before showing the portal (snappy)
  await new Promise(resolve => setTimeout(resolve, 900))

  await showStaffPortal()

  // Hide the login overlay
  hideLoginOverlay()
}

// Shake the login form box to signal an error
function shakeLoginForm() {
  const box = document.querySelector('.login-form-box')
  if (!box) return
  box.classList.remove('login-shake')
  // Force reflow so the animation can replay
  void box.offsetWidth
  box.classList.add('login-shake')
  setTimeout(() => box.classList.remove('login-shake'), 500)
}

export async function logout() {
  // Show logout animation overlay
  showLogoutOverlay()

  // Wait briefly so the animation is visible before signing out
  await new Promise(resolve => setTimeout(resolve, 1200))

  await supabase.auth.signOut()

  currentStaff = null

  hide('dashboardSection')
  hide('profileSection')
  show('loginSection')

  document.body.classList.add('login-mode')
  document.body.classList.remove('min-h-screen')

  // Clear login form so next user starts fresh
  const emailInput = document.getElementById('email')
  const passwordInput = document.getElementById('password')
  if (emailInput) emailInput.value = ''
  if (passwordInput) passwordInput.value = ''

  // Hide the logout overlay
  hideLogoutOverlay()

  showToast('Logged out successfully.', 'info')
}

// ─── Logout Animation ────────────────────────────────────────────────────────

function showLogoutOverlay() {
  // Avoid duplicates
  if (document.getElementById('logoutOverlay')) return

  const overlay = document.createElement('div')
  overlay.id = 'logoutOverlay'
  overlay.className = 'logout-overlay'
  overlay.innerHTML = `
    <div class="logout-overlay-content">
      <div class="logout-icon-wrap">
        <div class="logout-icon-ring"></div>
        <div class="logout-icon-ring delay"></div>
        <div class="logout-icon-circle">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
        </div>
      </div>
      <h3 class="logout-title">Signing Out</h3>
      <p class="logout-subtitle">Securing your session...</p>
      <div class="logout-progress-bar">
        <div class="logout-progress-fill"></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  // Trigger fade-in
  requestAnimationFrame(() => {
    overlay.classList.add('show')
  })
}

function hideLogoutOverlay() {
  const overlay = document.getElementById('logoutOverlay')
  if (!overlay) return

  overlay.classList.remove('show')
  overlay.classList.add('hide')

  setTimeout(() => {
    overlay.remove()
  }, 400)
}

// ─── Login Animation ─────────────────────────────────────────────────────────

function showLoginOverlay() {
  if (document.getElementById('loginOverlay')) return

  const overlay = document.createElement('div')
  overlay.id = 'loginOverlay'
  overlay.className = 'login-overlay'
  overlay.innerHTML = `
    <div class="login-overlay-content">
      <div class="login-icon-wrap">
        <div class="login-icon-ring"></div>
        <div class="login-icon-ring delay"></div>
        <div class="login-icon-circle">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <div class="login-checkmark">
          <i class="fa-solid fa-check"></i>
        </div>
      </div>
      <h3 class="login-ovl-title">Welcome Back</h3>
      <p class="login-ovl-subtitle">Authenticating your access...</p>
      <div class="login-progress-bar">
        <div class="login-progress-fill"></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  requestAnimationFrame(() => {
    overlay.classList.add('show')
  })
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay')
  if (!overlay) return

  overlay.classList.remove('show')
  overlay.classList.add('hide')

  setTimeout(() => {
    overlay.remove()
  }, 400)
}

export async function checkSession() {
  const { data } = await supabase.auth.getSession()

  if (data.session) {
    await showStaffPortal()
  } else {
    show('loginSection')
    hide('dashboardSection')
    hide('profileSection')
    document.body.classList.add('login-mode')
  }
}

async function showStaffPortal() {
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    showToast('Unable to verify user session.', 'error')
    return
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    showToast('No staff profile found for this login. Contact the admin.', 'error')
    await supabase.auth.signOut()
    return
  }

  currentStaff = profile

  hide('loginSection')
  show('dashboardSection')
  hide('profileSection')

  document.body.classList.remove('login-mode')
  document.body.classList.add('min-h-screen')

  // Always navigate to Dashboard (Overview) page on login
  navigateToDashboardPage()

  renderDashboardForRole(profile)

  await loadDashboardStats()
  await loadCadets()
}

// Reset navigation to the Dashboard (Overview) page
function navigateToDashboardPage() {
  // Hide all dashboard pages
  document.querySelectorAll('.dashboard-page').forEach(page => {
    page.classList.add('hidden')
  })

  // Show the overview/dashboard page
  document.getElementById('overviewPage')?.classList.remove('hidden')

  // Reset sidebar active state
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active', 'bg-white/10')
  })
  document.querySelector('.sidebar-link[data-page="overviewPage"]')?.classList.add('active')

  // Reset breadcrumb
  const titleEl = document.getElementById('currentPageTitle')
  if (titleEl) titleEl.textContent = 'DASHBOARD'

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' })
}