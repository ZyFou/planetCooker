import { useState, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../app/config.js'

const CLIENT_CACHE_TTL = 30000

export const useApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const clientCache = useRef(new Map())

  const makeCacheKey = (params) => {
    return JSON.stringify(params)
  }

  const getClientCache = (key) => {
    const entry = clientCache.current.get(key)
    if (!entry) return null
    if (entry.expires <= Date.now()) {
      clientCache.current.delete(key)
      return null
    }
    return JSON.parse(JSON.stringify(entry.data))
  }

  const setClientCache = (key, data) => {
    clientCache.current.set(key, { 
      expires: Date.now() + CLIENT_CACHE_TTL, 
      data: JSON.parse(JSON.stringify(data)) 
    })
  }

  const fetchData = useCallback(async (endpoint, options = {}) => {
    const cacheKey = makeCacheKey({ endpoint, ...options })
    const cached = getClientCache(cacheKey)
    
    if (cached && !options.skipCache) {
      return cached
    }

    setLoading(true)
    setError(null)

    try {
      const API_ROOT = API_BASE_URL.replace(/\/?$/, '')
      const response = await fetch(`${API_ROOT}${endpoint}`, {
        cache: 'no-store',
        ...options
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      setClientCache(cacheKey, data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, fetchData }
}

export const useSystemsCount = () => {
  const [count, setCount] = useState('—')
  const { fetchData } = useApi()

  const loadCount = useCallback(async () => {
    try {
      const data = await fetchData('/stats/count')
      const total = Number(data?.total)
      if (Number.isFinite(total)) {
        setCount(total.toLocaleString())
      }
    } catch (err) {
      console.warn('Unable to retrieve system count', err)
    }
  }, [fetchData])

  return { count, loadCount }
}

export const useRecentSystems = () => {
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const { fetchData } = useApi()

  const loadRecent = useCallback(async (limit = 6) => {
    try {
      const data = await fetchData(`/recent?limit=${limit}`)
      setSystems(data?.items || [])
    } catch (err) {
      console.warn('Unable to retrieve recent systems', err)
    } finally {
      setLoading(false)
    }
  }, [fetchData])

  return { systems, loading, loadRecent }
}

export const useSystemsList = () => {
  const [systems, setSystems] = useState([])
  const [total, setTotal] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { fetchData } = useApi()

  const loadSystems = useCallback(async ({ page = 1, pageSize = 12, preset = '', seed = '', sort = 'recent' }) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sort
      })
      
      if (preset) params.set('preset', preset)
      if (seed) params.set('seed', seed)

      const data = await fetchData(`/explore?${params}`)
      const newSystems = data.items || []
      const newTotal = data.total || 0
      const newPageCount = Math.ceil(newTotal / pageSize)

      setSystems(newSystems)
      setTotal(newTotal)
      setPageCount(newPageCount)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch systems:', err)
      setError('Failed to load systems. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [fetchData])

  return { systems, total, pageCount, loading, error, loadSystems }
}