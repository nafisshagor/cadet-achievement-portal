import { supabase, ROLES, COLLEGES, COLLEGE_LOGOS, COLLEGE_LOGO_SQUARE } from './supabase'
import { getCurrentStaff } from './auth'
import { escapeHTML } from './ui'

let selectedPassedOutCollege = null
let selectedPassedOutIntake = null

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function loadPassedOutIntakes() {
  const staff = getCurrentStaff()
  if (!staff) return

  selectedPassedOutIntake = null

  // Reset all stages
  ensureCollegeStage()   // ensure the dynamic stage exists before we try to show/hide it
  showStage('passedOutCollegeStage')

  if (staff.role === ROLES.SYSTEM_ADMIN) {
    // System admin: show college selection first
    selectedPassedOutCollege = null
    renderCollegeSelection()
  } else {
    // Everyone else: go straight to intakes for their own college
    selectedPassedOutCollege = staff.college
    await renderIntakeSelection()
  }
}

// ─── Stage 0: College Selection (System Admin only) ──────────────────────────

function renderCollegeSelection() {
  ensureCollegeStage()
  showStage('passedOutCollegeStage')

  const container = document.getElementById('passedOutCollegeCardsContainer')
  if (!container) return

  container.innerHTML = COLLEGES.map(college => {
    const logo = COLLEGE_LOGOS[college]
    const isSquare = COLLEGE_LOGO_SQUARE.has(college)
    const shortName = college.replace(' Cadet College', '')
    return `
      <button class="passed-out-college-card intake-card" data-college="${escapeHTML(college)}">
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

  container.querySelectorAll('.passed-out-college-card').forEach(card => {
    card.addEventListener('click', async () => {
      selectedPassedOutCollege = card.dataset.college
      await renderIntakeSelection()
    })
  })
}

function ensureCollegeStage() {
  if (document.getElementById('passedOutCollegeStage')) return

  const page = document.getElementById('passedOutCadetsPage')
  const heroEl = page?.querySelector('.page-hero.alumni-hero')
  const intakeStage = document.getElementById('passedOutIntakeStage')

  const stage0 = document.createElement('div')
  stage0.id = 'passedOutCollegeStage'
  stage0.className = 'hidden'
  stage0.innerHTML = `
    <div class="glass compact-card mb-5">
      <div class="flex items-center gap-3">
        <div class="page-icon blue"><i class="fa-solid fa-building-columns"></i></div>
        <div>
          <h3 class="compact-section-title text-slate-800">Select College</h3>
          <p class="text-slate-500 text-sm">Choose a cadet college to view its passed out cadets.</p>
        </div>
      </div>
    </div>
    <div id="passedOutCollegeCardsContainer" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"></div>
  `

  if (intakeStage) {
    page.insertBefore(stage0, intakeStage)
  } else {
    page.appendChild(stage0)
  }
}

// ─── Stage 1: Intake Selection ────────────────────────────────────────────────

async function renderIntakeSelection() {
  const staff = getCurrentStaff()
  if (!staff) return

  ensureCollegeStage()
  showStage('passedOutIntakeStage')

  // Update header banner
  updatePassedOutIntakeBanner(selectedPassedOutCollege, staff)

  const container = document.getElementById('passedOutIntakeContainer')
  const headerCard = document.getElementById('passedOutHeaderCard')
  if (!container) return

  container.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Loading passed out intakes...</div>`

  const { data, error } = await supabase
    .from('cadets')
    .select('intake')
    .eq('college', selectedPassedOutCollege)
    .eq('class_name', 'Passed Out')
    .order('intake', { ascending: false })

  if (error) {
    container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Failed to load passed out intakes.</div>`
    return
  }

  const intakes = [...new Set((data || []).map(c => c.intake).filter(Boolean))]

  if (!intakes.length) {
    if (headerCard) headerCard.classList.add('hidden')
    container.className = ''
    container.innerHTML = `
      <div class="empty-state glass compact-card py-16">
        <i class="fa-solid fa-graduation-cap"></i>
        <h3 class="text-lg font-bold text-slate-700">No Passed Out Cadets Yet</h3>
        <p class="text-slate-500 text-sm">Once cadets are promoted to "Passed Out", their intakes will appear here.</p>
      </div>
    `
    return
  }

  if (headerCard) headerCard.classList.remove('hidden')
  container.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'

  container.innerHTML = intakes.map(intake => {
    const ordinal = getOrdinal(intake)
    return `
      <button class="passed-out-intake-card" data-intake="${escapeHTML(intake)}">
        <div class="passed-out-card-shine"></div>
        <div class="passed-out-card-icon">
          <i class="fa-solid fa-graduation-cap"></i>
        </div>
        <div class="passed-out-card-label">Alumni Intake</div>
        <div class="passed-out-card-value">${escapeHTML(ordinal)}</div>
        <div class="passed-out-card-badge">
          <i class="fa-solid fa-medal"></i> Graduated
        </div>
      </button>
    `
  }).join('')

  document.querySelectorAll('.passed-out-intake-card').forEach(card => {
    card.addEventListener('click', () => {
      const intake = card.dataset.intake
      selectPassedOutIntake(intake)
    })
  })
}

function updatePassedOutIntakeBanner(college, staff) {
  const stage = document.getElementById('passedOutIntakeStage')
  if (!stage) return

  let banner = document.getElementById('passedOutCollegeBanner')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'passedOutCollegeBanner'
    banner.className = 'glass compact-card mb-5'
    // Insert before the first child (the header card)
    stage.insertBefore(banner, stage.firstChild)
  }

  const logo = COLLEGE_LOGOS[college]
  const isSquare = COLLEGE_LOGO_SQUARE.has(college)
  const isSystemAdmin = staff.role === ROLES.SYSTEM_ADMIN

  banner.innerHTML = `
    <div class="flex items-center gap-4 flex-wrap">
      ${isSystemAdmin ? `
        <button id="backToPassedOutCollegesBtn" class="portal-btn-ghost px-4 py-2 text-sm flex-shrink-0">
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
          <p class="text-slate-500 text-sm">Passed out cadets by intake.</p>
        </div>
      </div>
    </div>
  `

  if (isSystemAdmin) {
    document.getElementById('backToPassedOutCollegesBtn')?.addEventListener('click', () => {
      selectedPassedOutCollege = null
      showStage('passedOutCollegeStage')
      renderCollegeSelection()
    })
  }
}

// ─── Stage 2: Cadet List (names & cadet numbers only) ────────────────────────

async function selectPassedOutIntake(intake) {
  selectedPassedOutIntake = intake
  showStage('passedOutCadetListStage')

  document.getElementById('selectedPassedOutIntakeDisplay').textContent = getOrdinal(intake)

  await loadPassedOutCadetList(intake)
}

async function loadPassedOutCadetList(intake) {
  const container = document.getElementById('passedOutCadetsContainer')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  container.innerHTML = `<div class="text-center py-10 text-slate-500">Loading alumni records...</div>`

  const { data: cadets, error } = await supabase
    .from('cadets')
    .select('id, name, cadet_no')
    .eq('college', selectedPassedOutCollege)
    .eq('class_name', 'Passed Out')
    .eq('intake', intake)
    .order('cadet_no', { ascending: true })

  if (error) {
    container.innerHTML = `<div class="text-center py-10 text-red-500">Failed to load alumni records.</div>`
    return
  }

  if (!cadets || !cadets.length) {
    container.innerHTML = `
      <div class="empty-state py-16">
        <i class="fa-solid fa-users-slash"></i>
        <h3 class="text-lg font-bold text-slate-700">No Alumni Records</h3>
        <p class="text-slate-500 text-sm">No passed out cadets in this intake.</p>
      </div>
    `
    // Hide stat pills
    document.getElementById('passedOutCadetCount').textContent = 0
    document.getElementById('passedOutAchievementCount').textContent = 0
    return
  }

  // Update count pill — hide achievement count (no longer shown)
  document.getElementById('passedOutCadetCount').textContent = cadets.length
  const achPill = document.querySelector('.passed-out-stat-pill.achievements')
  if (achPill) achPill.classList.add('hidden')

  // Render simple name + cadet number list
  container.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table w-full text-sm">
        <thead>
          <tr>
            <th style="width:60px;">#</th>
            <th style="width:130px;">Cadet No</th>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          ${cadets.map((cadet, idx) => `
            <tr>
              <td class="text-slate-400 font-mono text-xs">${idx + 1}</td>
              <td class="font-mono font-bold">${escapeHTML(cadet.cadet_no || '—')}</td>
              <td class="font-semibold">${escapeHTML(cadet.name || 'Unknown')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

// ─── Navigation Setup ─────────────────────────────────────────────────────────

export function setupPassedOutNavigation() {
  document.getElementById('backToPassedOutIntakesBtn')?.addEventListener('click', () => {
    selectedPassedOutIntake = null
    // Show achievement pill again in case it was hidden
    const achPill = document.querySelector('.passed-out-stat-pill.achievements')
    if (achPill) achPill.classList.remove('hidden')

    showStage('passedOutIntakeStage')
  })
}

// ─── Stage Switcher ───────────────────────────────────────────────────────────

function showStage(activeStageId) {
  const stages = [
    'passedOutCollegeStage',
    'passedOutIntakeStage',
    'passedOutCadetListStage'
  ]
  stages.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    if (id === activeStageId) {
      el.classList.remove('hidden')
    } else {
      el.classList.add('hidden')
    }
  })
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
