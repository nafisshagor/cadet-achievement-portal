import { supabase, ROLES } from './supabase'
import { getCurrentStaff } from './auth'
import { showToast, openModal, closeModal, setButtonLoading, escapeHTML } from './ui'

let activeCadetId = null
let editingAchievementId = null
// Cadet's current Roman class — preserved so category-change always has the right class
let activeCadetClass = 'IX'
// Number of cadets in the cadet's own intake (for Position field max hint)
let intakeCadetCount = 0

// ─── Type Labels ──────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  'Inter-house': 'Inter House',
  'Inter-college': 'Inter Cadet College',
  'National': 'National',
  'International': 'International',
  'Academics': 'Academics'
}

const TYPE_SECTION_LABELS = {
  'Inter-house': 'Inter House Competitions',
  'Inter-college': 'Inter Cadet College Competitions',
  'National': 'National Competitions',
  'International': 'International Competitions',
  'Academics': 'Academic Results'
}

const CLASS_TO_GRADE = {
  'VII':  '7th Grade',
  'VIII': '8th Grade',
  'IX':   '9th Grade',
  'X':    '10th Grade',
  'XI':   '11th Grade',
  'XII':  '12th Grade'
}

// 7,8,9,11 → 'terms' | 10 → 'grade10' | 12 → 'grade12' | SSC/HSC → 'board'
function getAcademicLayout(gradeNum) {
  if ([7, 8, 9, 11].includes(gradeNum)) return 'terms'
  if (gradeNum === 10) return 'grade10'
  if (gradeNum === 12) return 'grade12'
  return 'terms'
}

// ─── Inter House competition data ─────────────────────────────────────────────

const IH_CO_CURRICULAR = [
  'Bangla Poetry', 'English Poetry', 'Bangla Debate', 'English Debate',
  'English Extempore', 'Bangla Extempore', 'Music', 'Azan', 'Qirat', 'Quiz',
  'Painting', 'Essay', 'Current Affairs Display', 'Bangla Stage Drama'
]

// Sports with their special honour options (checkboxes)
// honourOptions: always shown as checkboxes at the top of the sport's form
const IH_SPORTS = [
  {
    name: 'Athletics',
    // Athletics uses groups (Throwing / Jumping / Running / Best Athlete)
    groups: [
      {
        label:  'Running',
        events: ['100m Sprint','200m Sprint','400m Sprint','800m Run','1500m Run','3000m Run','100m Relay','400m Relay']
      },
      {
        label:  'Throwing',
        events: ['Shotput','Javelin','Hammer Throw','Discus Throw']
      },
      {
        label:  'Jumping',
        events: ['Hop Step','Long Jump','High Jump','Pole Vault']
      },
      {
        label:  'Best Athlete',
        events: []    // no event dropdown — only Description + Save
      }
    ]
  },
  {
    name:   'Football',
    honourOptions: ['Best Player', 'Best Goalkeeper']
  },
  {
    name:   'Cricket',
    honourOptions: ['Best Player']
  },
  {
    name:   'Volleyball',
    honourOptions: ['Best Player']
  },
  {
    name:   'Basketball',
    honourOptions: ['Best Player']
  },
  {
    name:   'Indoor Games',
    events: ['Chess', 'Carrom', 'Table Tennis', 'Squash'],
    honourOptions: ['Best Player']
  },
  {
    name:   'Swimming',
    events: ['Freestyle','Backstroke','Relay','Breast Stroke','Butterfly'],
    honourOptions: ['Best Player', 'Best Swimmer']
  },
  {
    name:   'Obstacle',
    honourOptions: []
  },
  {
    name:   'Cross Country',
    honourOptions: []
  }
]

// Lookup helper: find a sport config by name
function getSport(name) {
  return IH_SPORTS.find(s => s.name === name) || null
}

function getIHCompetitions(activityType) {
  if (activityType === 'Co-Curricular') {
    return [
      ...IH_CO_CURRICULAR.map(c => ({ value: c, label: c })),
      { value: '__other__', label: '— Other —' }
    ]
  }
  // Extra-Curricular: return sport names + Other
  return [
    ...IH_SPORTS.map(s => ({ value: s.name, label: s.name })),
    { value: '__other__', label: '— Other —' }
  ]
}

// ─── Competition title format ─────────────────────────────────────────────────

function formatCompetitionName(type, name, year) {
  const typeLabel = TYPE_LABELS[type] || type
  const yearStr = year ? ` ${year}` : ''
  return `${typeLabel} ${name}${yearStr}`.trim()
}

function autoAppendPosition(value) {
  if (!value) return value
  const trimmed = value.trim()
  if (/^(\d+)(st|nd|rd|th)$/i.test(trimmed)) return `${trimmed} Position`
  return trimmed
}

// ─── Open / Close Form ────────────────────────────────────────────────────────

export async function openAchievementForm(cadetId) {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only assigned form masters can add achievements.', 'error')
    return
  }

  activeCadetId = cadetId
  editingAchievementId = null

  // Fetch cadet info — store class module-level so category-change handler can use it
  const { data: cadet } = await supabase
    .from('cadets')
    .select('class_name, intake, college')
    .eq('id', cadetId)
    .single()

  activeCadetClass = cadet?.class_name || 'IX'
  await fetchIntakeCadetCount(cadet?.college, cadet?.intake)

  // Start in competition mode, Inter-house selected
  populateYearGradeDropdown(activeCadetClass, false)

  document.getElementById('achievementModalTitle').textContent = 'Add Achievement'
  document.getElementById('achievementCategory').value = 'Inter-house'
  resetCompetitionFields()
  resetAcademicsFields()

  // Pre-select the current year if it exists in the dropdown
  const currentYear = new Date().getFullYear()
  const yearSelect = document.getElementById('achievementYear')
  if (yearSelect) {
    const match = Array.from(yearSelect.options).find(o => o.value === String(currentYear))
    if (match) yearSelect.value = String(currentYear)
  }

  switchModalMode('competition')
  updateInterHouseVisibility(true)  // Inter-house is the default selected type
  setupModalListeners()
  updatePreview()

  openModal('achievementModal')
}

async function fetchIntakeCadetCount(college, intake) {
  intakeCadetCount = 0
  if (!college || !intake) return
  const { count } = await supabase
    .from('cadets')
    .select('id', { count: 'exact', head: true })
    .eq('college', college)
    .eq('intake', intake)
  intakeCadetCount = count || 0
}

export function closeAchievementForm() {
  activeCadetId = null
  editingAchievementId = null
  closeModal('achievementModal')
}

// ─── Modal mode switching ─────────────────────────────────────────────────────

function switchModalMode(mode) {
  const competitionFields = document.getElementById('competitionFields')
  const academicsFields   = document.getElementById('academicsFields')

  if (mode === 'academics') {
    competitionFields?.classList.add('hidden')
    academicsFields?.classList.remove('hidden')
  } else {
    competitionFields?.classList.remove('hidden')
    academicsFields?.classList.add('hidden')
  }
}

