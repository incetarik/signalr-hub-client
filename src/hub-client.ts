import type { StreamOpts } from './stream-options'
import type { ManagedSubject } from './managed-subject';

import {
  HttpTransportType,
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  IHttpConnectionOptions,
  IHubProtocol,
  IRetryPolicy,
  LogLevel,
  Subject,
} from '@microsoft/signalr'

/**
 * Represents the start parameters for a {@link HubClient}.
 *
 * @exports
 * @interface IHubStartParameters
 */
export interface IHubStartParameters {
  /**
   * The logging level.
   *
   * @type {LogLevel}
   * @memberof IHubStartParameters
   * @default LogLevel.None
   */
  logLevel?: LogLevel

  /**
   * The connection options.
   *
   * @type {IHttpConnectionOptions}
   * @memberof IHubStartParameters
   */
  connectionOptions?: IHttpConnectionOptions,

  /**
   * The hub protocol to use.
   *
   * @type {IHubProtocol}
   * @memberof IHubStartParameters
   */
  hubProtocol?: IHubProtocol

  /**
   * The server timeout in milliseconds.
   *
   * @type {number}
   * @memberof IHubStartParameters
   * @default 30000
   */
  serverTimeoutInMilliseconds?: number

  /**
   * Indicates if the client should auto-connect.
   *
   * @type {boolean}
   * @memberof IHubStartParameters
   * @default true
   */
  autoConnect?: boolean

  /**
   * Options for retrying the auto-connect.
   *
   * If an array is passed, the array will contain the delays in milliseconds before
   * trying each reconnect attempt.
   *
   * The length of the array represents how many failed reconnect attempts it takes before
   * the client will stop attempting to reconnect.
   *
   * If an instance of {@link IRetryPolicy} is passed, it will determine the retries.
   *
   * @type {(number[] | IRetryPolicy)}
   * @memberof IHubStartParameters
   */
  autoConnectRetries?: number[] | IRetryPolicy
}

/**
 * A utility class for SignalR client.
 *
 * @export
 * @class HubClient
 */
export class HubClient {
  private static SubjectId = 0;

  private _initialized = false;
  private _currentState = HubConnectionState.Disconnected;

  private _connection!: HubConnection;
  private _subjectIdMap!: Map<number, ManagedSubject<unknown>>;

  private _errorListeners!: ((error: Error) => void)[];
  private _closeListeners!: ((error?: Error | undefined) => void)[];
  private _reconnectListeners!: ((error?: Error) => void)[];
  private _connectListeners!: ((connectionId: string, isReconnect: boolean) => void)[];
  private _connectionListeners!: ((prev: HubConnectionState, curr: HubConnectionState) => void)[];
  private _methods!: Map<string, ((...args: unknown[]) => void)[]>
  private _pendingMethods: Map<string, ((...args: unknown[]) => void)[]> | undefined

  constructor(public readonly url: string) {}

  /**
   * Gets the current connection id.
   * @returns {string | null}
   */
  get connectionId(): string | null {
    return this._connection.connectionId;
  }

  /**
   * Gets the base url of the client.
   * @returns {string}
   */
  get baseUrl(): string {
    return this._connection.baseUrl;
  }

  /**
   * Gets the current connection state of the client.
   * @return {HubConnectionState} The connection state.
   */
  get connectionState(): HubConnectionState {
    return this._connection?.state ?? HubConnectionState.Disconnected;
  }

  /**
   * Indicates whether the current client is connecting.
   * @return {boolean} `true` if the client is connecting, `false` otherwise.
   */
  get isConnecting(): boolean {
    return (
      this._connection?.state === HubConnectionState.Connecting ||
      this._connection?.state === HubConnectionState.Reconnecting
    );
  }

  /**
   * Indicates whether the client is connected or not.
   * @returns {boolean}
   */
  get isConnected(): boolean {
    return this._connection?.state === HubConnectionState.Connected;
  }

