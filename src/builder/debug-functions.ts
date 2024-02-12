import type { HubClient } from "../hub-client"
import { isEnv } from '../utils/is-env'

let _handlerDebugCache: WeakMap<HubClient, Map<string, Set<Function>>> | undefined

/**
 * Gets the cache for `useListener` handlers for debugging purposes.
 *
 * @export
 * @param {HubClient} client The client to get its handlers.
 * @return {ReadonlyMap<string, Set<Function>>} A map of events to their handler functions.
 * @nosideeffects
 * @__PURE__
 */
export function getHandlerDebugCache(client: HubClient): ReadonlyMap<string, Set<Function>> {
  if (typeof _handlerDebugCache !== 'object') {
    _handlerDebugCache = new WeakMap()
  }

  if (_handlerDebugCache.has(client)) return _handlerDebugCache.get(client)!

  const map = new Map<string, Set<Function>>()
  _handlerDebugCache.set(client, map)
  return map
}

/**
 * Adds an event handler to track for debugging purposes.
 *
 * @export
 * @param {HubClient} client The related client.
 * @param {string} eventName The event name.
 * @param {Function} handler The event handler.
 */
export function addHandlerDebugCache(client: HubClient, eventName: string, handler: Function): void {
  const map = getHandlerDebugCache(client) as Map<string, Set<Function>>
  if (map.has(eventName)) {
    map.get(eventName)!.add(handler)
  }
  else {
    map.set(eventName, new Set([ handler ]))
  }
}

/**
 * Deletes an event handler for that are added through {@link addHandlerDebugCache}.
 *
 * @export
 * @param {HubClient} client The relevant client.
 * @param {string} eventName The event name.
 * @param {Function} handler The event handler.
 * @return {boolean} `true` if the handler was removed, `false` otherwise.
 */
export function deleteHandlerDebugCache(client: HubClient, eventName: string, handler: Function): boolean {
  if (typeof _handlerDebugCache !== 'object') return false
  if (!_handlerDebugCache.has(client)) return false

  const map = _handlerDebugCache.get(client)
  if (typeof map !== 'object') return false

  if (!map.has(eventName)) return false
  return map.get(eventName)!.delete(handler)
}

/**
 * Indicates if the caching for handlers can be used.
 *
 * @export
 * @return {boolean} `true` if the caching can be used.
 *
 * @nosideeffects
 * @__PURE__
 */
export function canUseHandlerDebugCache(): boolean {
  return /*#__PURE__*/ isEnv('SIGNALR_HUB_CLIENT_USE_LISTENER_CACHE')
}
