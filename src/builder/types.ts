import type { HubClient } from '../hub-client'
import type { ParameterToType, ParameterType, ToFunctionParameters } from "./parameter-types"

/**
 * A type representing the hub event function definitions.
 */
export type FunctionDefinitions = { readonly [ K: string ]: ReadonlyArray<ParameterType> }

/**
 * A type representing the hub action function definition.
 */
export type ActionDefinition = {
  /**
   * The input of the action.
   *
   * @type {ReadonlyArray<ParameterType>}
   */
  input: ReadonlyArray<ParameterType>,

  /**
   * The output of the action.
   *
   * @type {ParameterType}
   */
  output: ParameterType
} | {
  /**
   * The input of the action.
   *
   * @type {ReadonlyArray<ParameterType>}
   */
  input: ReadonlyArray<ParameterType>
} | {
  /**
   * The output of the action.
   *
   * @type {ParameterType}
   */
  output: ParameterType
}

/**
 * A type representing the actions of a hub.
 */
export type ActionDefinitions = { readonly [ K: string ]: ActionDefinition }

/**
 * A type representing the input parameter types of an action type.
 */
export type ActionInputs<A extends ActionDefinition> = A extends { input: infer I } ? ToFunctionParameters<I> : []

/**
 * A type representing the output type of an action type.
 */
export type ActionOutput<A extends ActionDefinition> = A extends { output: infer O } ? ParameterToType<O> : void

/**
 * Represents the type for handler unsubscription.
 */
export type Unsubscriber = {
  /**
   * Unsubscribes the handler function.
   *
   * @return {boolean} A boolean status indicating the state change.
   */
  unsubscribe(): boolean
}

/**
 * A {@link HubClient} instance where only some of the properties are
 * kept to use in event handler functions.
 */
export type ConstrainedHubClient
  = Readonly<
  Pick<
    HubClient,
    'stream'
    | 'send'
    | 'invoke'
    | 'url'
    | 'baseUrl'
    | 'connectionId'
    | 'connectionState'
    | 'state'
    | 'upstream'
    | 'upstreamWithTimeout'
  >
>

/**
 * Represents the type for the hub event listener functions.
 */
export type HubObjectFunction<
  Events extends FunctionDefinitions,
  K extends keyof Events
> = (this: ConstrainedHubClient, ...args: ToFunctionParameters<Events[K]>) => void

/**
 * The event definition types.
 */
export type IEventDefinitions<Events extends FunctionDefinitions>
  = {
     readonly [ K in keyof Events ]: {
      /**
       * Adds a permanent listener for the event.
       *
       * @param {HubObjectFunction<Events, K>} handler The event handler.
       * @return {Unsubscriber} The unsubscriber object.
       */
      addListener(handler: HubObjectFunction<Events, K>): Unsubscriber

      /**
       * Adds a hook-like listener for the event.
       *
       * @param {HubObjectFunction<Events, K>} handler The event handler.
       * @param {unknown[]} [dependencyList=[]] The dependency list.
       */
      useListener(handler: HubObjectFunction<Events, K>, dependencyList?: readonly unknown[]): void
    }
  }

type IActionDefinitions<Actions extends ActionDefinitions> = {
  readonly [ K in keyof Actions ]: {
    /**
     * Sends a command for invocation of the method with supplied parameters, without
     * waiting for a response from the server. Therefore, the returned {@link Promise}
     * instance will be resolved when the command is sent.
     *
     * @param {unknown[]} args The arguments to send.
     * @return {Promise<void>} A {@link Promise} that will be resolved when
     * the command is sent.
     */
    send(...args: ActionInputs<Actions[K]>): Promise<void>

    /**
     * Sends a command for invocation of the method with the supplied parameters
     * and waits for the response from the server.
     *
     * @param {unknown[]} args The arguments to send.
     * @return {Promise<Awaited<ActionOutput<Actions[ K ]>>>} A {@link Promise} that
     * will be resolved when the result from the server is received.
     */
    invoke(...args: ActionInputs<Actions[ K ]>): Promise<Awaited<ActionOutput<Actions[ K ]>>>
  }
}

/**
 * Represents a type containing the properties, name and other related information
 * for a hub object instance.
 */
export type HubObjectDefinition<
  Name extends string,
  Events extends FunctionDefinitions,
  Actions extends ActionDefinitions = {}
  > = {
  /**
   * The hub name.
   */
  readonly name: Name

  /**
   * The number of permanent listeners added.
   */
  readonly permanentListenerCount: number

  /**
   * The number of hook listeners.
   */
  readonly hookListenerCount: number

  /**
   * Adds a permanent event listener.
   *
   * @param {string} event The event name.
   * @param {Function} handler The handler function.
   * @return {Unsubscriber} An unsubscriber object. Use this object to `unsubscribe`, to remove
   * the created listener from the hub client instance.
   *
   * @remarks The handler function will have type-checking for its parameters on runtime
   * for non-production environments.
   */
  addListener<const K extends keyof Events>(
    event: K,
    handler: HubObjectFunction<Events, K>,
  ): Unsubscriber

  /**
   * Adds a listener for a react component as a hook, using {@link useEffect} inside and
   * using {@link useCallback} for the given handler function to prevent invalid configurations.
   *
   * @param {string} event The event name.
   * @param {Function} handler The handler function.
   * @param {unknown[]} [deps=[]] The optional dependency list.
   *
   * @remarks The handler function will have type-checking for its parameters on runtime
   * for non-production environments.
   */
  useListener<const K extends keyof Events>(
    event: K,
    handler: (...args: ToFunctionParameters<Events[ K ]>) => void,
    deps?: readonly unknown[]
  ): void

  /**
   * The actions of the hub.
   */
  actions: IActionDefinitions<Actions>

  /**
   * The events of the hub.
   */
  events: IEventDefinitions<Events>
}