  /**
   * Starts the client.
   * @param {IHubStartParameters} [parameters] The hub start parameters.
   * @returns {Promise<boolean>} A promise of a boolean indication whether the
   * initialization is made. It will return `false` if the connection is already
   * made before.
   */
  async start(parameters?: IHubStartParameters): Promise<boolean> {
    if (this._initialized) { return false; }

    if (typeof parameters !== 'object') {
      parameters = {
        logLevel: LogLevel.Information,
        connectionOptions: {
          transport: HttpTransportType.WebSockets,
        },
      }
    }

    const {
      logLevel = LogLevel.Information,
      hubProtocol,
      serverTimeoutInMilliseconds = 30000,
      autoConnect = true,
      autoConnectRetries,
    } = parameters

    let { connectionOptions } = parameters

    if (typeof connectionOptions !== 'object') {
      connectionOptions = {
        transport: HttpTransportType.WebSockets,
      }
    }

    let connection = new HubConnectionBuilder().withUrl(this.url, connectionOptions);
    if (typeof logLevel !== 'undefined') {
      connection.configureLogging(logLevel)
    }

    if (typeof hubProtocol !== 'undefined') {
      connection.withHubProtocol(hubProtocol)
    }

    if (autoConnect) {
      connection.withAutomaticReconnect(autoConnectRetries as number[])
    }

    const c = this._connection = connection.build();
    c.serverTimeoutInMilliseconds = serverTimeoutInMilliseconds;

    c.onclose((error) => this.onClose(error));
    c.onreconnecting((error) => this.onReconnecting(error));
    c.onreconnected((cid) => this.onReconnected(cid));

    await c.start();

    this._connectListeners?.forEach((listener) => {
      listener(this.connectionId!, false);
    });

    if (this._pendingMethods) {
      this._pendingMethods.forEach((handlers, key) => {
        handlers.forEach(handler => {
          this.on(key, handler)
        })
      })

      this._pendingMethods = undefined;
    }

    return true;
  }

  /**
   * Stops the client.
   * @returns {Promise<boolean>} A {@link Promise} of a boolean indicating the state change.
   */
  async stop(): Promise<boolean> {
    let c = this._connection;
    if (c) {
      await c.stop();

      //@ts-ignore
      this._connection = undefined;
      this._initialized = false;
      return true;
    }

    return false;
  }

  /**
   * Returns a {@link Promise} that will resolve when the connection is made.
   * @return {Promise<string>} A {@link Promise} of connection ID.
   */
  untilConnected(): Promise<string> {
    if (this.isConnected) return Promise.resolve<string>(this.connectionId!);

    return new Promise((res) => {
      const that = this;
      this.addConnectListener(function _untilConnectConnectListener(id) {
        const index = that._connectListeners.indexOf(_untilConnectConnectListener);
        if (~index) {
          that._connectListeners.splice(index, 1);
        }

        res(id);
      });
    });
  }

  /**
   * Adds an error listener to be executed when an error occurs.
   * @param {(error: Error) => void} listener The listener to add.
   */
  addErrorListener(listener: (error: Error) => void) {
    let el = this._errorListeners;
    if (!el) {
      el = this._errorListeners = [];
    }

    el.push(listener);
  }

  /**
   * Removes an error listener.
   *
   * @param {(error?: Error) => void} listener The listener to remove.
   * @return {boolean} A boolean indicating the success state.
   * @memberof HubClient
   */
  removeErrorListener(listener: (error: Error) => void): boolean {
    const { _errorListeners } = this
    if (!_errorListeners) return false

    const index = _errorListeners.indexOf(listener)
    if (index < 0) return false

    _errorListeners.splice(index, 1)
    return true
  }

  /**
   * Adds a close listener to be executed when the connection is closed.
   * @param {(error?: Error) => void} listener The listener to add.
   */
  addCloseListener(listener: (error?: Error) => void) {
    let el = this._closeListeners;
    if (!el) {
      el = this._closeListeners = [];
    }

    el.push(listener);
  }

  /**
   * Removes a close listener.
   *
   * @param {(error?: Error) => void} listener The listener to remove.
   * @return {boolean} A boolean indicating the success state.
   * @memberof HubClient
   */
  removeCloseListener(listener: (error?: Error) => void): boolean {
    const { _closeListeners } = this
    if (!_closeListeners) return false

    const index = _closeListeners.indexOf(listener)
    if (index < 0) return false

    _closeListeners.splice(index, 1)
    return true
  }

  /**
   * Adds a listener to be executed when the reconnection is made.
   * @param {(error?: Error) => void} listener The listener to add.
   */
  addReconnectListener(listener: (error?: Error) => void) {
    let el = this._reconnectListeners;
    if (!el) {
      el = this._reconnectListeners = [];
    }

    el.push(listener);
  }

  /**
   * Removes a reconnect listener.
   *
   * @param {(error?: Error) => void} listener The listener to remove.
   * @return {boolean} A boolean indicating the success state.
   * @memberof HubClient
   */
  removeReconnectListener(listener: (error?: Error) => void): boolean {
    const { _reconnectListeners } = this
    if (!_reconnectListeners) return false

    const index = _reconnectListeners.indexOf(listener)
    if (index < 0) return false

    _reconnectListeners.splice(index, 1)
    return true
  }

