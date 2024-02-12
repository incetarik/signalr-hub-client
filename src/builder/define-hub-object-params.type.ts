import type { IHubStartParameters } from '../hub-client'
import type { ActionDefinitions, FunctionDefinitions } from './types'

type DependencyList = readonly unknown[]
type EffectCallback = () => void | (() => void)
type EffectModifierFunction = (fn: EffectCallback, dependencies: DependencyList) => void
type CallbackModifierFunction = <F extends Function>(fn: F, dependencyList: DependencyList) => F

/**
 * Represents the hub definition object parameters.
 *
 * @export
 * @interface IDefineHubObjectParams
 * @template Name The name of the hub.
 * @template Events The events definitions type.
 * @template Actions The action definitions type.
 */
export interface IDefineHubObjectParams<
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

  /**
   * The logger function for hub client.
   *
   * @param {...unknown[]} args The arguments passed to the logger.
   * @memberof IDefineHubObjectParams
   */
  logger?(...args: unknown[]): void

  /**
   * Indicates if the cleanup function returns should be accepted or not.
   *
   * - If this property is set to `true`, then any function that is returned from
   * the event handler functions will be called on clean-up stage of the effect.
   *
   * - If this property is a function, then according to the return value the returned
   * function will be called on clean-up stage of the effect.
   *
   * @memberof IDefineHubObjectParams
   * @default true
   */
  acceptCleanup?: ((eventName: string, hubName: string) => boolean) | boolean
}
