import type { Subject } from '@microsoft/signalr'

/**
 * Stream implementation to stream items to the server.
 *
 * @export
 * @interface ManagedSubject
 * @extends {Subject<T>}
 * @template T The message type.
 */
export interface ManagedSubject<T> extends Subject<T> {
  /**
   * The id of the subject.
   */
  readonly id: number;

  /**
   * Indicates if the subject is stopped.
   */
  readonly isStopped: boolean;

  /**
   * A handler function to call when the subject is killed.
   * @param {number} id The id of the {@link ManagedSubject} instance.
   */
  onStop?(id: number): void;

  /**
   * Kills the managed subjects.
   */
  stop(): void;
};
