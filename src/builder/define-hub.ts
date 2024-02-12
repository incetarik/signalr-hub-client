import type {
  ActionDefinitions,
  FunctionDefinitions,
  HubObjectDefinition,
  IEventDefinitions,
  Unsubscriber,
} from './types'
import type { HubClient } from '../hub-client'
import type { IDefineHubObjectParams } from './define-hub-object-params.type'
import type { ParameterType, ToFunctionParameters } from './parameter-types'

import { HubConnectionState } from '@microsoft/signalr'

import { getErrorLocation } from '../utils/get-error-location'
import { isDebug } from '../utils/is-debug'
import {
  addHandlerDebugCache,
  canUseHandlerDebugCache,
  deleteHandlerDebugCache,
  getHandlerDebugCache,
} from './debug-functions'
import { doParameterValidation } from './do-parameter-validation'
import { getHubClient, GetHubClientParams } from './get-hub-client'

//#region defineHubObject

/**
 * Defines a hub object with given options.
 *
 * **NOTE:** The given parameters for each functions will be used for type-checking on runtime
 * on non-production environments, providing a compability check for socket messages.
 *
 * @param options The hub object definition object.
 * @return The hub object.
 */
export function defineHubObject<
  const N extends string,
  const Events extends FunctionDefinitions,
  const Actions extends ActionDefinitions = {}
>(options: IDefineHubObjectParams<N, Events, Actions>): HubObjectDefinition<N, Events, Actions>

/**
 * Defines a hub object with given name and functions.
 *
 * **NOTE:** The given parameters for each functions will be used for type-checking on runtime
 * on non-production environments, providing a compability check for socket messages.
 *
 * @param {string} name The name of the hub.
 * @param events The events functions of the hub.
 * @return The hub object.
 */
export function defineHubObject<
  const N extends string,
  const Events extends FunctionDefinitions,
  const Actions extends ActionDefinitions = {}
>(name: N, events: Events): HubObjectDefinition<N, Events, Actions>

//#endregion

export function defineHubObject<
  const N extends string,
  const Events extends FunctionDefinitions,
  const Actions extends ActionDefinitions = {}
>(
  nameOrOptions: N | IDefineHubObjectParams<N, Events, Actions>,
  events?: Events
): HubObjectDefinition<N, Events, Actions> {
  if (typeof nameOrOptions === 'string') {
    if (!nameOrOptions.trim()) {
      throw new Error(`Empty hub name is given for hub definition`)
    }

    nameOrOptions = {
      name: nameOrOptions,
      events,
      hubUrl: `/hubs/${nameOrOptions}`,
    } as IDefineHubObjectParams<N, Events, Actions>
  }
  else if (!events) {
    events = nameOrOptions.events
  }

  const options = nameOrOptions as IDefineHubObjectParams<N, Events, Actions>

  let url = options.hubUrl
  if (!url) { url = `/hubs/${options.name}` }

  let registeredHookListenerCount = 0
  let registeredPermanentListenerCount = 0

  function getClient(parameters: Omit<GetHubClientParams, 'address'>): Promise<HubClient> {
    const {
      cache = true,
      start = false,
      resetIfNotConnected = true,
      startParameters = options.hubStartParameters,

      logger,
    } = (parameters || {})

    return getHubClient({
      address: url!,

      cache,
      start,
      startParameters,
      resetIfNotConnected,

      logger,
    })
  }

  const result = {
    name: options.name,
    actions: prepareActions<N, Events, Actions>(options),

    get hookListenerCount() { return registeredHookListenerCount },
    get permanentListenerCount() { return registeredPermanentListenerCount },

    getClient,
    addListener<const K extends keyof Events>(
      event: K,
      handler: (...args: ToFunctionParameters<Events[K]>) => void,
    ): Unsubscriber {
      if (options.typeCheckParameters) {
        handler = installTypeCheckingForHandler(
          event as string,
          handler,
          events![ event ],
          options
        )
      }

      let unsubscribe = () => false

      getClient({
        start: true,
        cache: true,

        resetIfNotConnected: true,
        startParameters: options.hubStartParameters,

        logger: options.logger,
      }).then(client => {
        const eventName = (event as string).toLowerCase() as string

        if (isDebug()) {
          options.logger?.(`Added permanent handler for '${eventName}' for '${options.name}'`)
        }

        function _proxyHandlerFunction(...args: unknown[]) {
          return handler.apply(client, args as ToFunctionParameters<Events[K]>)
        }

        client.on(eventName, _proxyHandlerFunction)

        ++registeredPermanentListenerCount

        unsubscribe = () => {
          client.off(eventName, _proxyHandlerFunction)
          --registeredPermanentListenerCount

          if (isDebug()) {
            options?.logger?.(`Unsubscribed '${eventName}', remaining permanent listeners: ${registeredPermanentListenerCount}`)
          }
          return true
        }
      })

      return { unsubscribe }
    },

    useListener<K extends keyof Events>(
      event: K,
      handler: (...args: ToFunctionParameters<Events[ K ]>) => void,
      deps: unknown[] = [],
    ) {
      const {
        acceptCleanup = true,
        effectModifier = __defaultEffectModifier,
        callbackModifier = __defaultCallbackModifier,
      } = options

      const pin = isDebug() ? new Error() : undefined
      let userUnsubscriber: Unsubscriber | undefined

      let willAcceptCleanup = true
      if (typeof acceptCleanup === 'function') {
        willAcceptCleanup = acceptCleanup(event as string, options.name)
      }
      else if (typeof acceptCleanup === 'boolean') {
        willAcceptCleanup = acceptCleanup
      }

      if (willAcceptCleanup) {
        const actualHandler = handler
        handler = callbackModifier(function _proxyEventHandlerWithCleanup(...args) {
          const result = actualHandler(...args)

          if (typeof result === 'function') {
            userUnsubscriber = result
            return
          }

          return result
        }, deps)
      }
      else {
        handler = callbackModifier(handler, deps)
      }

      effectModifier(function _subscribe() {
        type HandlerFn = (...args: unknown[]) => void

        let isUnmounted = false
        let unsubscriber: (() => void) | undefined

        getClient({
          start: true,
          cache: true,

          resetIfNotConnected: true,
          startParameters: options.hubStartParameters,

          logger: options.logger,
        }).then(client => {
          if (isUnmounted) {
            if (isDebug()) {
              options.logger?.(`The event handler '${event as string}' was unmounted before the client is initialized`)
            }

            return
          }

          const eventName = (event as string).toLowerCase() as string
          client.on(eventName, handler as HandlerFn)

          if (isDebug()) {
            options.logger?.(`Added effect handler for '${eventName}' for '${options.name}'`)
          }

          if (canUseHandlerDebugCache()) {
            addHandlerDebugCache(client, eventName, handler)
            options.logger?.(`Listener cache for HubClient(${url})`, getHandlerDebugCache(client))
          }

          ++registeredHookListenerCount

          unsubscriber = () => {
            userUnsubscriber?.unsubscribe()
            client.off(eventName, handler as HandlerFn)

            if (canUseHandlerDebugCache()) {
              deleteHandlerDebugCache(client, eventName, handler)
              options.logger?.(`Listener cache for HubClient(${url})`, getHandlerDebugCache(client))
            }

            --registeredHookListenerCount

            if (isDebug()) {
              options.logger?.(
                `Unsubscribed '${eventName}', remaining hook listeners: ${registeredHookListenerCount}`,
                getErrorLocation(pin)
              )
            }
          }

          if (effectModifier === __defaultEffectModifier) {
            client.addConnectionChangeListener(function _connectionChangeListener(_prev, curr) {
              if (curr === HubConnectionState.Disconnected) {
                options.logger?.(`The hub was disconnected, calling unsubscriber for '${eventName}' handler`)
                unsubscriber!()
                client.removeConnectionListener(_connectionChangeListener)
              }
              else if (curr === HubConnectionState.Connected) {
                options.logger?.(`The hub is connected, calling subscribe effect for '${eventName}' handler`)
                _subscribe()
                client.removeConnectionListener(_connectionChangeListener)
              }
            })
          }
        }).catch(error => {
          if (isUnmounted) return
          throw error
        })

        return () => {
          isUnmounted = true
          unsubscriber?.()
        }
      }, [ event, handler ])
    },
  } as HubObjectDefinition<N, Events, Actions>

  result.events = prepareEvents(options, result)
  return result
}

