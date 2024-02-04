import { HttpTransportType, LogLevel } from '@microsoft/signalr'

import { HubClient, IHubStartParameters } from '../hub-client'
import { isDebug } from '../utils/is-debug'
import { ILock, makeLock } from '../utils/lock'

const instances: Map<string, HubClient> = new Map()
const pendingInstances: Map<string, ILock<HubClient>> = new Map()

/**
 * Parameters for getting hub client.
 *
 * @export
 * @interface GetHubClientParams
 */
export interface GetHubClientParams {
  /**
   * Indicates whether the {@link HubClient} should be started or not.
   *
   * This will use the default parameters of {@link startParameters}.
   */
  start?: boolean;

  /**
   * The optional start parameters.
   *
   * @type {IHubStartParameters}
   * @memberof GetHubClientParams
   */
  startParameters?: IHubStartParameters,

  /**
   * Indicates whether the {@link HubClient} should be reset if not connected
   * or not.
   */
  resetIfNotConnected?: boolean;

  /**
   * The URL address for the {@link HubClient}.
   */
  address: string;

  /**
   * Indicates if the resulting instance should be cached.
   *
   * @type {boolean}
   * @memberof GetHubClientParams
   * @default
   * true
   */
  cache?: boolean

  /**
   * The logger function for hub client.
   *
   * @param {...unknown[]} args The arguments passed to the logger.
   * @memberof GetHubClientParams
   */
  logger?(...args: unknown[]): void
}

/**
 * Gets the hub client for given address.
 * @param {string} address The address of the hub.
 * @param {boolean} [start] Indicates if the hub should be started for listening immediately.
 * @param {boolean} [resetIfNotConnected=true] Indicates if the hub should be reset if it was not
 * connected.
 *
 * @return {Promise<HubClient>} A {@link Promise} of {@link HubClient} instance.
 */
export function getHubClient(address: string, start?: boolean, resetIfNotConnected?: boolean): Promise<HubClient>;

/**
 * Gets the hub client for given parameters.
 * @param {GetHubClientParams} params The hub client parameters.
 * @return {Promise<HubClient>} A {@link Promise} of {@link HubClient} instance.
 */
export function getHubClient(params: GetHubClientParams): Promise<HubClient>;

export async function getHubClient(
  addressOrObject: string | GetHubClientParams,
  start = false,
  resetIfNotConnected = true,
) {

  let logger: GetHubClientParams['logger']
  let cache = true
  let startParameters: IHubStartParameters | undefined

  // Parameter normalization
  let address: string
  if (typeof addressOrObject === 'string') {
    address = addressOrObject
  }
  else if (typeof addressOrObject === 'object') {
    startParameters = addressOrObject.startParameters
    start = typeof addressOrObject.start === 'boolean' ? addressOrObject.start : true
    cache = typeof addressOrObject.cache === 'boolean' ? addressOrObject.cache : true

    resetIfNotConnected = typeof addressOrObject.resetIfNotConnected === 'boolean'
      ? addressOrObject.resetIfNotConnected
      : true

    address = addressOrObject.address
    logger = addressOrObject.logger
  }
  else {
    throw new Error(`[getHubClient] - No address is given`)
  }

  let lockInstance = pendingInstances.get(address)

  if (cache) {
    if (lockInstance) {
      if (isDebug()) {
        logger?.(`The HubClient(${address}) is cached and waiting for the lock`)
      }

      return await lockInstance.lock
    }
    else {
      lockInstance = makeLock()
      pendingInstances.set(address, lockInstance)

      if (isDebug()) {
        logger?.(`A new lock is created for HubClient(${address})`)
      }
    }
  }
  else {
    if (isDebug()) {
      logger?.(`Getting HubClient(${address}) with no cache`)
    }
  }

  let instance = instances.get(address)

  if (instance) {
    if (isDebug()) {
      logger?.(`Existing instance is found for HubClient(${address})`)
    }

    if (instance.isConnecting) {
      if (isDebug()) {
        logger?.(`HubClient(${address}) is connecting, waiting it to be connected`)
      }

      await instance.untilConnected()

      if (isDebug()) {
        logger?.(`HubClient(${address}) is connected, unlocking the pending locks`)
      }

      lockInstance?.unlock(instance)
      return instance
    }

    if (resetIfNotConnected) {
      if (!instance.isConnected) {
        try {
          if (isDebug()) {
            logger?.(`HubClient(${address}) was not connected, starting it again`)
          }

          await instance.start()

          if (isDebug()) {
            logger?.(`HubClient(${address}) is started`)
          }
        }
        catch (error) {
          instances.delete(address)
          return getHubClient(address, start as boolean, resetIfNotConnected)
        }
      }
    }

    if (cache) {
      if (isDebug()) {
        logger?.(`Caching HubClient(${address}) instance and unlocking the lock`)
      }

      instances.set(address, instance)
      lockInstance?.unlock(instance)
      pendingInstances.delete(address)
    }

    return instance
  }

  if (isDebug()) {
    logger?.(`Creating a new instance of HubClient(${address})`)
  }

  instance = new HubClient(address)

  if (cache) {
    if (isDebug()) {
      logger?.(`Caching the new HubClient(${address}) instance`)
    }

    instances.set(address, instance)
  }

  if (!start) {
    if (isDebug()) {
      logger?.(`Unlocking the pending locks of HubClient(${address}) without starting it`)
    }

    lockInstance?.unlock(instance)
    pendingInstances.delete(address)
    return instance
  }

  if (typeof startParameters !== 'object') {
    startParameters = {
      autoConnect: true,
      logLevel: LogLevel.Information,
      connectionOptions: {
        transport: HttpTransportType.WebSockets,
      }
    }
  }

  if (isDebug()) {
    logger?.(`Starting the instance of HubClient(${address})`)
  }

  await instance.start(startParameters)

  if (isDebug()) {
    logger?.(`Unlocking the pending locks of HubClient(${address})`)
  }

  lockInstance?.unlock(instance)
  pendingInstances.delete(address)
  return instance
}

/**
 * Deletes a {@link HubClient} cache by given address.
 *
 * @export
 * @param {string} address The address of the client.
 * @return {boolean} `true` if the deletion was successful, `false` otherwise.
 */
export function deleteHubClientCache(address: string): boolean {
  if (!instances.has(address)) { return false }
  instances.delete(address)
  return true
}


/**
 * Gets a cached instance of a {@link HubClient} by given address.
 *
 * @export
 * @param {string} address The address of the client.
 * @return {(HubClient | undefined)} The client instance or `undefined.`
 *
 * @__PURE__
 */
export function getCachedHubClientByAddress(address: string): HubClient | undefined {
  return instances.get(address)
}