  /**
   * Adds a listener to be executed when the client is connected.
   * @param {(connectionId: string, isReconnect: boolean) => void} listener The listener to add.
   */
  addConnectListener(listener: (connectionId: string, isReconnect: boolean) => void) {
    let el = this._connectListeners;
    if (!el) {
      el = this._connectListeners = [];
    }

    el.push(listener);
  }

  /**
   * Removes a connect listener.
   *
   * @param {(connectId: string, isReconnect: boolean) => void} listener The listener to remove.
   * @return {boolean} A boolean indicating the success state.
   * @memberof HubClient
   */
  removeConnectListener(listener: (connectId: string, isReconnect: boolean) => void): boolean {
    const { _connectListeners } = this
    if (!_connectListeners) return false

    const index = _connectListeners.indexOf(listener)
    if (index < 0) return false

    _connectListeners.splice(index, 1)
    return true
  }

  /**
   * Adds a listener to be executed when the connection state is changed.
   * @param {(prev: HubConnectionState, curr: HubConnectionState) => void} listener The listener to add.
   */
  addConnectionChangeListener(listener: (prev: HubConnectionState, curr: HubConnectionState) => void) {
    let el = this._connectionListeners;
    if (!el) {
      el = this._connectionListeners = [];
    }

    el.push(listener);
  }

  /**
   * Removes a connection listener.
   *
   * @param {(prev: HubConnectionState, curr: HubConnectionState) => void} listener The listener to remove.
   * @return {boolean} A boolean indicating the success state.
   * @memberof HubClient
   */
  removeConnectionListener(listener: (prev: HubConnectionState, curr: HubConnectionState) => void): boolean {
    const { _connectionListeners } = this
    if (!_connectionListeners) return false

    const index = _connectionListeners.indexOf(listener)
    if (index < 0) return false
    _connectionListeners.splice(index, 1)
    return true
  }

  /**
   * Returns a subjects to stream values to the server.
   *
   * @param {string} methodName The name of the function on the server side.
   * @returns {Promise<Subject<T>>} A promise of subject to send values to the
   * server by using {@link Subject.next} and the {@link Subject.complete}
   * should be called when the stream is completed.
   */
  async upstream<T = any>(methodName: string): Promise<ManagedSubject<T> | undefined>;

  /**
   * Makes an uploading stream from client to the server.
   *
   * This function may have arbitrary numbers of parameters consisting of
   * the values for the parameter matching with the related server side function
   * and also functions which will have their first parameter as their generated
   * subjects.
   *
   * By using those functions, any subject may dynamically send its own value
   * to the server side while still using other non-subject parameters as well.
   *
   * @param {string} methodName The name of the function on the server side.
   * @param {((subjectGetter: Subject<T>) => void) | T} args Arguments array of
   * functions and values to pass to the server side function.
   */
  async upstream<T = any>(
    methodName: string,
    ...args: (T | ((subjectGetter: ManagedSubject<T>) => void))[]
  ): Promise<ManagedSubject<T> | undefined>;
  async upstream<T = any>(
    methodName: string,
    ...args: (T | ((subjectGetter: ManagedSubject<T>) => void))[]
  ): Promise<ManagedSubject<T> | undefined> {
    if (args.length === 0) {
      const [subject] = this.makeSubject<T>();
      return subject;
    }

    const normalizedArgs = [];
    for (const item of args) {
      if (typeof item === 'function') {
        const [subject, id] = this.makeSubject<T>();

        (item as Function)(subject);
        normalizedArgs.push(subject);
        normalizedArgs.push(id);
      } else {
        normalizedArgs.push(item);
      }
    }

    await this._connection.send(methodName, ...normalizedArgs);
  }

  /**
   * Returns a subject to stream values to the server.
   *
   * The subject will have timeout inside and will automatically complete the
   * stream if no value is emitted in given `timeoutMs` parameter.
   *
   * @param {string} methodName The name of the function on the server side.
   * @param {number} timeoutMs The timeout value for every step.
   * @returns {Promise<Subject<T>>} A promise of subject to send values to the
   * server by using {@link Subject.next} and the {@link Subject.complete}
   * should be called when the stream is completed. Additionally, if nothing
   * is sent to the server side in given `timeoutMs`, then the stream will
   * automatically be completed.
   */
  async upstreamWithTimeout<T = any>(methodName: string, timeoutMs: number = 10000): Promise<Subject<T>> {
    const [subject] = this.makeSubject();
    await this._connection.send(methodName, subject);

    let lastTimeoutId: any;

    function closeStream() {
      subject.complete();
    }

    return {
      next(value: T) {
        if (lastTimeoutId) {
          clearTimeout(lastTimeoutId);
        }

        lastTimeoutId = setTimeout(closeStream, timeoutMs);
        subject.next(value);
      },
      error(error: Error) {
        subject.error(error);
        if (lastTimeoutId) {
          clearTimeout(lastTimeoutId);
        }
      },
      complete() {
        if (lastTimeoutId) {
          clearTimeout(lastTimeoutId);
        }

        subject.complete();
      },
    } as Subject<T>;
  }