function installTypeCheckingForHandler<F extends (...args: any[]) => unknown>(
  event: string,
  handler: F,
  parametersShape: readonly unknown[],
  options: IDefineHubObjectParams<string, {}>
): F {
  function typeCheckedHandler(...args: Parameters<F>): ReturnType<F> {
    doParameterValidation(event, parametersShape as Function[], args, options)
    return handler(...args) as ReturnType<F>
  }

  return typeCheckedHandler as F
}

function prepareActions<
  const N extends string,
  const Events extends FunctionDefinitions,
  const Actions extends ActionDefinitions
>(options: IDefineHubObjectParams<N, Events, Actions>) {
  if (!options.actions) return

  let url = options.hubUrl
  if (!url) {
    url = `/hubs/${options.name}`
  }

  type Acts = HubObjectDefinition<N, Events, Actions>['actions']
  const actions = {} as { -readonly [K in keyof Acts]: Acts[K] }

  const willTypeCheck = options.typeCheckActions
  for (const action in options.actions) {
    const actionDef = options.actions[ action ]
    let parameters = [] as ReadonlyArray<ParameterType>

    if ('input' in actionDef) {
      parameters = actionDef.input
    }

    actions[ action as keyof typeof actions ] = {
      async send(...args: unknown[]): Promise<any> {
        if (willTypeCheck) {
          doParameterValidation(action, parameters, args, options)
        }

        const client = await getHubClient({
          start: true,
          address: url!,
          resetIfNotConnected: true,
          startParameters: options.hubStartParameters
        })

        return await client.send(action, ...args)
      },
      async invoke(...args: unknown[]): Promise<any> {
        if (willTypeCheck) {
          doParameterValidation(action, parameters, args, options)
        }

        const client = await getHubClient({
          start: true,
          address: url!,
          resetIfNotConnected: true,
          startParameters: options.hubStartParameters
        })

        return await client.invoke(action, ...args)
      },
    }
  }

  return actions
}

function prepareEvents<
  const N extends string,
  const Events extends FunctionDefinitions,
  const Actions extends ActionDefinitions
>(options: IDefineHubObjectParams<N, Events, Actions>, definition: HubObjectDefinition<N, Events, Actions>): IEventDefinitions<Events> {
  return Object
    .keys(options.events)
    .reduce((prev, eventName) => {
      prev[ eventName ] = {
        addListener(handler) {
          return definition.addListener(eventName.toLowerCase(), handler)
        },
        useListener(handler, dependencyList = []) {
          return definition.useListener(eventName.toLowerCase(), handler, dependencyList)
        },
      }

      return prev
    }, {} as Record<string, Partial<IEventDefinitions<Events>[keyof Events]>>) as IEventDefinitions<Events>
}

//@ts-ignore
function __defaultEffectModifier(fn: Function, _deps: readonly unknown[]) { fn() }

//@ts-ignore
function __defaultCallbackModifier<F>(f: F): F { return f }
