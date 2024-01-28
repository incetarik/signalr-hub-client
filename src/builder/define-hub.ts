import type {
  Optional,
  ParameterType,
  ToFunctionParameters,
} from './parameter-types'

import type {
  ActionDefinitions,
  FunctionDefinitions,
  HubObjectDefinition,
  Unsubscriber,
} from './types'

import type { IHubStartParameters } from '../hub-client'

import { HubConnectionState } from '@microsoft/signalr'

import { getHubClient } from './get-hub-client'

type DependencyList = readonly unknown[]
type EffectCallback = () => void | (() => void)
type EffectModifierFunction = (fn: EffectCallback, dependencies: DependencyList) => void
type CallbackModifierFunction = <F extends Function>(fn: F, dependencyList: DependencyList) => F

interface IDefineHubObjectParams<
  Name extends string,
  Events extends FunctionDefinitions,
  Actions extends ActionDefinitions = {},
> {
  /**
   * The name of the hub, this will be used for creating the address by
   * appending the given name to `"/hubs/"` string.
   */
  readonly name: Name

  /**
   * The function definitions of the hub object.
   */
  readonly events: Events

  /**
   * The actions of the hub object.
   */
  readonly actions?: Actions,

  /**
   * The optional hub url string, if this is given, {@link name} will not be used
   * for the url of the hub client.
   */
  readonly hubUrl?: string

  /**
   * Indicates if the parameters should be type-checked.
   */
  readonly typeCheckParameters?: boolean

  /**
   * Indicates if the parameters should be type-checked.
   */
  readonly typeCheckActions?: boolean

  /**
   * The underlying effect function.
   *
   * This can be `useEffect` function in `React` library for `hooks` / `useListener` implementations.
   */
  readonly effectModifier?: EffectModifierFunction

  /**
   * The underlying callback function modifier.
   *
   * This can be `useCallback` function in `React` library for `hooks` / `useListener` implementations.
   */
  readonly callbackModifier?: CallbackModifierFunction

  /**
   * A custom function for type-checking a custom type with its method name, parameter index and
   * the value received from the server.
   *
   * @param {string} methodName The method name.
   * @param {number} parameterIndex The parameter index.
   * @param {*} value The received value.
   * @return {boolean | string | undefined} A boolean indicating the type-matching status or a string
   * of the error message or `undefined` for assuming the type is valid.
   */
  typeCheckCustomType?(methodName: keyof Events, parameterIndex: number, value: unknown): boolean | string | undefined

  /**
   * The start parameters for the hub, if needed.
   *
   * @type {IHubStartParameters}
   * @memberof IDefineHubObjectParams
   */
  hubStartParameters?: IHubStartParameters
}

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

  const actions = prepareActions<N, Events, Actions>(options)

  const result = {
    name: options.name,
    get hookListenerCount() { return registeredHookListenerCount },
    get permanentListenerCount() { return registeredPermanentListenerCount },

    actions,

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

      let unsubscriber = () => false

      getHubClient({
        start: true,
        address: url!,
        resetIfNotConnected: true,
        startParameters: options.hubStartParameters
      })
        .then(client => {
          client.on(event as string, function _proxyHandlerFunction(...args: unknown[]) {
            return handler.apply(client, args as ToFunctionParameters<Events[K]>)
          })

          ++registeredPermanentListenerCount

          unsubscriber = () => {
            client.off(event as string)
            --registeredPermanentListenerCount
            return true
          }
        })

      return {
        unsubscribe(): boolean { return unsubscriber() },
      }
    },

    useListener<K extends keyof Events>(
      event: K,
      handler: (...args: ToFunctionParameters<Events[K]>) => void,
      deps: unknown[] = [],
    ) {
      if (options.typeCheckParameters) {
        handler = installTypeCheckingForHandler(
          event as string,
          handler,
          events![ event ],
          options
        )
      }

      function __defaultEffectModifier(fn: Function, _deps: readonly unknown[]) { fn() }

      const {
        callbackModifier = it => it,
        effectModifier = __defaultEffectModifier,
      } = options

      handler = callbackModifier(handler, deps)
      effectModifier(function _subscribe() {
        let isUnmounted = false
        let unsubscriber: (() => void) | undefined

        getHubClient({
          start: true,
          address: url!,
          resetIfNotConnected: true,
          startParameters: options.hubStartParameters
        })
          .then(client => {
            if (isUnmounted) return

            client.on(event as string, function _proxyHandlerFunction(...args: unknown[]) {
              return handler.apply(client, args as ToFunctionParameters<Events[K]>)
            })

            ++registeredHookListenerCount

            unsubscriber = () => {
              client.off(event as string)
              --registeredHookListenerCount
            }

            if (effectModifier === __defaultEffectModifier) {
              client.addConnectionChangeListener(function _connectionChangeListener(_prev, curr) {
                if (curr === HubConnectionState.Disconnected) {
                  unsubscriber!()
                }
                else if (curr === HubConnectionState.Connected) {
                  client.removeConnectionListener(_connectionChangeListener)
                  _subscribe()
                }
              })
            }
          })
          .catch(error => {
            if (isUnmounted) return
            throw error
          })

        return () => {
          isUnmounted = true
          unsubscriber?.()
        }
      }, [ event, handler, ...deps ])
    },
  } as HubObjectDefinition<N, Events, Actions>

  result.events = Object
    .keys(options.events)
    .reduce((prev, eventName) => {
      prev[ eventName ] = {
        addListener(handler) { return result.addListener(eventName, handler) },
        useListener(handler, dependencyList) { return result.useListener(eventName, handler, dependencyList) },
      } as typeof result.events[string]

      return prev
    }, {} as Record<string, unknown>) as typeof result.events

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