  /**
   * Invokes a streaming hub method on the server using the specified parameter.
   *
   * @typeparam T the type of the items returned by the server.
   * @param {StreamOpts<T>} param The parameters of the function describing the
   * invocation.
   *
   * @returns {{ dispose(): void }} A disposer function for the invocations.
   * @throws {Error} When no handler is set.
   * @throws {Error} When the method name is not given
   * @throws {Error} When the given parameters were not an iterable.
   */
  stream<T = any>(param: StreamOpts<T>): { dispose(): void };

  /** Invokes a streaming hub method on the server using the specified name and arguments.
   *
   * @typeparam T The type of the items returned by the server.
   * @param {string} methodName The name of the server method to invoke.
   * @param {any[]} args The arguments used to invoke the server method.
   * @returns {AsyncGenerator<T>} An async generator object where the values will be
   * the values emitted from the subscription, and the subscription is disposed automatically.
   */
  stream<T = any>(methodName: string, ...args: any[]): AsyncGenerator<T>;

  stream<T = any>(methodOrOptions: string | StreamOpts<T>, ...args: any[]) {
    let disposer: { dispose(): void };
    if (typeof methodOrOptions === 'string') {
      const handle = this._connection.stream<T>(methodOrOptions, ...args);

      let _resolve: (value: T) => void;
      let _reject: (err: Error) => void;
      let valuePromise = new Promise<T>((resolve, reject) => {
        _resolve = resolve;
        _reject = reject;
      });

      let valueGenerator: () => AsyncGenerator<T, void>;
      let _generator: AsyncGenerator<T, void>;
      valueGenerator = async function* _valueGenerator() {
        let condition = true;
        let isCompleted = false;
        const subscription = handle.subscribe({
          next(val) {
            _resolve(val);
          },
          complete() {
            isCompleted = true;
            _resolve(valueGenerator as any);
            _generator.return();
          },
          error(error) {
            _reject(error);
          },
        });

        while (condition) {
          const value = await valuePromise;
          if (isCompleted || (value as any) === _valueGenerator) {
            subscription.dispose();
            break;
          }

          yield value;

          if (isCompleted) break;

          valuePromise = new Promise<T>((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
          });
        }
      };

      return (_generator = valueGenerator());
    } else {
      const { args = [], complete, error, method, next } = methodOrOptions;
      if (!error && !next && !complete) {
        throw new Error('No handler is set');
      }

      if (!method) {
        throw new Error('Method is not given');
      }

      if (typeof args !== 'object' || args === null) {
        throw new Error(`The arguments for Method(${method}) were not an object`)
      }

      if (!(Symbol.iterator in args)) {
        throw new Error(`The arguments for Method(${method}) were not iterable`)
      }

      const handle = this._connection.stream<T>(method, ...args);
      disposer = handle.subscribe({
        closed: false,
        next: next!,
        error: error!,
        complete: complete!,
      });
    }

    return disposer;
  }

  /** Invokes a hub method on the server using the specified name and arguments.
   *
   * Does not wait for a response from the receiver.
   *
   * The Promise returned by this method resolves when the client has sent the invocation to the server.
   * The server may still be processing the invocation.
   *
   * @param {string} methodName The name of the server method to invoke.
   * @param {any[]} args The arguments used to invoke the server method.
   * @returns {Promise<boolean>} A Promise that resolves when the invocation has been
   * successfully sent, or rejects with an error.
   */
  async send(methodName: string, ...args: any[]): Promise<boolean> {
    if (this._connection) {
      await this._connection.send(methodName, ...args);
      return true;
    }

    return false;
  }

  /** Invokes a hub method on the server using the specified name and arguments.
   *
   * The {@link Promise} returned by this method resolves when the server indicates
   * it has finished invoking the method.
   *
   * When the promise resolves, the server has finished invoking the method.
   * If the server method returns a result, it is produced as the result of resolving the {@link Promise}.
   *
   * @typeparam T The expected return type.
   * @param {string} methodName The name of the server method to invoke.
   * @param {any[]} args The arguments used to invoke the server method.
   * @returns {Promise<T>} A {@link Promise} that resolves with the result of
   * the server method (if any), or rejects with an error.
   */
  invoke<T = any>(methodName: string, ...args: any[]): Promise<T> {
    if (this._connection) {
      return this._connection.invoke<T>(methodName, ...args);
    }

    return Promise.reject(new Error('The client is not connected'));
  }

