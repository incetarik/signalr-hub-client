import type { IDefineHubObjectParams } from "./define-hub-object-params.type"
import type { Optional } from './parameter-types'

/**
 * Validates the parameters of a function definition.
 *
 * @export
 * @param {string} fnName The function name.
 * @param {unknown[]} parametersShape The shape of the parameters such as `[Number, String]`.
 * @param {unknown[]} parametersReceived The received parameter values.
 * @param {IDefineHubObjectParams<string, {}>} options The options for the hub definition.
 *
 * @throws {Error} When a validation fails.
 */
export function doParameterValidation(
  fnName: string,
  parametersShape: readonly unknown[],
  parametersReceived: unknown[],
  options: IDefineHubObjectParams<string, {}>
) {
  for (let i = 0, limit = parametersShape.length; i < limit; ++i) {
    const shape = parametersShape[ i ]
    const parameter = parametersReceived[ i ]

    if (doValidation(shape, parameter, fnName, i, options)) continue
    throw new Error(`[doParameterValidation] - Type mismatch at parameter at index ${i} at ${fnName} function`)
  }
}

function doValidation(
  shape: unknown,
  value: unknown,
  methodName: string,
  parameterIndex: number,
  options: IDefineHubObjectParams<string, {}>
): boolean {
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

function doObjectValidation(
  shape: unknown,
  value: unknown,
  methodName: string,
  parameterIndex: number,
  options: IDefineHubObjectParams<string, {}>
): boolean {
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

function doOptionalValidation(
  shape: unknown,
  value: unknown,
  methodName: string,
  parameterIndex: number,
  options: IDefineHubObjectParams<string, {}>
): boolean {
  if (typeof shape !== 'object') return false
  if (shape === null) return false

  const _shape = shape as Record<string, unknown>
  const tag = _shape[ '_tag' ]
  if (tag !== 'Optional') return false
  if (typeof value === 'undefined' || value === null) return true

  return doValidation((shape as Optional<unknown>).value, value, methodName, parameterIndex, options)
}

function doArrayValidation(
  shape: unknown,
  value: unknown,
  methodName: string,
  parameterIndex: number,
  options: IDefineHubObjectParams<string, {}>
): boolean {
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

function doCustomTypeValidation(
  shape: unknown,
  _value: unknown,
  options: IDefineHubObjectParams<string, {}>,
  methodName: string,
  parameterIndex: number
): boolean {
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
