import { supabase, ROLES } from './supabase'
import { getCurrentStaff } from './auth'
import { showToast, openModal, closeModal, setButtonLoading, escapeHTML } from './ui'

let activeCadetId = null
let editingAchievementId = null

// ─── Type Labels ──────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  'Inter-house': 'Inter House',
  'Inter-college': 'Inter Cadet College',
  'National': 'National',
  'International': 'International'
}

const TYPE_SECTION_LABELS = {
  'Inter-house': 'Inter House Competitions',
  'Inter-college': 'Inter Cadet College Competitions',
  'National': 'National Competitions',
  'International': 'International Competitions'
}

const CLASS_TO_GRADE = {
  'VII': '7th Grade',
  'VIII': '8th Grade',
  'IX': '9th Grade',
  'X': '10th Grade',
  'XI': '11th Grade',
  'XII': '12th Grade'
}

// Competition full name format: "{Type} {Name} {Year}"
function formatCompetitionName(type, name, year) {
  const typeLabel = TYPE_LABELS[type] || type
  const yearStr = year ? ` ${year}` : ''
  return `${typeLabel} ${name}${yearStr}`.trim()
}

// Auto-append "Position" if user types just an ordinal (1st, 2nd, 3rd, ..., 12th)
function autoAppendPosition(value) {
  if (!value) return value
  const trimmed = value.trim()
  // Match exactly an ordinal like "1st", "2nd", "3rd", "12th" with optional whitespace
  const ordinalOnly = /^(\d+)(st|nd|rd|th)$/i
  if (ordinalOnly.test(trimmed)) {
    return `${trimmed} Position`
  }
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

  // Fetch the cadet's current class to compute year-grade mapping
  const { data: cadet } = await supabase
    .from('cadets')
    .select('class_name')
    .eq('id', cadetId)
    .single()

  const currentClass = cadet?.class_name || 'IX'

  // Populate the year dropdown with year-grade pairs
  populateYearGradeDropdown(currentClass)

  document.getElementById('achievementModalTitle').textContent = 'Add Achievement'
  document.getElementById('achievementTitle').value = ''
  document.getElementById('achievementCategory').value = 'Inter-house'
  document.getElementById('achievementEvent').value = ''
  document.getElementById('achievementLevel').value = ''
  document.getElementById('achievementExtra').value = ''
  document.getElementById('achievementRemarks').value = ''
  document.getElementById('achievementDescription').value = ''

  // Default to current year if available
  const currentYear = new Date().getFullYear()
  const yearSelect = document.getElementById('achievementYear')
  if (yearSelect) {
    const matchOption = Array.from(yearSelect.options).find(opt => opt.value === String(currentYear))
    if (matchOption) yearSelect.value = String(currentYear)
  }

  setupPreviewListener()
  updatePreview()

  openModal('achievementModal')
}

// ─── Year-Grade Synchronization ───────────────────────────────────────────────

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

function populateYearGradeDropdown(currentClass) {
  const yearSelect = document.getElementById('achievementYear')
  if (!yearSelect) return

  // Auto-synced with system date - automatically updates each year
  const currentYear = new Date().getFullYear()
  const currentGrade = getGradeNumber(currentClass)

  // Build options dynamically based on:
  // 1. Current system date (auto-updates yearly)
  // 2. Cadet's current grade from database (auto-updates when admin promotes)
  //
  // Logic: For each grade the cadet has been in (VII to current),
  // calculate the corresponding year and add as option.
  const options = ['<option value="">— Select Year —</option>']

  // Allow current year + 1 (in case adding achievements for the next academic period)
  // Don't go above grade 12 (cadets pass out after that)
  if (currentGrade < 12) {
    const futureYear = currentYear + 1
    const futureGrade = currentGrade + 1
    const gradeLabel = getOrdinalGrade(futureGrade)
    const romanClass = getRomanClass(futureGrade)
    options.push(`<option value="${futureYear}" data-class="${romanClass}">${futureYear} - ${gradeLabel}</option>`)
  }

  // Iterate from current grade down to grade 7 (cadet college start)
  for (let grade = currentGrade; grade >= 7; grade--) {
    const yearOffset = grade - currentGrade // 0, -1, -2, ...
    const year = currentYear + yearOffset
    const gradeLabel = getOrdinalGrade(grade)
    const romanClass = getRomanClass(grade)
    options.push(`<option value="${year}" data-class="${romanClass}">${year} - ${gradeLabel}</option>`)
  }

  yearSelect.innerHTML = options.join('')
}

