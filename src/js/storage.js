import { supabase, STORAGE_BUCKET } from './supabase'

export async function uploadCadetPhoto(file, cadetNo) {
  if (!file) return null

  const fileExtension = file.name.split('.').pop()
  const filePath = `${cadetNo}-${Date.now()}.${fileExtension}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath)

  return data.publicUrl
}