function doParameterValidation(fnName: string, parametersShape: readonly unknown[], parametersReceived: unknown[], options: IDefineHubObjectParams<string, {}>) {
  for (let i = 0, limit = parametersShape.length; i < limit; ++i) {
    const shape = parametersShape[ i ]
    const parameter = parametersReceived[ i ]

    if (doValidation(shape, parameter, fnName, i, options)) continue
    throw new Error(`[doParameterValidation] - Type mismatch at parameter at index ${i} at ${fnName} function`)
  }
}

function doValidation(shape: unknown, value: unknown, methodName: string, parameterIndex: number, options: IDefineHubObjectParams<string, {}>): boolean {
  if (doCustomTypeValidation(shape, value, options, methodName, parameterIndex)) return true
  if (doOptionalValidation(shape, value, methodName, parameterIndex, options)) return true
  if (doConstructorValidation(shape, value)) return true
  if (doArrayValidation(shape, value, methodName, parameterIndex, options)) return true
  if (doObjectValidation(shape, value, methodName, parameterIndex, options)) return true
  return false
}

function doConstructorValidation(shape: unknown, value: unknown): boolean {
  switch (typeof value) {
    case 'number':
      return shape === Number
    case 'string':
      return shape === String
    case 'boolean':
      return shape === Boolean
    default:
      return false
  }
}

function doObjectValidation(shape: unknown, value: unknown, methodName: string, parameterIndex: number, options: IDefineHubObjectParams<string, {}>): boolean {
  if (typeof shape !== 'object') return false
  if (shape === null) return false

  if (typeof value !== 'object') return false
  // The following case should be handled by `doOptionalValidation`, therefore
  // we should never see the value as `null` here.
  if (value === null) return false

  const _shape = shape as Record<string, unknown>
  const _value = value as Record<string, unknown>
  for (const key in _shape) {
    const subType = _shape[ key ]
    if (doValidation(subType, _value[ key ], methodName, parameterIndex, options)) continue
    return false
  }

  return true
}

function doOptionalValidation(shape: unknown, value: unknown, methodName: string, parameterIndex: number, options: IDefineHubObjectParams<string, {}>): boolean {
  if (typeof shape !== 'object') return false
  if (shape === null) return false

  const _shape = shape as Record<string, unknown>
  const tag = _shape[ '_tag' ]
  if (tag !== 'Optional') return false
  if (typeof value === 'undefined' || value === null) return true

  return doValidation((shape as Optional<unknown>).value, value, methodName, parameterIndex, options)
}

function doArrayValidation(shape: unknown, value: unknown, methodName: string, parameterIndex: number, options: IDefineHubObjectParams<string, {}>): boolean {
  if (!Array.isArray(shape)) return false
  if (!Array.isArray(value)) return false

  const [ subType ] = shape
  if (!subType) return false

  for (const item of value) {
    if (doValidation(subType, item, methodName, parameterIndex, options)) continue
    return false
  }

  return true
}

function doCustomTypeValidation(shape: unknown, _value: unknown, options: IDefineHubObjectParams<string, {}>, methodName: string, parameterIndex: number): boolean {
  if (typeof shape !== 'object') return false
  if (shape === null) return false

  const _shape = shape as Record<string, unknown>
  const tag = _shape[ '_tag' ]
  if (tag !== 'CustomType') return false

  if (typeof options.typeCheckCustomType !== 'function') return true
  const result = options.typeCheckCustomType(methodName as never, parameterIndex, _value)
  if (typeof result === 'boolean') return result
  if (typeof result === 'string') {
    if (!result.trim()) return true
    throw new Error(result)
  }

  return true
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
