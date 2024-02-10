import { isEnv } from './is-env'

/**
 * Indicates if the environment is debug environment for this library.
 *
 * @return {boolean} `true` if the debugging is enabled for the library.
 * @exports
 * @__PURE__
 */
export function isDebug(): boolean {
  return isEnv('SIGNALR_HUB_CLIENT_DEBUG')
}
