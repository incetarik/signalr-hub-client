//#region MARK: - Optional Type Definition

/**
 * Represents the optional data structure for a value.
 */
export type Optional<T> = { readonly _tag: 'Optional', value?: T }

/**
 * Represents the optional parameter.
 * @param {ParameterType} input The parameter type.
 * @constructor
 * @return {Optional<T>} The optional representation of the type input.
 *
 * @__PURE__
 */
export function Optional<const T extends ParameterType>(input: T): Optional<T> {
  return {
    _tag: 'Optional',
    value: input,
  }
}

//#endregion


//#region MARK: - Custom Type Definition

/**
 * Represents the custom type for event functions.
 */
export type CustomType<T> = { readonly _tag: 'CustomType', readonly value: T | null }

/**
 * Represents the custom type for function parameters.
 * @constructor
 *
 * @__PURE__
 */
export function CustomType<const T>(): CustomType<T> {
  return {
    _tag: 'CustomType',
    value: null,
  }
}

//#endregion

/**
 * Describes the parameter type for functions.
 */
export type ParameterType
  = StringConstructor | String
  | NumberConstructor | Number
  | BooleanConstructor | Boolean
  | [ ParameterType ]
  | readonly [ ParameterType ]

  | CustomType<unknown>
  | [ CustomType<unknown> ]
  | readonly [ CustomType<unknown> ]

  | [ Optional<ParameterType> ]
  | readonly [ Optional<ParameterType> ]

  | { [ K: string ]: ParameterType | Optional<ParameterType> }


/**
 * Converts a parameter type (constructor) into the underlying type.
 */
export type ParameterToType<T>
  =
  | T extends Optional<infer Inner extends ParameterType> ? (ParameterToType<Inner> | undefined) : (
    T extends CustomType<infer Inner> ? Inner : (
      T extends typeof String ? string : T extends String ? string : (
        T extends typeof Number ? number : T extends Number ? number : (
          T extends typeof Boolean ? boolean : T extends Boolean ? boolean : (
            T extends [ infer Inner extends ParameterType ] ? ParameterToType<Inner>[] : (
              T extends readonly [ infer Inner extends ParameterType ] ? ParameterToType<Inner>[] : (
                T extends { [ k: string ]: ParameterType } ? ({
                  -readonly [k in keyof T as T[k] extends Optional<unknown> ? never : k]: ParameterToType<T[k]>
                } & {
                  -readonly [k in keyof T as T[k] extends Optional<unknown> ? k : never]?: ParameterToType<T[k]>
                }) : never
                )
              )
            )
          )
        )
      )
    )

/**
 * Converts the given arguments, containing {@link ParameterType}s to parameter types
 */
export type ToFunctionParameters<Args>
  = Args extends readonly [ infer H, ...infer R ]
  ? ([ ParameterToType<H>, ...ToFunctionParameters<R> ])
  : (
    Args extends [ infer H, ...infer R ]
      ? [ ParameterToType<H>, ...ToFunctionParameters<R> ]
      : []
    )
