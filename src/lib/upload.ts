const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Convert a File object to a base64 data URI string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

/**
 * Validate an image file before upload
 * Returns an error message or null if valid
 */
export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Invalid file type. Only JPG, PNG, and WebP images are allowed.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
  }
  return null
}

/**
 * Compress and resize an image using canvas
 * Returns a base64 string (not data URI) for storage
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Scale down if wider than maxWidth
        if (width > maxWidth) {
          const ratio = maxWidth / width
          width = maxWidth
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/jpeg', quality)
        resolve(base64)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Process an image file: validate, compress, and return base64
 */
export async function processImage(file: File): Promise<string> {
  const validationError = validateImage(file)
  if (validationError) {
    throw new Error(validationError)
  }

  return compressImage(file)
}
