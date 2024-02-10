let _envCache: Map<string, boolean> | undefined

/**
 * Indicates if the given environment (variable) is set.
 *
 * @export
 * @param {string} envName The environment name.
 * @return {boolean} `true` if the environment is set, `false` otherwise.
 */
export function isEnv(envName: string): boolean {
  if (typeof _envCache === 'object') {
    if (_envCache.has(envName)) return _envCache.get(envName)!
  }

  //@ts-ignore
  if (typeof process === 'object' && !process['browser']) {
    //@ts-ignore
    const _process = process
    if (typeof _envCache !== 'object') {
      _envCache = new Map()
    }

    if (typeof _process.env === 'object') {
      const value = _process.env[ envName ]
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        const envValue = normalized === 'true' || normalized === '1'
        _envCache.set(envName, envValue)
        return envValue
      }
    }

    _envCache.set(envName, false)
    return false
  }
  else if (typeof window === 'object') {
    //@ts-ignore
    const value = window[ envName ]

    switch (typeof value) {
      case 'string': {
        const normalized = value.trim().toLowerCase()
        return normalized === 'true' || normalized === '1'
      }

      case 'boolean':
      case 'number':
      case 'bigint': {
        return !!value
      }

      default: return false
    }
  }
  else {
    return false
  }
}