function showAcademicSubLayout(layout, boardTitle = '') {
  ;['acad-terms', 'acad-grade10', 'acad-grade12', 'acad-board'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  )

  const layoutMap = {
    terms:   'acad-terms',
    grade10: 'acad-grade10',
    grade12: 'acad-grade12',
    board:   'acad-board'
  }
  const targetId = layoutMap[layout]
  if (!targetId) return

  document.getElementById(targetId)?.classList.remove('hidden')

  if (layout === 'board' && boardTitle) {
    const titleEl = document.getElementById('acad-board-title')
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHTML(boardTitle)}`
  }

  // Show intake-count hint on position inputs
  if (intakeCadetCount > 0) {
    document.querySelectorAll('#academicsFields input[type="number"]').forEach(input => {
      input.placeholder = `e.g. 3 (out of ${intakeCadetCount})`
      input.max = intakeCadetCount
    })
  }
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function setupModalListeners() {
  const categorySelect = document.getElementById('achievementCategory')
  const yearSelect     = document.getElementById('achievementYear')

  if (categorySelect && !categorySelect.dataset.achListenerBound) {
    categorySelect.addEventListener('change', onCategoryChange)
    categorySelect.dataset.achListenerBound = 'true'
  }

  if (yearSelect && !yearSelect.dataset.achListenerBound) {
    yearSelect.addEventListener('change', onYearChange)
    yearSelect.dataset.achListenerBound = 'true'
  }

  // Inter House: activity type → competition list
  const ihActivity = document.getElementById('ihActivityType')
  if (ihActivity && !ihActivity.dataset.achListenerBound) {
    ihActivity.addEventListener('change', onIHActivityChange)
    ihActivity.dataset.achListenerBound = 'true'
  }

  // Inter House: competition (sport) → group/event/honour layer
  const ihComp = document.getElementById('ihCompetition')
  if (ihComp && !ihComp.dataset.achListenerBound) {
    ihComp.addEventListener('change', onIHCompetitionChange)
    ihComp.dataset.achListenerBound = 'true'
  }

  // Inter House: athletics group → event list
  const ihGroup = document.getElementById('ihAthlGroup')
  if (ihGroup && !ihGroup.dataset.achListenerBound) {
    ihGroup.addEventListener('change', onIHGroupChange)
    ihGroup.dataset.achListenerBound = 'true'
  }

  // Inter House: other name → preview update
  const ihOtherName = document.getElementById('ihOtherName')
  if (ihOtherName && !ihOtherName.dataset.achListenerBound) {
    ihOtherName.addEventListener('input', updatePreview)
    ihOtherName.dataset.achListenerBound = 'true'
  }

  // Preview updates for competition mode
  ;['achievementTitle', 'achievementCategory', 'achievementYear'].forEach(id => {
    const el = document.getElementById(id)
    if (el && !el.dataset.listenerAttached) {
      el.addEventListener('input', updatePreview)
      el.addEventListener('change', updatePreview)
      el.dataset.listenerAttached = 'true'
    }
  })
}

function onCategoryChange() {
  const category = document.getElementById('achievementCategory')?.value

  if (category === 'Academics') {
    populateYearGradeDropdown(activeCadetClass, true)
    switchModalMode('academics')
    onYearChange()
  } else if (category === 'Other') {
    populateYearGradeDropdown(activeCadetClass, false)
    switchModalMode('competition')
    // Hide IH fields and standard name/event wraps; show only Other name + position/remarks/description
    updateInterHouseVisibility(false)
    document.getElementById('competitionNameWrap')?.classList.add('hidden')
    document.getElementById('competitionEventWrap')?.classList.add('hidden')
    document.getElementById('otherCompNameWrap')?.classList.remove('hidden')
    updatePreview()
  } else {
    populateYearGradeDropdown(activeCadetClass, false)
    switchModalMode('competition')
    document.getElementById('otherCompNameWrap')?.classList.add('hidden')
    updateInterHouseVisibility(category === 'Inter-house')
    updatePreview()
  }
}

function updateInterHouseVisibility(isInterHouse) {
  const ihFields         = document.getElementById('interHouseFields')
  const nameWrap         = document.getElementById('competitionNameWrap')
  const eventWrap        = document.getElementById('competitionEventWrap')

  if (isInterHouse) {
    ihFields?.classList.remove('hidden')
    nameWrap?.classList.add('hidden')
    eventWrap?.classList.add('hidden')
  } else {
    ihFields?.classList.add('hidden')
    nameWrap?.classList.remove('hidden')
    eventWrap?.classList.remove('hidden')
  }
}

function onIHActivityChange() {
  const activityType = document.getElementById('ihActivityType')?.value
  const compWrap     = document.getElementById('ihCompetitionWrap')
  const compSelect   = document.getElementById('ihCompetition')

  // Reset everything below activity
  resetIHBelow('activity')

  if (!activityType) {
    compWrap?.classList.add('hidden')
    return
  }

  compWrap?.classList.remove('hidden')

  const competitions = getIHCompetitions(activityType)
  compSelect.innerHTML = '<option value="">— Select Competition —</option>' +
    competitions.map(c => `<option value="${escapeHTML(c.value)}">${escapeHTML(c.label)}</option>`).join('')

  updatePreview()
}

function onIHCompetitionChange() {
  const activityType = document.getElementById('ihActivityType')?.value
  const compValue    = document.getElementById('ihCompetition')?.value

  // Reset everything below competition
  resetIHBelow('competition')

  if (!compValue) { updatePreview(); return }

  // ── "Other" selected — free text name + Position + Description only ──────
  if (compValue === '__other__') {
    document.getElementById('ihOtherNameWrap')?.classList.remove('hidden')
    showIHCompetitionFields(true)
    updatePreview()
    return
  }

  if (activityType === 'Extra-Curricular') {
    const sport = getSport(compValue)
    if (!sport) { updatePreview(); return }

    if (sport.groups) {
      // Athletics — show the group dropdown (Running / Throwing / Jumping / Best Athlete)
      const groupWrap   = document.getElementById('ihAthlGroupWrap')
      const groupSelect = document.getElementById('ihAthlGroup')
      if (groupWrap && groupSelect) {
        groupSelect.innerHTML = '<option value="">— Select Category —</option>' +
          sport.groups.map(g => `<option value="${escapeHTML(g.label)}">${escapeHTML(g.label)}</option>`).join('')
        groupWrap.classList.remove('hidden')
      }
    } else {
      if (sport.events?.length) {
        const subWrap   = document.getElementById('ihSubEventWrap')
        const subSelect = document.getElementById('ihSubEvent')
        if (subWrap && subSelect) {
          subSelect.innerHTML = '<option value="">— Select Event —</option>' +
            sport.events.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('')
          subWrap.classList.remove('hidden')
        }
      }
      renderHonourCheckboxes(sport)
      showIHCompetitionFields(true)
    }
  } else {
    // Co-Curricular (non-Other) — just position + description
    showIHCompetitionFields(true)
  }

  updatePreview()
}

function onIHGroupChange() {
  const compValue  = document.getElementById('ihCompetition')?.value  // "Athletics"
  const groupValue = document.getElementById('ihAthlGroup')?.value

  // Reset below group level
  resetIHBelow('group')

  if (!groupValue) { updatePreview(); return }

  const sport = getSport(compValue)
  if (!sport?.groups) { updatePreview(); return }

  const group = sport.groups.find(g => g.label === groupValue)
  if (!group) { updatePreview(); return }

  if (groupValue === 'Best Athlete') {
    // Best Athlete: hide standard fields, show only description + checkboxes area
    showIHCompetitionFields(false)
    renderHonourCheckboxes({ name: 'Athletics', honourOptions: ['Best Athlete'] }, true)
  } else {
    // Show event dropdown for this group
    if (group.events.length) {
      const subWrap   = document.getElementById('ihSubEventWrap')
      const subSelect = document.getElementById('ihSubEvent')
      if (subWrap && subSelect) {
        subSelect.innerHTML = '<option value="">— Select Event —</option>' +
          group.events.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('')
        subWrap.classList.remove('hidden')
      }
    }
    showIHCompetitionFields(true)
  }

  updatePreview()
}

/**
 * Show/hide the standard competition result fields (Position, Extra, Remarks, Description).
 * In "best award only" mode (showFields = false) only Description + Save is shown.
 */
function showIHCompetitionFields(showFields) {
  const posWrap  = document.getElementById('ihPositionWrap')
  const extraWrap= document.getElementById('ihExtraWrap')
  const remWrap  = document.getElementById('ihRemarksWrap')
  const descWrap = document.getElementById('ihDescriptionWrap')

  if (showFields) {
    posWrap?.classList.remove('hidden')
    extraWrap?.classList.remove('hidden')
    remWrap?.classList.remove('hidden')
  } else {
    posWrap?.classList.add('hidden')
    extraWrap?.classList.add('hidden')
    remWrap?.classList.add('hidden')
  }
  // Description is always visible
  descWrap?.classList.remove('hidden')
}

/**
 * Render honour checkboxes (Best Player, Best Goalkeeper, Best Swimmer, Best Athlete).
 * @param {object} sport  - sport config with honourOptions array
 * @param {boolean} forceChecked - pre-check when editing
 */
function renderHonourCheckboxes(sport, forceChecked = false) {
  const wrap = document.getElementById('ihHonourWrap')
  if (!wrap) return

  const options = sport.honourOptions || []
  if (!options.length) {
    wrap.classList.add('hidden')
    return
  }

  wrap.classList.remove('hidden')
  wrap.querySelector('.ih-honour-checks').innerHTML = options.map(opt => `
    <label class="ih-honour-label">
      <input type="checkbox" class="ih-honour-checkbox" value="${escapeHTML(opt)}" ${forceChecked ? 'checked' : ''}>
      <span>${escapeHTML(opt)}</span>
    </label>
  `).join('')
}

/**
 * Reset IH form fields below a given level.
 *   'activity'    → clears competition, group, events, honours, fields
 *   'competition' → clears group, events, honours, fields
 *   'group'       → clears events, honours
 */
function resetIHBelow(level) {
  if (level === 'activity') {
    const compSel = document.getElementById('ihCompetition')
    if (compSel) compSel.value = ''
    document.getElementById('ihCompetitionWrap')?.classList.add('hidden')
  }
  if (level === 'activity' || level === 'competition') {
    // group
    const grpSel = document.getElementById('ihAthlGroup')
    if (grpSel) grpSel.value = ''
    document.getElementById('ihAthlGroupWrap')?.classList.add('hidden')
    // other name
    const otherName = document.getElementById('ihOtherName')
    if (otherName) otherName.value = ''
    document.getElementById('ihOtherNameWrap')?.classList.add('hidden')
    // reset honours
    const honourWrap = document.getElementById('ihHonourWrap')
    if (honourWrap) {
      honourWrap.classList.add('hidden')
      honourWrap.querySelector('.ih-honour-checks').innerHTML = ''
    }
    // restore standard fields
    showIHCompetitionFields(true)
  }
  if (level === 'activity' || level === 'competition' || level === 'group') {
    // sub-event
    const subSel = document.getElementById('ihSubEvent')
    if (subSel) subSel.value = ''
    document.getElementById('ihSubEventWrap')?.classList.add('hidden')
  }
}

/**
 * Collect the checked honour options as a comma-separated string.
 */
function getCheckedHonours() {
  const checked = []
  document.querySelectorAll('.ih-honour-checkbox:checked').forEach(cb => checked.push(cb.value))
  return checked.join(', ')
}

/**
 * For Inter House, derive the competition name that will be stored as title.
 * Format examples:
 *   "Athletics - Running - 100m Sprint"
 *   "Athletics - Best Athlete"
 *   "Football"
 *   "Swimming - Freestyle"
 */
function getIHCompetitionName() {
  const comp    = document.getElementById('ihCompetition')?.value  || ''
  const group   = document.getElementById('ihAthlGroup')?.value    || ''
  const subEvt  = document.getElementById('ihSubEvent')?.value     || ''

  // "Other" — use the free-text name input
  if (comp === '__other__') {
    return document.getElementById('ihOtherName')?.value.trim() || ''
  }

  if (!comp) return ''

  const sport = getSport(comp)
  if (sport?.groups) {
    if (!group) return comp
    if (group === 'Best Athlete') return `${comp} - Best Athlete`
    if (subEvt) return `${comp} - ${group} - ${subEvt}`
    return `${comp} - ${group}`
  }

  if (subEvt) return `${comp} - ${subEvt}`
  return comp
}

function onYearChange() {
  const category = document.getElementById('achievementCategory')?.value
  if (category !== 'Academics') {
    updatePreview()
    return
  }

  const yearSelect     = document.getElementById('achievementYear')
  const selectedOption = yearSelect?.selectedOptions[0]
  if (!selectedOption?.value) return

  const val       = selectedOption.value              // numeric year, 'ssc', or 'hsc'
  const gradeType = selectedOption.dataset.gradeType  // 'ssc' | 'hsc' | undefined
  const gradeNum  = parseInt(selectedOption.dataset.gradeNum || '0')

  if (val === 'ssc' || gradeType === 'ssc') {
    showAcademicSubLayout('board', 'SSC Examination Result')
  } else if (val === 'hsc' || gradeType === 'hsc') {
    showAcademicSubLayout('board', 'HSC Examination Result')
  } else if (gradeNum) {
    showAcademicSubLayout(getAcademicLayout(gradeNum))
  }
}

// ─── Year-Grade Dropdown ──────────────────────────────────────────────────────

function getGradeNumber(romanClass) {
  const map = { 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12 }
  return map[romanClass] || 9
}

function getRomanClass(gradeNum) {
  const map = { 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' }
  return map[gradeNum] || ''
}

function getOrdinalGrade(gradeNum) {
  if (gradeNum < 1) return ''
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = gradeNum % 100
  return gradeNum + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]) + ' Grade'
}

/**
 * Build the year dropdown.
 *
 * Competition mode (academicsMode = false):
 *   "YYYY - Nth Grade" from current grade down to 7, plus one future grade.
 *
 * Academics mode (academicsMode = true):
 *   Same "YYYY - Nth Grade" rows (grades 12 down to 7, always all past grades).
 *   Then two fixed entries at the bottom: "SSC" and "HSC" (no year prefix —
 *   their year is entered manually in the board year field).
 */
function populateYearGradeDropdown(currentClass, academicsMode) {
  const yearSelect = document.getElementById('achievementYear')
  if (!yearSelect) return

  const currentYear  = new Date().getFullYear()
  const currentGrade = getGradeNumber(currentClass)

  const options = ['<option value="">— Select Year —</option>']

  if (!academicsMode) {
    // ── Competition: one future grade + current down to 7 ─────────────────
    if (currentGrade < 12) {
      options.push(makeGradeOption(currentYear + 1, currentGrade + 1))
    }
    for (let g = currentGrade; g >= 7; g--) {
      options.push(makeGradeOption(currentYear + (g - currentGrade), g))
    }
  } else {
    // ── Academics: all grades 12 → 7 with calendar years, then SSC / HSC ──
    for (let g = 12; g >= 7; g--) {
      const y = currentYear + (g - currentGrade)
      options.push(makeGradeOption(y, g))
    }
    options.push(`<option value="ssc" data-grade-type="ssc" data-class="XI"  data-grade-num="11">SSC</option>`)
    options.push(`<option value="hsc" data-grade-type="hsc" data-class="XII" data-grade-num="12">HSC</option>`)
  }

  yearSelect.innerHTML = options.join('')
}

/** Build a single grade <option> string for competition mode. */
function makeGradeOption(year, gradeNum) {
  const romanClass = getRomanClass(gradeNum)
  const gradeLabel = getOrdinalGrade(gradeNum)
  return (
    `<option value="${year}" data-class="${romanClass}" data-grade-num="${gradeNum}">` +
    `${year} - ${gradeLabel}</option>`
  )
}

// ─── Reset helpers ────────────────────────────────────────────────────────────

function resetCompetitionFields() {
  ;['achievementTitle', 'achievementEvent', 'achievementLevel',
    'achievementExtra', 'achievementRemarks', 'achievementDescription', 'otherCompName'
  ].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  // Reset Inter House dropdowns
  const ihActivity = document.getElementById('ihActivityType')
  const ihComp     = document.getElementById('ihCompetition')
  const ihGroup    = document.getElementById('ihAthlGroup')
  const ihSub      = document.getElementById('ihSubEvent')
  const ihOther    = document.getElementById('ihOtherName')
  if (ihActivity) ihActivity.value = ''
  if (ihComp)     ihComp.innerHTML  = '<option value="">— Select Competition —</option>'
  if (ihGroup)    ihGroup.innerHTML = '<option value="">— Select Category —</option>'
  if (ihSub)      ihSub.innerHTML   = '<option value="">— Select Event —</option>'
  if (ihOther)    ihOther.value     = ''
  document.getElementById('ihCompetitionWrap')?.classList.add('hidden')
  document.getElementById('ihAthlGroupWrap')?.classList.add('hidden')
  document.getElementById('ihSubEventWrap')?.classList.add('hidden')
  document.getElementById('ihOtherNameWrap')?.classList.add('hidden')
  document.getElementById('otherCompNameWrap')?.classList.add('hidden')
  const honourWrap = document.getElementById('ihHonourWrap')
  if (honourWrap) {
    honourWrap.classList.add('hidden')
    honourWrap.querySelector('.ih-honour-checks').innerHTML = ''
  }
  showIHCompetitionFields(true)
}

function resetAcademicsFields() {
  ;[
    'acad-t1-gpa', 'acad-t1-pos', 'acad-t2-gpa', 'acad-t2-pos', 'acad-t3-gpa', 'acad-t3-pos',
    'acad-g10-t1-gpa', 'acad-g10-t1-pos', 'acad-g10-pre-gpa', 'acad-g10-pre-pos',
    'acad-g10-test-gpa', 'acad-g10-test-pos',
    'acad-g12-pre-gpa', 'acad-g12-pre-pos', 'acad-g12-test-gpa', 'acad-g12-test-pos',
    'acad-g12-model-gpa', 'acad-g12-model-pos',
    'acad-board-year', 'acad-board-gpa', 'acad-board-pos', 'acad-remarks'
  ].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  ;['acad-terms', 'acad-grade10', 'acad-grade12', 'acad-board'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  )
}

// ─── Preview (competition mode only) ─────────────────────────────────────────

function updatePreview() {
  const type = document.getElementById('achievementCategory')?.value || 'Inter-house'
  if (type === 'Academics') return

  let name
  if (type === 'Inter-house') {
    name = getIHCompetitionName() || '{Competition}'
  } else {
    name = document.getElementById('achievementTitle')?.value.trim() || '{Name}'
  }
  const year    = document.getElementById('achievementYear')?.value.trim() || '{Year}'
  const preview = document.getElementById('achievementPreview')
  if (preview) preview.textContent = formatCompetitionName(type, name, year)
}

// ─── Save dispatcher ──────────────────────────────────────────────────────────

export async function saveAchievementFromForm() {
  if (!activeCadetId && !editingAchievementId) {
    showToast('No cadet selected.', 'error')
    return
  }
  const category = document.getElementById('achievementCategory')?.value
  if (category === 'Academics') {
    await saveAcademicsFromForm()
  } else {
    await saveCompetitionFromForm()
  }
}

// ─── Helper: detect "best award only" mode ───────────────────────────────────

/**
 * Returns true when the current IH selection is a best-award-only state:
 *   - Athletics → Best Athlete selected, OR
 *   - Any regular sport (no groups) where honours are shown and position is hidden
 */
function isBestAwardMode() {
  const activityType = document.getElementById('ihActivityType')?.value
  if (activityType !== 'Extra-Curricular') return false

  const comp  = document.getElementById('ihCompetition')?.value
  const group = document.getElementById('ihAthlGroup')?.value
  const sport = getSport(comp)

  if (!sport) return false

  // Athletics Best Athlete
  if (sport.groups && group === 'Best Athlete') return true

  // For regular sports (no groups), check if position wrap is hidden
  const posWrap = document.getElementById('ihPositionWrap')
  // Regular sports always show position — Best Award mode only applies to Best Athlete
  return false
}

// ─── Save — Competition ───────────────────────────────────────────────────────

async function saveCompetitionFromForm() {
  const category    = document.getElementById('achievementCategory')?.value
  const yearSelect  = document.getElementById('achievementYear')
  const year        = yearSelect?.value
  const className   = yearSelect?.selectedOptions[0]?.dataset.class || ''
  let   level       = document.getElementById('achievementLevel')?.value.trim()
  const extra       = document.getElementById('achievementExtra')?.value.trim()
  const remarks     = document.getElementById('achievementRemarks')?.value.trim()
  const description = document.getElementById('achievementDescription')?.value.trim()

  let competitionName, event, activityType = ''

  if (category === 'Inter-house') {
    activityType    = document.getElementById('ihActivityType')?.value || ''
    competitionName = getIHCompetitionName()
    event           = ''
    if (!activityType)    { showToast('Please select an activity type.', 'warning'); return }
    if (!competitionName) {
      const compVal = document.getElementById('ihCompetition')?.value
      showToast(compVal === '__other__' ? 'Please enter a competition name.' : 'Please select a competition.', 'warning')
      return
    }

    // For Best Athlete / Best Player / Best Goalkeeper / Best Swimmer honours,
    // the position field is optional — use the checked honours as the level
    const honours = getCheckedHonours()
    const isBestAwardOnly = isBestAwardMode()
    if (isBestAwardOnly) {
      if (!honours) { showToast('Please check at least one award option.', 'warning'); return }
      level = honours
    }
  } else if (category === 'Other') {
    competitionName = document.getElementById('otherCompName')?.value.trim()
    event           = ''
    if (!competitionName) { showToast('Please enter a competition name.', 'warning'); return }
  } else {
    competitionName = document.getElementById('achievementTitle')?.value.trim()
    event           = document.getElementById('achievementEvent')?.value.trim()
    if (!competitionName) { showToast('Type, Year, Competition Name, and Position are required.', 'warning'); return }
  }

  if (!category || !year || !className) {
    showToast('Type and Year are required.', 'warning')
    return
  }

  // In best-award mode, level was already set from honours above; skip the empty check
  const isBestAward = isBestAwardMode()
  if (!level && !isBestAward) {
    showToast('Position is required.', 'warning')
    return
  }

  if (!isBestAward) {
    level = autoAppendPosition(level)
  }

  const honours = getCheckedHonours()
  const fullTitle = formatCompetitionName(category, competitionName, year)

  const metaPairs = []
  if (activityType) metaPairs.push(`activityType=${activityType}`)
  if (event)        metaPairs.push(`event=${event}`)
  if (honours)      metaPairs.push(`honours=${honours}`)
  if (extra)        metaPairs.push(`extra=${extra}`)
  if (remarks)      metaPairs.push(`remarks=${remarks}`)
  if (className)    metaPairs.push(`class=${className}`)
  const metaLine        = metaPairs.length ? `META|${metaPairs.join('|')}` : ''
  const fullDescription = [metaLine, description].filter(Boolean).join('\n')

  const payload = {
    title:            fullTitle,
    category,
    level,
    achievement_date: year ? `${year}-01-01` : null,
    description:      fullDescription
  }

  if (editingAchievementId) {
    await updateAchievement(editingAchievementId, payload)
  } else {
    await addAchievement({ cadet_id: activeCadetId, ...payload })
  }
}

// ─── Save — Academics ─────────────────────────────────────────────────────────

async function saveAcademicsFromForm() {
  const yearSelect     = document.getElementById('achievementYear')
  const selectedVal    = yearSelect?.value               // 'grade-9', 'ssc', 'hsc', or ''
  const selectedOption = yearSelect?.selectedOptions[0]

  if (!selectedVal || !selectedOption) {
    showToast('Please select a grade.', 'warning')
    return
  }

  const gradeType = selectedOption.dataset.gradeType  // 'ssc' | 'hsc' | undefined
  const gradeNum  = parseInt(selectedOption.dataset.gradeNum || '0')
  const className = selectedOption.dataset.class || ''
  const remarks   = document.getElementById('acad-remarks')?.value.trim() || ''

  const isBoard = selectedVal === 'ssc' || selectedVal === 'hsc' || gradeType === 'ssc' || gradeType === 'hsc'

  let layout, gradeLabel, year, examData = {}

  if (selectedVal === 'ssc' || gradeType === 'ssc') {
    layout     = 'board'
    gradeLabel = 'SSC'
    year       = document.getElementById('acad-board-year')?.value.trim()
  } else if (selectedVal === 'hsc' || gradeType === 'hsc') {
    layout     = 'board'
    gradeLabel = 'HSC'
    year       = document.getElementById('acad-board-year')?.value.trim()
  } else {
    layout     = getAcademicLayout(gradeNum)
    gradeLabel = getOrdinalGrade(gradeNum)
    // Grade options now carry the real calendar year as their value
    year = selectedVal
  }

  if (!year) {
    showToast('Please enter the year.', 'warning')
    return
  }

  // Collect fields by layout
  if (layout === 'terms') {
    const t1gpa = document.getElementById('acad-t1-gpa')?.value.trim()
    const t1pos = document.getElementById('acad-t1-pos')?.value.trim()
    const t2gpa = document.getElementById('acad-t2-gpa')?.value.trim()
    const t2pos = document.getElementById('acad-t2-pos')?.value.trim()
    const t3gpa = document.getElementById('acad-t3-gpa')?.value.trim()
    const t3pos = document.getElementById('acad-t3-pos')?.value.trim()
    if (!t1gpa && !t2gpa && !t3gpa) { showToast('Enter at least one GPA result.', 'warning'); return }
    examData = { t1gpa, t1pos, t2gpa, t2pos, t3gpa, t3pos }

  } else if (layout === 'grade10') {
    const t1gpa   = document.getElementById('acad-g10-t1-gpa')?.value.trim()
    const t1pos   = document.getElementById('acad-g10-t1-pos')?.value.trim()
    const pregpa  = document.getElementById('acad-g10-pre-gpa')?.value.trim()
    const prepos  = document.getElementById('acad-g10-pre-pos')?.value.trim()
    const testgpa = document.getElementById('acad-g10-test-gpa')?.value.trim()
    const testpos = document.getElementById('acad-g10-test-pos')?.value.trim()
    if (!t1gpa && !pregpa && !testgpa) { showToast('Enter at least one GPA result.', 'warning'); return }
    examData = { t1gpa, t1pos, pregpa, prepos, testgpa, testpos }

  } else if (layout === 'grade12') {
    const pregpa   = document.getElementById('acad-g12-pre-gpa')?.value.trim()
    const prepos   = document.getElementById('acad-g12-pre-pos')?.value.trim()
    const testgpa  = document.getElementById('acad-g12-test-gpa')?.value.trim()
    const testpos  = document.getElementById('acad-g12-test-pos')?.value.trim()
    const modelgpa = document.getElementById('acad-g12-model-gpa')?.value.trim()
    const modelpos = document.getElementById('acad-g12-model-pos')?.value.trim()
    if (!pregpa && !testgpa && !modelgpa) { showToast('Enter at least one GPA result.', 'warning'); return }
    examData = { pregpa, prepos, testgpa, testpos, modelgpa, modelpos }

  } else if (layout === 'board') {
    const boardgpa = document.getElementById('acad-board-gpa')?.value.trim()
    const boardpos = document.getElementById('acad-board-pos')?.value.trim()
    if (!boardgpa) { showToast('GPA is required for board exam results.', 'warning'); return }
    examData = { boardgpa, boardpos }
  }

  // Build the ACADEMICS meta string
  const metaPairs = [`layout=${layout}`, `class=${className}`, `grade=${gradeLabel}`, `year=${year}`]
  Object.entries(examData).forEach(([k, v]) => {
    if (v !== '' && v != null) metaPairs.push(`${k}=${v}`)
  })
  if (remarks) metaPairs.push(`remarks=${remarks}`)

  const title = `Academics ${gradeLabel} ${year}`.trim()
  const levelSummary = examData.boardgpa ? `GPA ${examData.boardgpa}` : gradeLabel

  const payload = {
    title,
    category:         'Academics',
    level:            levelSummary,
    achievement_date: `${year}-01-01`,
    description:      `ACADEMICS|${metaPairs.join('|')}`
  }

  if (editingAchievementId) {
    await updateAchievement(editingAchievementId, payload)
  } else {
    await addAchievement({ cadet_id: activeCadetId, ...payload })
  }
}

// ─── Add ──────────────────────────────────────────────────────────────────────

export async function addAchievement(payload) {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only form masters can add achievements.', 'error')
    return
  }

  setButtonLoading('saveAchievementBtn', true, 'Saving...')

  const { error } = await supabase
    .from('achievements')
    .insert([{ ...payload, created_by: staff.id, updated_by: staff.id }])

  setButtonLoading('saveAchievementBtn', false)

  if (error) { showToast(error.message, 'error'); return }

  closeAchievementForm()
  showToast('Achievement added successfully.')

  const { renderProfile } = await import('./profile')
  const { data: cadet } = await supabase.from('cadets').select('*').eq('id', payload.cadet_id).single()
  if (cadet) await renderProfile(cadet)
}

// ─── Update ───────────────────────────────────────────────────────────────────

async function updateAchievement(id, updates) {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only form masters can edit achievements.', 'error')
    return
  }

  setButtonLoading('saveAchievementBtn', true, 'Saving...')

  const { error } = await supabase
    .from('achievements')
    .update({ ...updates, updated_by: staff.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  setButtonLoading('saveAchievementBtn', false)

  if (error) { showToast(error.message, 'error'); return }

  closeAchievementForm()
  showToast('Achievement updated.')

  const { renderProfile } = await import('./profile')
  const { data: achievement } = await supabase.from('achievements').select('cadet_id').eq('id', id).single()
  if (achievement) {
    const { data: cadet } = await supabase.from('cadets').select('*').eq('id', achievement.cadet_id).single()
    if (cadet) await renderProfile(cadet)
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAchievement(id, cadetId) {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only form masters can delete achievements.', 'error')
    return
  }

  const confirmed = confirm('Delete this achievement? This cannot be undone.')
  if (!confirmed) return

  const { error } = await supabase.from('achievements').delete().eq('id', id)
  if (error) { showToast(error.message, 'error'); return }

  showToast('Achievement deleted.')

  const { renderProfile } = await import('./profile')
  const { data: cadet } = await supabase.from('cadets').select('*').eq('id', cadetId).single()
  if (cadet) await renderProfile(cadet)
}

// ─── Open Edit Form ───────────────────────────────────────────────────────────

export async function openEditAchievementForm(achievement) {
  const staff = getCurrentStaff()

  if (!staff || staff.role !== ROLES.FORM_MASTER) {
    showToast('Only form masters can edit achievements.', 'error')
    return
  }

  editingAchievementId = achievement.id
  activeCadetId        = achievement.cadet_id

  const { data: cadet } = await supabase
    .from('cadets')
    .select('class_name, intake, college')
    .eq('id', achievement.cadet_id)
    .single()

  activeCadetClass = cadet?.class_name || 'IX'
  await fetchIntakeCadetCount(cadet?.college, cadet?.intake)

  document.getElementById('achievementModalTitle').textContent = 'Edit Achievement'

  if (achievement.category === 'Academics') {
    populateYearGradeDropdown(activeCadetClass, true)
    document.getElementById('achievementCategory').value = 'Academics'

    const parsed = parseAcademicsAchievement(achievement)

    // Select the matching option
    const yearSelect = document.getElementById('achievementYear')
    if (yearSelect) {
      if (parsed.gradeType === 'ssc') {
        yearSelect.value = 'ssc'
      } else if (parsed.gradeType === 'hsc') {
        yearSelect.value = 'hsc'
      } else if (parsed.year) {
        // Grade options use the real calendar year as their value
        yearSelect.value = parsed.year
      }
    }

    resetAcademicsFields()
    switchModalMode('academics')
    setupModalListeners()
    onYearChange()
    fillAcademicsFields(parsed)
    document.getElementById('acad-remarks').value = parsed.remarks || ''
    // Restore the board year field for SSC/HSC
    if (parsed.gradeType === 'ssc' || parsed.gradeType === 'hsc') {
      const boardYearEl = document.getElementById('acad-board-year')
      if (boardYearEl) boardYearEl.value = parsed.year || ''
    }

  } else {
    populateYearGradeDropdown(activeCadetClass, false)
    document.getElementById('achievementCategory').value = achievement.category

    const parsed = parseAchievement(achievement)

    if (achievement.category === 'Inter-house') {
      // Restore IH dropdowns
      updateInterHouseVisibility(true)
      setupModalListeners()

      const ihActivity = document.getElementById('ihActivityType')
      if (ihActivity) {
        ihActivity.value = parsed.activityType || ''
        // Populate competition list for this activity type
        onIHActivityChange()

        // competitionName format examples:
        //   "Athletics - Running - 100m Sprint"
        //   "Athletics - Best Athlete"
        //   "Football"
        //   "Swimming - Freestyle"
        const ihComp  = document.getElementById('ihCompetition')
        const ihGroup = document.getElementById('ihAthlGroup')
        const ihSub   = document.getElementById('ihSubEvent')

        if (ihComp && parsed.competitionName) {
          const parts    = parsed.competitionName.split(' - ')
          const sportName = parts[0].trim()

          // Select the sport — or fall back to "Other" if not found
          const knownOption = Array.from(ihComp.options).find(o => o.value === sportName)
          if (knownOption) {
            ihComp.value = sportName
            onIHCompetitionChange()

            const sport = getSport(sportName)
            if (sport?.groups && parts.length >= 2) {
              const groupVal = parts[1].trim()
              if (ihGroup && Array.from(ihGroup.options).find(o => o.value === groupVal)) {
                ihGroup.value = groupVal
                onIHGroupChange()
                if (parts.length >= 3 && ihSub) {
                  ihSub.value = parts[2].trim()
                }
              }
            } else if (parts.length >= 2 && ihSub) {
              ihSub.value = parts[1].trim()
            }
          } else {
            // Unknown name → select "Other" and fill the free-text field
            ihComp.value = '__other__'
            onIHCompetitionChange()
            const otherInput = document.getElementById('ihOtherName')
            if (otherInput) otherInput.value = parsed.competitionName
          }

          // Restore honour checkboxes
          if (parsed.honours) {
            const honoursArr = parsed.honours.split(',').map(h => h.trim())
            document.querySelectorAll('.ih-honour-checkbox').forEach(cb => {
              cb.checked = honoursArr.includes(cb.value)
            })
          }
        }
      }
    } else {
      updateInterHouseVisibility(false)
      document.getElementById('achievementTitle').value = parsed.competitionName
      document.getElementById('achievementEvent').value = parsed.event
      setupModalListeners()
    }

    document.getElementById('achievementLevel').value       = parsed.position
    document.getElementById('achievementYear').value        = parsed.year
    document.getElementById('achievementExtra').value       = parsed.extra
    document.getElementById('achievementRemarks').value     = parsed.remarks
    document.getElementById('achievementDescription').value = parsed.description

    switchModalMode('competition')
    updatePreview()
  }

  openModal('achievementModal')
}

// ─── Fill academic fields on edit ────────────────────────────────────────────

function fillAcademicsFields(parsed) {
  const { layout, examData: d } = parsed

  const set = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.value = val || ''
  }

  if (layout === 'terms') {
    set('acad-t1-gpa', d.t1gpa); set('acad-t1-pos', d.t1pos)
    set('acad-t2-gpa', d.t2gpa); set('acad-t2-pos', d.t2pos)
    set('acad-t3-gpa', d.t3gpa); set('acad-t3-pos', d.t3pos)
  } else if (layout === 'grade10') {
    set('acad-g10-t1-gpa', d.t1gpa);   set('acad-g10-t1-pos', d.t1pos)
    set('acad-g10-pre-gpa', d.pregpa);  set('acad-g10-pre-pos', d.prepos)
    set('acad-g10-test-gpa', d.testgpa); set('acad-g10-test-pos', d.testpos)
  } else if (layout === 'grade12') {
    set('acad-g12-pre-gpa', d.pregpa);   set('acad-g12-pre-pos', d.prepos)
    set('acad-g12-test-gpa', d.testgpa); set('acad-g12-test-pos', d.testpos)
    set('acad-g12-model-gpa', d.modelgpa); set('acad-g12-model-pos', d.modelpos)
  } else if (layout === 'board') {
    set('acad-board-year', parsed.year)
    set('acad-board-gpa', d.boardgpa)
    set('acad-board-pos', d.boardpos)
  }
}

// ─── Parse — Competition ──────────────────────────────────────────────────────

function parseAchievement(item) {
  const type      = item.category || 'Inter-house'
  const typeLabel = TYPE_LABELS[type] || type
  const fullTitle = item.title || ''
  const position  = item.level || ''

  let year = ''
  if (item.achievement_date) {
    const m = String(item.achievement_date).match(/^(\d{4})/)
    if (m) year = m[1]
  }

  let competitionName = fullTitle
  if (competitionName.startsWith(typeLabel + ' '))
    competitionName = competitionName.substring(typeLabel.length + 1)
  if (year && competitionName.endsWith(' ' + year))
    competitionName = competitionName.substring(0, competitionName.length - year.length - 1)
  competitionName = competitionName.trim()

  const desc  = item.description || ''
  const lines = desc.split('\n')
  let event = '', extra = '', remarks = '', className = '', activityType = '', honours = '', userDescription = ''

  lines.forEach(line => {
    if (line.startsWith('META|')) {
      line.substring(5).split('|').forEach(pair => {
        const [key, ...valParts] = pair.split('=')
        const val = valParts.join('=')
        if (key === 'event')        event        = val
        else if (key === 'extra')        extra        = val
        else if (key === 'remarks')      remarks      = val
        else if (key === 'class')        className    = val
        else if (key === 'activityType') activityType = val
        else if (key === 'honours')      honours      = val
      })
    } else if (line.startsWith('Extra: '))   { extra = line.slice(7).trim() }
    else if (line.startsWith('Remarks: '))   { remarks = line.slice(9).trim() }
    else if (line.trim())                    { userDescription += (userDescription ? '\n' : '') + line }
  })

  if (!className) {
    const m = position.match(/\(Class\s+([^)]+)\)/i)
    if (m) className = m[1].trim()
  }

  return {
    type, typeLabel, competitionName, fullTitle, event,
    position: position.replace(/\s*\(Class\s+[^)]+\)/i, '').trim(),
    year, className, activityType, honours, extra, remarks, description: userDescription
  }
}

// ─── Parse — Academics ────────────────────────────────────────────────────────

function parseAcademicsAchievement(item) {
  const desc = item.description || ''
  let layout = 'terms', className = '', gradeLabel = '', gradeType = '', year = '', remarks = ''
  const examData = {}

  // Year fallback from achievement_date
  if (item.achievement_date) {
    const m = String(item.achievement_date).match(/^(\d{4})/)
    if (m) year = m[1]
  }

  if (desc.startsWith('ACADEMICS|')) {
    desc.substring(10).split('|').forEach(pair => {
      const [key, ...valParts] = pair.split('=')
      const val = valParts.join('=')
      if      (key === 'layout')  layout     = val
      else if (key === 'class')   className  = val
      else if (key === 'grade')   gradeLabel = val
      else if (key === 'year')    year       = val   // explicit year stored in meta
      else if (key === 'remarks') remarks    = val
      else examData[key] = val
    })
  }

  if (gradeLabel === 'SSC') gradeType = 'ssc'
  else if (gradeLabel === 'HSC') gradeType = 'hsc'

  return { layout, className, gradeLabel, gradeType, year, remarks, examData }
}

// ─── Load & Render achievements ───────────────────────────────────────────────

export async function loadAchievements(cadetId, containerId = 'profileAchievements', canEdit = false) {
  const container = document.getElementById(containerId)
  if (!container) return

  container.innerHTML = `<div class="text-slate-500 text-sm py-4">Loading achievements...</div>`

  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('cadet_id', cadetId)
    .order('achievement_date', { ascending: false })

  if (error) {
    container.innerHTML = `<div class="text-slate-500 text-sm">Achievement records are unavailable.</div>`
    return
  }

  const countEl = document.getElementById('achievementCount')
  if (countEl) countEl.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`

  if (!data.length) {
    container.innerHTML = `
      <div class="achievement-empty">
        <i class="fa-solid fa-trophy"></i>
        <p>No achievement records available yet.</p>
        ${canEdit ? '<p class="achievement-empty-hint">Click "Add Achievement" to record one.</p>' : ''}
      </div>
    `
    return
  }

  // ── Build unified year groups ─────────────────────────────────────────────
  // yearGroups[yearKey] = { label, types: { typeName: { compTitle: [items] } }, academics: [parsedAcad] }
  const yearGroups = {}

  const ensureYear = (yearKey, yearLabel) => {
    if (!yearGroups[yearKey]) {
      yearGroups[yearKey] = { label: yearLabel, types: {}, academics: [] }
    } else if (yearLabel && !yearGroups[yearKey].label.includes('(')) {
      yearGroups[yearKey].label = yearLabel
    }
  }

  // Competition items
  data.filter(item => item.category !== 'Academics').forEach(item => {
    const parsed     = parseAchievement(item)
    const yearKey    = parsed.year || 'No Year'
    const classLabel = CLASS_TO_GRADE[parsed.className] || (parsed.className ? `Class ${parsed.className}` : '')
    const yearLabel  = classLabel ? `${yearKey} (${classLabel})` : yearKey

    ensureYear(yearKey, yearLabel)

    if (!yearGroups[yearKey].types[parsed.type]) yearGroups[yearKey].types[parsed.type] = {}
    const compKey = parsed.fullTitle
    if (!yearGroups[yearKey].types[parsed.type][compKey]) yearGroups[yearKey].types[parsed.type][compKey] = []
    yearGroups[yearKey].types[parsed.type][compKey].push({ ...parsed, _raw: item })
  })

  // Academic items — slot into their year
  data.filter(item => item.category === 'Academics').forEach(item => {
    const parsed  = parseAcademicsAchievement(item)
    const yearKey = parsed.year || 'No Year'
    ensureYear(yearKey, yearKey)
    yearGroups[yearKey].academics.push({ parsed, raw: item })
  })

  // ── Sort years descending ─────────────────────────────────────────────────
  const sortedYears = Object.keys(yearGroups).sort((a, b) => {
    if (a === 'No Year') return 1
    if (b === 'No Year') return -1
    return Number(b) - Number(a)
  })

  const typeOrder = ['Inter-house', 'Inter-college', 'National', 'International']

  // ── Render ────────────────────────────────────────────────────────────────
  const html = sortedYears.map(yearKey => {
    const group       = yearGroups[yearKey]
    const sortedTypes = typeOrder.filter(t => group.types[t])

    const competitionHtml = sortedTypes.map(type => {
      const competitions = group.types[type]
      const sectionLabel = TYPE_SECTION_LABELS[type] || type
      return `
        <div class="ach-type-block ach-type-${type.toLowerCase().replace(/[^a-z]/g, '-')}">
          <div class="ach-type-header">
            <span class="ach-type-bullet"></span>
            <h4>${escapeHTML(sectionLabel)}</h4>
          </div>
          <div class="ach-type-body">
            ${Object.entries(competitions).map(([compTitle, items]) => {
              // Show activity type badge for Inter House items
              const actBadge = (type === 'Inter-house' && items[0]?.activityType)
                ? `<span class="ih-activity-badge">${escapeHTML(items[0].activityType)}</span>`
                : ''
              return `
              <div class="ach-competition-block">
                <div class="ach-competition-name">${escapeHTML(compTitle)}${actBadge}</div>
                <div class="ach-events-list">
                  ${items.map(item => renderEventItem(item, canEdit)).join('')}
                </div>
              </div>
            `}).join('')}
          </div>
        </div>
      `
    }).join('')

    // Academics block for this year (if any)
    const academicsHtml = group.academics.length
      ? `
        <div class="ach-type-block ach-type-academics">
          <div class="ach-type-header">
            <span class="ach-type-bullet"></span>
            <h4>Academic Results</h4>
          </div>
          <div class="ach-type-body" style="border-left-color: #0891b2;">
            ${group.academics.map(({ parsed, raw }) => renderAcademicCard(parsed, raw, canEdit)).join('')}
          </div>
        </div>
      `
      : ''

    return `
      <div class="ach-year-block">
        <div class="ach-year-header">
          <i class="fa-solid fa-calendar-days"></i>
          <span>${escapeHTML(group.label)}</span>
        </div>
        <div class="ach-year-body">
          ${academicsHtml}
          ${competitionHtml}
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = html
  wireButtons(container, canEdit)
}

function renderAcademicCard(parsed, rawItem, canEdit) {
  const { layout, gradeLabel, year, examData, remarks } = parsed

  let gradeDisplay = gradeLabel
  if (gradeLabel === 'SSC') gradeDisplay = 'SSC Examination'
  else if (gradeLabel === 'HSC') gradeDisplay = 'HSC Examination'

  let bodyHtml = ''

  if (layout === 'board') {
    bodyHtml = `
      <div class="acad-board-result">
        <div>
          <div class="acad-board-label">${escapeHTML(gradeDisplay)} — ${escapeHTML(year)}</div>
          <div class="acad-board-gpa-big">GPA ${escapeHTML(examData.boardgpa || '—')}</div>
          ${examData.boardpos
            ? `<div class="acad-board-pos-text"><i class="fa-solid fa-ranking-star"></i> ${escapeHTML(examData.boardpos)}</div>`
            : ''}
        </div>
      </div>
    `
  } else {
    let examRows = []

    if (layout === 'terms') {
      if (examData.t1gpa)    examRows.push({ label: '1st Term End',  gpa: examData.t1gpa,    pos: examData.t1pos })
      if (examData.t2gpa)    examRows.push({ label: '2nd Term End',  gpa: examData.t2gpa,    pos: examData.t2pos })
      if (examData.t3gpa)    examRows.push({ label: '3rd Term End',  gpa: examData.t3gpa,    pos: examData.t3pos })
    } else if (layout === 'grade10') {
      if (examData.t1gpa)   examRows.push({ label: '1st Term End',  gpa: examData.t1gpa,   pos: examData.t1pos })
      if (examData.pregpa)  examRows.push({ label: 'Pre-Test',      gpa: examData.pregpa,  pos: examData.prepos })
      if (examData.testgpa) examRows.push({ label: 'Test Exam',     gpa: examData.testgpa, pos: examData.testpos })
    } else if (layout === 'grade12') {
      if (examData.pregpa)   examRows.push({ label: 'Pre-Test',    gpa: examData.pregpa,   pos: examData.prepos })
      if (examData.testgpa)  examRows.push({ label: 'Test Exam',   gpa: examData.testgpa,  pos: examData.testpos })
      if (examData.modelgpa) examRows.push({ label: 'Model-Test',  gpa: examData.modelgpa, pos: examData.modelpos })
    }

    bodyHtml = `
      <div class="ach-competition-name">${escapeHTML(`${gradeDisplay} — ${year}`)}</div>
      <div class="acad-result-grid">
        ${examRows.map(row => `
          <div class="acad-result-card">
            <div class="acad-result-card-label">${escapeHTML(row.label)}</div>
            <div class="acad-result-card-gpa">GPA ${escapeHTML(row.gpa)}</div>
            ${row.pos
              ? `<div class="acad-result-card-pos"><i class="fa-solid fa-ranking-star"></i> ${escapeHTML(row.pos)} Position</div>`
              : ''}
          </div>
        `).join('')}
      </div>
    `
  }

  const remarksHtml = remarks
    ? `<div class="ach-event-remarks mt-2"><i class="fa-solid fa-quote-left"></i> ${escapeHTML(remarks)}</div>`
    : ''

  const actionsHtml = canEdit ? `
    <div class="ach-event-actions no-print" style="margin-top: 8px;">
      <button class="edit-achievement-btn ach-edit-btn"
              data-achievement='${JSON.stringify(rawItem).replace(/'/g, "&#39;")}' title="Edit">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="delete-achievement-btn ach-del-btn"
              data-id="${rawItem.id}" data-cadet-id="${rawItem.cadet_id}" title="Delete">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  ` : ''

  return `
    <div class="ach-competition-block">
      ${bodyHtml}
      ${remarksHtml}
      ${actionsHtml}
    </div>
  `
}

// ─── Render Competition Event Row ─────────────────────────────────────────────

function renderEventItem(item, canEdit) {
  const eventLabel = item.event ? `${item.event} - ${item.position}` : item.position
  const honoursBadge = item.honours
    ? item.honours.split(',').map(h =>
        `<span class="ach-honour-badge">⭐ ${escapeHTML(h.trim())}</span>`
      ).join('')
    : ''

  return `
    <div class="ach-event-row">
      <div class="ach-event-marker"></div>
      <div class="ach-event-content">
        <div class="ach-event-line">
          <span class="ach-event-text">${escapeHTML(eventLabel)}</span>
          ${item.extra ? `<span class="ach-extra-badge">★ ${escapeHTML(item.extra)}</span>` : ''}
        </div>
        ${honoursBadge ? `<div class="ach-honours-row">${honoursBadge}</div>` : ''}
        ${item.remarks    ? `<div class="ach-event-remarks"><i class="fa-solid fa-quote-left"></i> ${escapeHTML(item.remarks)}</div>` : ''}
        ${item.description ? `<div class="ach-event-desc">${escapeHTML(item.description)}</div>` : ''}
      </div>
      ${canEdit ? `
        <div class="ach-event-actions no-print">
          <button class="edit-achievement-btn ach-edit-btn"
                  data-achievement='${JSON.stringify(item._raw).replace(/'/g, "&#39;")}' title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="delete-achievement-btn ach-del-btn"
                  data-id="${item._raw.id}" data-cadet-id="${item._raw.cadet_id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      ` : ''}
    </div>
  `
}

// ─── Wire edit/delete buttons ─────────────────────────────────────────────────

function wireButtons(container, canEdit) {
  if (!canEdit) return

  container.querySelectorAll('.edit-achievement-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditAchievementForm(JSON.parse(btn.dataset.achievement)))
  })

  container.querySelectorAll('.delete-achievement-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAchievement(btn.dataset.id, btn.dataset.cadetId))
  })
}
