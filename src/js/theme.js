const THEME_KEY = 'ccams-theme'

export function setupTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn')
  const savedTheme = localStorage.getItem(THEME_KEY) || 'auto'

  applyTheme(savedTheme, false)

  if (themeToggleBtn) {
    updateThemeIcon(savedTheme)

    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = localStorage.getItem(THEME_KEY) || 'auto'
      const nextTheme = getNextTheme(currentTheme)
      applyTheme(nextTheme, true)
      updateThemeIcon(nextTheme)
    })
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = localStorage.getItem(THEME_KEY) || 'auto'
    if (currentTheme === 'auto') applyTheme('auto', true)
  })
}

function getNextTheme(current) {
  const themes = ['auto', 'light', 'dark']
  const currentIndex = themes.indexOf(current)
  return themes[(currentIndex + 1) % themes.length]
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn')
  if (!btn) return

  const icons = {
    auto: 'fa-circle-half-stroke',
    light: 'fa-sun',
    dark: 'fa-moon'
  }

  const icon = btn.querySelector('i')
  if (icon) {
    icon.className = `fa-solid ${icons[theme] || icons.auto}`
  }

  const titles = {
    auto: 'Theme: Auto (click to switch to Light)',
    light: 'Theme: Light (click to switch to Dark)',
    dark: 'Theme: Dark (click to switch to Auto)'
  }
  btn.title = titles[theme] || titles.auto
}

function applyTheme(theme, animate = true) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const finalTheme = theme === 'auto'
    ? prefersDark ? 'dark' : 'light'
    : theme

  if (animate) {
    document.documentElement.classList.add('theme-changing')
    setTimeout(() => {
      document.documentElement.classList.remove('theme-changing')
    }, 260)
  }

  document.documentElement.dataset.theme = finalTheme
  document.documentElement.dataset.themeMode = theme
  localStorage.setItem(THEME_KEY, theme)
}