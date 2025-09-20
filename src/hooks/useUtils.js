import { useCallback } from 'react'

export const useFormatRelativeTime = () => {
  const formatRelativeTime = useCallback((value) => {
    try {
      const now = Date.now()
      const target = new Date(value).getTime()
      if (Number.isNaN(target)) return ''
      const diff = Math.max(0, now - target)

      const minute = 60 * 1000
      const hour = 60 * minute
      const day = 24 * hour
      const week = 7 * day
      const month = 30 * day

      if (diff < minute) return 'Just now'
      if (diff < hour) {
        const mins = Math.round(diff / minute)
        return `${mins} min${mins === 1 ? '' : 's'} ago`
      }
      if (diff < day) {
        const hours = Math.round(diff / hour)
        return `${hours} hour${hours === 1 ? '' : 's'} ago`
      }
      if (diff < week) {
        const days = Math.round(diff / day)
        return `${days} day${days === 1 ? '' : 's'} ago`
      }
      if (diff < month) {
        const weeks = Math.round(diff / week)
        return `${weeks} week${weeks === 1 ? '' : 's'} ago`
      }
      const months = Math.round(diff / month)
      return `${months} month${months === 1 ? '' : 's'} ago`
    } catch {
      return ''
    }
  }, [])

  return formatRelativeTime
}

export const useClipboard = () => {
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('Clipboard copy failed', err)
      return false
    }
  }, [])

  return copyToClipboard
}