  /** Registers a handler that will be invoked when the hub method with the specified method name is invoked.
   *
   * @param {string} methodName The name of the hub method to define.
   * @param {Function} newMethod The handler that will be raised when the hub method is invoked.
   * @returns {this} The instance itself to allow chaining.
   */
  on(methodName: string, newMethod: (...args: any[]) => void): HubClient {
    if (typeof this._connection === 'undefined') {
      if (!this._pendingMethods) {
        this._pendingMethods = new Map()
      }

      if (this._pendingMethods.has(methodName)) {
        this._pendingMethods.get(methodName)!.push(newMethod)
      }
      else {
        this._pendingMethods.set(methodName, [ newMethod ])
      }

      return this;
    }

    if (!this._methods) {
      this._methods = new Map();
    }

    if (this._methods.has(methodName)) {
      this._methods.get(methodName)!.push(newMethod)
    }
    else {
      this._methods.set(methodName, [ newMethod ])
    }

    this._connection.on(methodName, newMethod);
    return this;
  }

  /** Removes the specified handler for the specified hub method.
   *
   * You must pass the exact same Function instance as was previously passed to {@link HubClient.on}. Passing a
   * different instance (even if the function body is the same) will not remove the handler.
   *
   * @param {string} methodName  The name of the hub method to define.
   * @param {(...args: unknown[]) => void} [method] The method to remove.
   * @returns {this} The instance itself to allow chaining.
   */
  off(methodName: string, method?: (...args: unknown[]) => void): HubClient {
    if (this._connection) {
      this._connection.off(methodName, method!);
    }

    if (!this._methods) return this
    if (typeof method !== 'function') {
      this._methods.delete(methodName)
      return this
    }

    const methods = this._methods.get(methodName)
    if (!Array.isArray(methods)) return this

    const index = methods.indexOf(method)
    if (index >= 0) { methods.splice(index, 1) }

    return this;
  }

  private makeSubject<T>(): [ManagedSubject<T>, number] {
    const subject = new Subject<T>();
    const id = ++HubClient.SubjectId;

    let map = this._subjectIdMap;
    if (!map) {
      map = this._subjectIdMap = new Map()
    }

    let _stopped = false;
    const _subject: ManagedSubject<T> = {
      next(value) {
        if (_stopped) {
          throw new Error('Subject has stopped');
        }

        subject.next(value);
      },
      error(error) {
        subject.error(error);
      },
      complete() {
        subject.complete();
      },
      subscribe(observer) {
        return subject.subscribe(observer);
      },
      id,
      get isStopped() {
        return _stopped;
      },
      stop() {
        if (_stopped) {
          return false;
        }

        _stopped = true;
        const fun = _subject.onStop;
        if (typeof fun === 'function') {
          fun(id);
        }

        map.delete(id)
        return true;
      },
    };

    //@ts-ignore
    map[id] = _subject;
    return [_subject, id];
  }

  private onClose(e?: Error) {
    let el: any = this._errorListeners;
    if (el) {
      for (const listener of el) {
        listener(e);
      }

      el = this._closeListeners;
      if (el) {
        for (const listener of el) {
          listener(e);
        }
      }
    } else if ((el = this._closeListeners)) {
      for (const listener of el) {
        listener(void 0);
      }
    }

    this.changeConnectionState(HubConnectionState.Disconnected);
    this._initialized = false;
  }

  private onReconnecting(e?: Error) {
    const rl = this._reconnectListeners;
    if (rl) {
      for (const listener of rl) {
        listener(e);
      }
    }

    this.changeConnectionState(HubConnectionState.Connecting);
  }

  private onReconnected(id?: string) {
    const cl = this._connectListeners;
    if (cl) {
      for (const listener of cl) {
        listener(id!, true);
      }
    }

    this.changeConnectionState(HubConnectionState.Connected);
    this._initialized = true;

    if (!this._pendingMethods) return;
    this._pendingMethods.forEach((handlers, key) => {
      handlers.forEach(handler => {
        this._connection.on(key, handler)
      })
    })

    this._pendingMethods = undefined;
  }

  private changeConnectionState(to: HubConnectionState) {
    const cl = this._connectionListeners;
    if (!cl) {
      return false;
    }
    for (const listener of cl) {
      listener(this._currentState, to);
    }

    this._currentState = to;
    return true;
  }
}
