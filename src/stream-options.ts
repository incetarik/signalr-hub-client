/**
 * The stream options.
 *
 * @export
 * @interface StreamOpts
 * @template T The value type.
 */
export interface StreamOpts<T> {
  /**
   * The streaming method name.
   */
  method: string;

  /**
   * The arguments for the method.
   */
  args?: any[];

  /**
   * A handler function to call when a value is received from the stream.
   * @param {T} value The received value.
   */
  next?(value: T): void;

  /**
   * A handler function to call when an error is received from the stream.
   *
   * After this method is called, no other method will be called.
   *
   * @param {*} err The error value.
   */
  error?(err: unknown): void;

  /**
   * A handler function to call when the stream completes.
   */
  complete?(): void;
};
