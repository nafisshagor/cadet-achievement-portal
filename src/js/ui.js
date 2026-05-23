export function $(id) {
  return document.getElementById(id)
}

export function show(id) {
  $(id)?.classList.remove('hidden')
}

export function hide(id) {
  $(id)?.classList.add('hidden')
}

export function setText(id, value) {
  const element = $(id)
  if (element) element.textContent = value ?? ''
}

export function setValue(id, value) {
  const element = $(id)
  if (element) element.value = value ?? ''
}

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function showToast(message, type = 'success') {
  let root = $('toastRoot')

  if (!root) {
    root = document.createElement('div')
    root.id = 'toastRoot'
    root.className = 'fixed top-5 right-5 z-[9999] space-y-3'
    document.body.appendChild(root)
  }

  // Prevent duplicate toasts: if the same message is already showing, don't add another
  const existingToasts = root.querySelectorAll('.app-toast')
  for (const existing of existingToasts) {
    if (existing.dataset.message === message && existing.dataset.type === type) {
      return // Already showing - skip
    }
  }

  const colors = {
    success: 'bg-emerald-700',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-slate-800'
  }

  const toast = document.createElement('div')
  toast.className = `app-toast ${colors[type] || colors.info} text-white px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold`
  toast.dataset.message = message
  toast.dataset.type = type
  toast.textContent = message

  root.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 3500)
}

export function setButtonLoading(buttonId, loading, loadingText = 'Loading...', normalText = '') {
  const button = $(buttonId)
  if (!button) return

  if (loading) {
    button.dataset.originalText = button.textContent
    button.disabled = true
    button.textContent = loadingText
  } else {
    button.disabled = false
    button.textContent = normalText || button.dataset.originalText || 'Submit'
  }
}

export function openModal(id) {
  show(id)
  // Lock body scroll while modal is open
  document.body.style.overflow = 'hidden'
}

export function closeModal(id) {
  hide(id)
  // Restore body scroll
  document.body.style.overflow = ''
}

export function getHouseClass(houseName) {
  if (!houseName) return ''
  const house = houseName.toLowerCase().trim()
  if (house.includes('badr')) return 'house-badr'
  if (house.includes('khaiber') || house.includes('khyber')) return 'house-khaiber'
  if (house.includes('hunain')) return 'house-hunain'
  return ''
}

export function formatHouse(houseName) {
  const houseClass = getHouseClass(houseName)
  return `<span class="${houseClass}">${escapeHTML(houseName || 'N/A')}</span>`
}