import { HttpTransportType, LogLevel } from '@microsoft/signalr'

import { HubClient, IHubStartParameters } from '../hub-client'

const instances: Map<string, HubClient> = new Map()

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

  let startParameters: IHubStartParameters | undefined
  let cache = true

  // Parameter normalization
  let address: string
  if (typeof addressOrObject === 'string') {
    address = addressOrObject
  }
  else if (typeof addressOrObject === 'object') {
    startParameters = addressOrObject.startParameters
    start = typeof addressOrObject.start === 'boolean' ? addressOrObject.start : true

    resetIfNotConnected = !!addressOrObject.resetIfNotConnected
    address = addressOrObject.address
    if ('cache' in addressOrObject) {
      cache = !!addressOrObject.cache
    }
  }
  else {
    throw new Error(`[getHubClient] - No address is given for`)
  }

  let instance = instances.get(address)

  if (instance) {
    if (instance.isConnecting) {
      await instance.untilConnected()
      return instance
    }

    if (resetIfNotConnected) {
      if (!instance.isConnected) {
        try {
          await instance.start()
        }
        catch (error) {
          instances.delete(address)
          return getHubClient(address, start as boolean, resetIfNotConnected)
        }
      }
    }

    if (cache) { instances.set(address, instance) }
    return instance
  }

  instance = new HubClient(address)
  if (cache) { instances.set(address, instance) }

  if (!start) {
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

  await instance.start(startParameters)
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
