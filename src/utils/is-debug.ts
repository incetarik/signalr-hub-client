/**
 * A cached debugging mode variable for the library on node environment
 * as the environment is not expected to be changed during the execution.
 *
 * This is not used on browser environment and the function is evaluated
 * every single time as the `DEBUG_HUB_CLIENT` might be defined
 * during the execution.
 */
let _debugCache: boolean | undefined

/**
 * Indicates if the environment is debug environment for this library.
 *
 * @return {boolean} `true` if the debugging is enabled for the library.
 * @exports
 * @__PURE__
 */
export function isDebug(): boolean {
  if (typeof _debugCache === 'boolean') return _debugCache

  // @ts-ignore
  if (typeof process === 'object') {
    // @ts-ignore
    const _process = process

    if (typeof _process.env === 'object') {
      const value = _process.env.DEBUG_HUB_CLIENT
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        _debugCache = normalized === 'true' || normalized === '1'
        return _debugCache
      }
    }

    _debugCache = false
    return _debugCache
  }
  else if (typeof window === 'object') {
    // @ts-ignore
    const value = window[ 'DEBUG_HUB_CLIENT' ]
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

  return false
}
