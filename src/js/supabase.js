import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const STORAGE_BUCKET = 'cadet-photos'

export const ROLES = {
  SYSTEM_ADMIN: 'system_admin',
  ADMIN: 'admin',          // College Admin (legacy alias)
  FORM_MASTER: 'form_master',
  VICE_PRINCIPAL: 'vice_principal',
  PRINCIPAL: 'principal'
}

// Helper: returns true for both system admins and college admins
export function isAnyAdmin(role) {
  return role === ROLES.SYSTEM_ADMIN || role === ROLES.ADMIN
}

// Helper: returns true ONLY for system admin
export function isSystemAdmin(role) {
  return role === ROLES.SYSTEM_ADMIN
}

// Helper: returns true ONLY for college admin
export function isCollegeAdmin(role) {
  return role === ROLES.ADMIN
}

export const COLLEGES = [
  'Faujdarhat Cadet College',
  'Jhenaidah Cadet College',
  'Mirzapur Cadet College',
  'Rajshahi Cadet College',
  'Sylhet Cadet College',
  'Rangpur Cadet College',
  'Barishal Cadet College',
  'Pabna Cadet College',
  'Mymensingh Girls Cadet College',
  'Cumilla Cadet College',
  'Feni Girls Cadet College',
  'Joypurhat Girls Cadet College'
]

// Maps full college name → logo filename in /CC_logos/
export const COLLEGE_LOGOS = {
  'Faujdarhat Cadet College':        '/CC_logos/FCC.jpg',
  'Jhenaidah Cadet College':         '/CC_logos/JCC.jpg',
  'Mirzapur Cadet College':          '/CC_logos/MCC.png',
  'Rajshahi Cadet College':          '/CC_logos/RCC.png',
  'Sylhet Cadet College':            '/CC_logos/SCC.png',
  'Rangpur Cadet College':           '/CC_logos/CCR.png',
  'Barishal Cadet College':          '/CC_logos/BCC.png',
  'Pabna Cadet College':             '/CC_logos/PCC.png',
  'Mymensingh Girls Cadet College':  '/CC_logos/MGCC.png',
  'Cumilla Cadet College':           '/CC_logos/CCC.png',
  'Feni Girls Cadet College':        '/CC_logos/FGCC.png',
  'Joypurhat Girls Cadet College':   '/CC_logos/JGCC.png',
}

// Colleges whose logos should NOT be clipped to a circle
// (transparent-background PNGs that are not circular in shape)
export const COLLEGE_LOGO_SQUARE = new Set([
  'Mirzapur Cadet College',
  'Sylhet Cadet College',
])