export function closeAchievementForm() {
  activeCadetId = null
  editingAchievementId = null
  closeModal('achievementModal')
}

function setupPreviewListener() {
  const inputs = ['achievementTitle', 'achievementCategory', 'achievementYear']
  inputs.forEach(id => {
    const el = document.getElementById(id)
    if (el && !el.dataset.listenerAttached) {
      el.addEventListener('input', updatePreview)
      el.addEventListener('change', updatePreview)
      el.dataset.listenerAttached = 'true'
    }
  })
}

function updatePreview() {
  const type = document.getElementById('achievementCategory')?.value || 'Inter-house'
  const name = document.getElementById('achievementTitle')?.value.trim() || '{Name}'
  const year = document.getElementById('achievementYear')?.value.trim() || '{Year}'
  const preview = document.getElementById('achievementPreview')
  if (preview) {
    preview.textContent = formatCompetitionName(type, name, year)
  }
}

// ─── Save (Add or Edit) ───────────────────────────────────────────────────────

export async function saveAchievementFromForm() {
  if (!activeCadetId && !editingAchievementId) {
    showToast('No cadet selected.', 'error')
    return
  }

  const competitionName = document.getElementById('achievementTitle')?.value.trim()
  const category = document.getElementById('achievementCategory')?.value
  const event = document.getElementById('achievementEvent')?.value.trim()
  let level = document.getElementById('achievementLevel')?.value.trim()
  const yearSelect = document.getElementById('achievementYear')
  const year = yearSelect?.value
  const extra = document.getElementById('achievementExtra')?.value.trim()
  const remarks = document.getElementById('achievementRemarks')?.value.trim()
  const description = document.getElementById('achievementDescription')?.value.trim()

  // Derive class from selected year option (synchronized via year-grade mapping)
  let className = ''
  if (yearSelect && yearSelect.selectedOptions[0]) {
    className = yearSelect.selectedOptions[0].dataset.class || ''
  }

  if (!competitionName || !category || !level || !year || !className) {
    showToast('Type, Year, Competition Name, and Position are required.', 'warning')
    return
  }

  // Auto-append "Position" if user types just an ordinal like "1st", "2nd", "12th"
  level = autoAppendPosition(level)

  // Build the title with type+name+year format
  const fullTitle = formatCompetitionName(category, competitionName, year)

  // Encode all metadata into description so we can parse it back
  // Format: META|event=X|extra=Y|remarks=Z|class=W
  // Then user description on next line
  const metaPairs = []
  if (event) metaPairs.push(`event=${event}`)
  if (extra) metaPairs.push(`extra=${extra}`)
  if (remarks) metaPairs.push(`remarks=${remarks}`)
  if (className) metaPairs.push(`class=${className}`)
  const metaLine = metaPairs.length ? `META|${metaPairs.join('|')}` : ''
  const fullDescription = [metaLine, description].filter(Boolean).join('\n')

  const achievementDate = year ? `${year}-01-01` : null

  const payload = {
    title: fullTitle,
    category,
    level,
    achievement_date: achievementDate,
    description: fullDescription
  }

  if (editingAchievementId) {
    await updateAchievement(editingAchievementId, payload)
  } else {
    await addAchievement({
      cadet_id: activeCadetId,
      ...payload
    })
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
    .insert([{
      ...payload,
      created_by: staff.id,
      updated_by: staff.id
    }])

  setButtonLoading('saveAchievementBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

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
    .update({
      ...updates,
      updated_by: staff.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  setButtonLoading('saveAchievementBtn', false)

  if (error) {
    showToast(error.message, 'error')
    return
  }

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

  const { error } = await supabase
    .from('achievements')
    .delete()
    .eq('id', id)

  if (error) {
    showToast(error.message, 'error')
    return
  }

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
  activeCadetId = achievement.cadet_id

  const parsed = parseAchievement(achievement)

  // Fetch the cadet's current class to compute year-grade mapping
  const { data: cadet } = await supabase
    .from('cadets')
    .select('class_name')
    .eq('id', achievement.cadet_id)
    .single()

  const currentClass = cadet?.class_name || 'IX'

  // Populate the year dropdown
  populateYearGradeDropdown(currentClass)

  document.getElementById('achievementModalTitle').textContent = 'Edit Achievement'
  document.getElementById('achievementTitle').value = parsed.competitionName
  document.getElementById('achievementCategory').value = parsed.type
  document.getElementById('achievementEvent').value = parsed.event
  document.getElementById('achievementLevel').value = parsed.position
  document.getElementById('achievementYear').value = parsed.year
  document.getElementById('achievementExtra').value = parsed.extra
  document.getElementById('achievementRemarks').value = parsed.remarks
  document.getElementById('achievementDescription').value = parsed.description

  setupPreviewListener()
  updatePreview()

  openModal('achievementModal')
}

// ─── Parse Achievement (extract metadata from stored format) ──────────────────

function parseAchievement(item) {
  const type = item.category || 'Inter-house'
  const typeLabel = TYPE_LABELS[type] || type
  const fullTitle = item.title || ''
  const position = item.level || ''

  // Extract year from achievement_date
  let year = ''
  if (item.achievement_date) {
    const dateMatch = String(item.achievement_date).match(/^(\d{4})/)
    if (dateMatch) year = dateMatch[1]
  }

  // Strip the type prefix and year suffix from title to get competition name
  let competitionName = fullTitle
  if (competitionName.startsWith(typeLabel + ' ')) {
    competitionName = competitionName.substring(typeLabel.length + 1)
  }
  if (year && competitionName.endsWith(' ' + year)) {
    competitionName = competitionName.substring(0, competitionName.length - year.length - 1)
  }
  competitionName = competitionName.trim()

  // Parse description for metadata
  const desc = item.description || ''
  const lines = desc.split('\n')
  let event = ''
  let extra = ''
  let remarks = ''
  let className = ''
  let userDescription = ''

  lines.forEach(line => {
    if (line.startsWith('META|')) {
      const pairs = line.substring(5).split('|')
      pairs.forEach(pair => {
        const [key, ...valParts] = pair.split('=')
        const val = valParts.join('=')
        if (key === 'event') event = val
        else if (key === 'extra') extra = val
        else if (key === 'remarks') remarks = val
        else if (key === 'class') className = val
      })
    } else if (line.startsWith('Extra: ')) {
      // Backward compat with old format
      extra = line.replace('Extra: ', '').trim()
    } else if (line.startsWith('Remarks: ')) {
      remarks = line.replace('Remarks: ', '').trim()
    } else if (line.trim()) {
      userDescription += (userDescription ? '\n' : '') + line
    }
  })

  // Backward compat: extract class from level if encoded as "1st (Class IX)"
  if (!className) {
    const classMatch = position.match(/\(Class\s+([^)]+)\)/i)
    if (classMatch) {
      className = classMatch[1].trim()
    }
  }

  // Strip class info from position if it's there (backward compat)
  let cleanPosition = position
  cleanPosition = cleanPosition.replace(/\s*\(Class\s+[^)]+\)/i, '').trim()

  return {
    type,
    typeLabel,
    competitionName,
    fullTitle,
    event,
    position: cleanPosition,
    year,
    className,
    extra,
    remarks,
    description: userDescription
  }
}

// ─── Load & Render (Hierarchical Year-First View) ─────────────────────────────

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

  // Update achievement count
  const countEl = document.getElementById('achievementCount')
  if (countEl) {
    countEl.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`
  }

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

  // Parse all achievements
  const parsed = data.map(item => ({ ...parseAchievement(item), _raw: item }))

  // Group by Year (descending) → Type → Competition (full title)
  const yearGroups = {}
  parsed.forEach(item => {
    const yearKey = item.year || 'No Year'
    const classLabel = CLASS_TO_GRADE[item.className] || (item.className ? `Class ${item.className}` : '')
    const yearLabel = classLabel ? `${yearKey} (${classLabel})` : yearKey

    if (!yearGroups[yearKey]) {
      yearGroups[yearKey] = { label: yearLabel, types: {} }
    } else if (classLabel && !yearGroups[yearKey].label.includes('(')) {
      yearGroups[yearKey].label = yearLabel
    }

    const typeKey = item.type
    if (!yearGroups[yearKey].types[typeKey]) {
      yearGroups[yearKey].types[typeKey] = {}
    }

    const compKey = item.fullTitle
    if (!yearGroups[yearKey].types[typeKey][compKey]) {
      yearGroups[yearKey].types[typeKey][compKey] = []
    }

    yearGroups[yearKey].types[typeKey][compKey].push(item)
  })

  // Sort years descending
  const sortedYears = Object.keys(yearGroups).sort((a, b) => {
    if (a === 'No Year') return 1
    if (b === 'No Year') return -1
    return Number(b) - Number(a)
  })

  // Type display order
  const typeOrder = ['Inter-house', 'Inter-college', 'National', 'International']

  container.innerHTML = sortedYears.map(year => {
    const yearGroup = yearGroups[year]
    const sortedTypes = typeOrder.filter(t => yearGroup.types[t])

    return `
      <div class="ach-year-block">
        <div class="ach-year-header">
          <i class="fa-solid fa-calendar-days"></i>
          <span>${escapeHTML(yearGroup.label)}</span>
        </div>
        <div class="ach-year-body">
          ${sortedTypes.map(type => {
            const competitions = yearGroup.types[type]
            const sectionLabel = TYPE_SECTION_LABELS[type] || type
            return `
              <div class="ach-type-block ach-type-${type.toLowerCase().replace(/[^a-z]/g, '-')}">
                <div class="ach-type-header">
                  <span class="ach-type-bullet"></span>
                  <h4>${escapeHTML(sectionLabel)}</h4>
                </div>
                <div class="ach-type-body">
                  ${Object.entries(competitions).map(([compTitle, items]) => `
                    <div class="ach-competition-block">
                      <div class="ach-competition-name">${escapeHTML(compTitle)}</div>
                      <div class="ach-events-list">
                        ${items.map(item => renderEventItem(item, canEdit)).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `
  }).join('')

  // Wire edit/delete buttons
  if (canEdit) {
    container.querySelectorAll('.edit-achievement-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const achievement = JSON.parse(btn.dataset.achievement)
        openEditAchievementForm(achievement)
      })
    })

    container.querySelectorAll('.delete-achievement-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteAchievement(btn.dataset.id, btn.dataset.cadetId)
      })
    })
  }
}

function renderEventItem(item, canEdit) {
  // Each event line: "{Event} - {Position}" or just "{Position}"
  const eventLabel = item.event ? `${item.event} - ${item.position}` : item.position

  return `
    <div class="ach-event-row">
      <div class="ach-event-marker"></div>
      <div class="ach-event-content">
        <div class="ach-event-line">
          <span class="ach-event-text">${escapeHTML(eventLabel)}</span>
          ${item.extra ? `<span class="ach-extra-badge">★ ${escapeHTML(item.extra)}</span>` : ''}
        </div>
        ${item.remarks ? `<div class="ach-event-remarks"><i class="fa-solid fa-quote-left"></i> ${escapeHTML(item.remarks)}</div>` : ''}
        ${item.description ? `<div class="ach-event-desc">${escapeHTML(item.description)}</div>` : ''}
      </div>
      ${canEdit ? `
        <div class="ach-event-actions no-print">
          <button class="edit-achievement-btn ach-edit-btn" data-achievement='${JSON.stringify(item._raw).replace(/'/g, "&#39;")}' title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="delete-achievement-btn ach-del-btn" data-id="${item._raw.id}" data-cadet-id="${item._raw.cadet_id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      ` : ''}
    </div>
  `
}
