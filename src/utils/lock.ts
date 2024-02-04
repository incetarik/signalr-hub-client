/**
 * Represents a {@link Promise} instance that can be manually resolved
 * or rejected.
 *
 * @export
 * @interface ILock
 * @template T The type of the resolved value.
 */
export interface ILock<T> {
  /**
   * The {@link Promise} instance of the underlying type.
   *
   * @type {Promise<T>}
   * @memberof ILock
   */
  lock: Promise<T>

  /**
   * Unlocks the lock promise with the given value unless it was
   * unlocked already.
   *
   * @param {T} value The value to unlock with.
   * @memberof ILock
   */
  unlock(value: T): void

  /**
   * Unlocks the lock promise with the given error value unless it was
   * unlocked already.
   *
   * @param {unknown} error The error value.
   * @memberof ILock
   */
  unlockWithError(error: unknown): void

  /**
   * Indicates if the lock was unlocked already or not.
   *
   * @type {boolean}
   * @memberof ILock
   */
  isUnlocked: boolean
}

/**
 * Creates a lock instance.
 *
 * @export
 * @template T The underlying value type.
 * @return {ILock<T>} The lock instance.
 *
 * @__PURE__
 */
export function makeLock<T = void>(): ILock<T> {
  let _resolve: (value: T) => void
  let _reject: (error: unknown) => void
  let lock = new Promise<T>((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })

  let isUnlocked = false

  return {
    lock,
    unlock(value) {
      if (isUnlocked) return
      _resolve!(value)
      isUnlocked = true
    },
    unlockWithError(error) {
      if (isUnlocked) return
      _reject(error)
      isUnlocked = true
    },
    get isUnlocked() { return isUnlocked },
  }
}
