import { supabase } from './supabase'
import { getCurrentStaff } from './auth'
import { escapeHTML, formatHouse } from './ui'

let selectedPassedOutIntake = null

// ─── Load Passed Out Intakes (Stage 1) ────────────────────────────────────────

export async function loadPassedOutIntakes() {
  const container = document.getElementById('passedOutIntakeContainer')
  const headerCard = document.getElementById('passedOutHeaderCard')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  // Reset stages
  document.getElementById('passedOutIntakeStage')?.classList.remove('hidden')
  document.getElementById('passedOutCadetListStage')?.classList.add('hidden')

  container.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500">Loading passed out intakes...</div>`

  // Fetch all cadets where class_name is "Passed Out"
  const { data, error } = await supabase
    .from('cadets')
    .select('intake, college')
    .eq('college', staff.college)
    .eq('class_name', 'Passed Out')
    .order('intake', { ascending: false })

  if (error) {
    container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Failed to load passed out intakes.</div>`
    return
  }

  // Get unique intakes
  const intakes = [...new Set((data || []).map(c => c.intake).filter(Boolean))]

  if (!intakes.length) {
    // Hide the "Select Passed Out Intake" header when empty
    if (headerCard) headerCard.classList.add('hidden')
    container.className = '' // remove grid class for full-width empty state
    container.innerHTML = `
      <div class="empty-state glass compact-card py-16">
        <i class="fa-solid fa-graduation-cap"></i>
        <h3 class="text-lg font-bold text-slate-700">No Passed Out Cadets Yet</h3>
        <p class="text-slate-500 text-sm">Once cadets are promoted to "Passed Out", their intakes will appear here.</p>
      </div>
    `
    return
  }

  // Show header card and restore grid layout
  if (headerCard) headerCard.classList.remove('hidden')
  container.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'

  // Render passed out intake cards with beautiful design
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

  // Add click handlers
  document.querySelectorAll('.passed-out-intake-card').forEach(card => {
    card.addEventListener('click', () => {
      const intake = card.dataset.intake
      selectPassedOutIntake(intake)
    })
  })
}

// ─── Stage 2: Show Cadets and Achievements ────────────────────────────────────

async function selectPassedOutIntake(intake) {
  selectedPassedOutIntake = intake

  // Hide stage 1, show stage 2
  document.getElementById('passedOutIntakeStage')?.classList.add('hidden')
  document.getElementById('passedOutCadetListStage')?.classList.remove('hidden')

  // Update display
  document.getElementById('selectedPassedOutIntakeDisplay').textContent = getOrdinal(intake)

  // Load cadets and achievements
  await loadPassedOutCadetsWithAchievements(intake)
}

async function loadPassedOutCadetsWithAchievements(intake) {
  const container = document.getElementById('passedOutCadetsContainer')
  const staff = getCurrentStaff()

  if (!container || !staff) return

  container.innerHTML = `<div class="text-center py-10 text-slate-500">Loading alumni records...</div>`

  // Fetch cadets for this passed out intake
  const { data: cadets, error: cadetsError } = await supabase
    .from('cadets')
    .select('*')
    .eq('college', staff.college)
    .eq('class_name', 'Passed Out')
    .eq('intake', intake)
    .order('cadet_no', { ascending: true })

  if (cadetsError) {
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
    return
  }

  const cadetIds = cadets.map(c => c.id)

  // Fetch all achievements for these cadets
  const { data: achievements, error: achError } = await supabase
    .from('achievements')
    .select('*')
    .in('cadet_id', cadetIds)
    .order('created_at', { ascending: false })

  if (achError) {
    console.error('Failed to load achievements:', achError)
  }

  const allAchievements = achievements || []

  // Update stats
  document.getElementById('passedOutCadetCount').textContent = cadets.length
  document.getElementById('passedOutAchievementCount').textContent = allAchievements.length

  // Group achievements by cadet
  const achievementsByCadet = {}
  allAchievements.forEach(ach => {
    if (!achievementsByCadet[ach.cadet_id]) {
      achievementsByCadet[ach.cadet_id] = []
    }
    achievementsByCadet[ach.cadet_id].push(ach)
  })

  // Render alumni cards with achievements
  container.innerHTML = `
    <div class="alumni-grid">
      ${cadets.map(cadet => renderAlumniCard(cadet, achievementsByCadet[cadet.id] || [])).join('')}
    </div>
  `
}

function renderAlumniCard(cadet, achievements) {
  const photoUrl = cadet.photo_url
  const achievementCount = achievements.length

  return `
    <div class="alumni-card">
      <div class="alumni-card-header">
        <div class="alumni-photo">
          ${photoUrl 
            ? `<img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(cadet.name)}">` 
            : `<div class="alumni-photo-placeholder"><i class="fa-solid fa-user-graduate"></i></div>`}
        </div>
        <div class="alumni-info">
          <h4 class="alumni-name">${escapeHTML(cadet.name || 'Unknown')}</h4>
          <div class="alumni-meta">
            <span class="alumni-cadet-no">
              <i class="fa-solid fa-id-badge"></i> ${escapeHTML(cadet.cadet_no || 'N/A')}
            </span>
            <span class="alumni-house">
              <i class="fa-solid fa-shield"></i> ${formatHouse(cadet.house)}
            </span>
          </div>
        </div>
        <div class="alumni-achievement-badge">
          <i class="fa-solid fa-trophy"></i>
          <span>${achievementCount}</span>
        </div>
      </div>

      <div class="alumni-achievements">
        ${achievementCount === 0 
          ? `<div class="alumni-no-achievements">
              <i class="fa-solid fa-circle-info"></i>
              <span>No achievement records</span>
            </div>`
          : `
            <div class="alumni-achievements-title">
              <i class="fa-solid fa-medal"></i> Achievements & Honours
            </div>
            <div class="alumni-achievements-list">
              ${achievements.map(ach => `
                <div class="alumni-achievement-item">
                  <div class="alumni-achievement-icon">
                    <i class="fa-solid fa-trophy"></i>
                  </div>
                  <div class="alumni-achievement-content">
                    <div class="alumni-achievement-title">${escapeHTML(ach.title || 'Untitled')}</div>
                    <div class="alumni-achievement-meta">
                      ${ach.category ? `<span class="alumni-achievement-tag">${escapeHTML(ach.category)}</span>` : ''}
                      ${ach.year ? `<span class="alumni-achievement-year"><i class="fa-solid fa-calendar"></i> ${escapeHTML(ach.year)}</span>` : ''}
                      ${ach.position ? `<span class="alumni-achievement-position"><i class="fa-solid fa-ranking-star"></i> ${escapeHTML(ach.position)}</span>` : ''}
                    </div>
                    ${ach.description ? `<div class="alumni-achievement-desc">${escapeHTML(ach.description)}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `
        }
      </div>
    </div>
  `
}

// ─── Navigation Setup ─────────────────────────────────────────────────────────

export function setupPassedOutNavigation() {
  document.getElementById('backToPassedOutIntakesBtn')?.addEventListener('click', () => {
    document.getElementById('passedOutCadetListStage')?.classList.add('hidden')
    document.getElementById('passedOutIntakeStage')?.classList.remove('hidden')
    selectedPassedOutIntake = null
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
