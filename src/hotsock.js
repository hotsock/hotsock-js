/**
 * HotsockClient is the main class that should be used by clients to initialize
 * connections and event handlers to a Hotsock installation.
 *
 * @class
 * @constructor
 * @public
 */
export class HotsockClient {
  /**
   * The wss:// URL for WebSocket connections (read-only).
   *
   * @private
   * @returns {string} The WebSocket URL.
   */
  get webSocketUrl() {
    return this.#webSocketUrl
  }

  /** @private @type {string} **/
  #webSocketUrl

  /**
   * A function that returns a JWT that is authorized to connect to the
   * WebSocket (read-only).
   *
   * @readonly
   * @returns {LoadTokenFn} The function to load the connection token.
   */
  get connectTokenFn() {
    return this.#connectTokenFn
  }

  /** @private @type {LoadTokenFn} **/
  #connectTokenFn

  /**
   * The maximum number of times to call the `connectTokenFn` when trying to
   * obtain a connection JWT.
   */
  get connectTokenFnMaxAttempts() {
    return this.#connectTokenFnMaxAttempts
  }

  /** @private @type {number} **/
  #connectTokenFnMaxAttempts

  /**
   * The client event bindings for this instance as bound with `bind`/`unbind`
   * (read-only). This map stores event bindings, with the event names (strings
   * or RegExp objects) as keys and arrays of Binding objects as values.
   *
   * @readonly
   * @returns {Map<string | RegExp, Array<Binding>>} The client event bindings.
   */
  get clientEventBindings() {
    return this.#clientEventBindings
  }

  /** @private @type {Map<string | RegExp, Array<Binding>>} */
  #clientEventBindings = new Map()

  /**
   * The channel event bindings for this instance (read-only). This object
   * stores event bindings for each channel, with channel names (strings) as
   * keys and arrays of Binding objects as values.
   *
   * @readonly
   * @returns {Object.<string, Array<Binding>>} The channel event bindings.
   */
  get channelEventBindings() {
    return this.#channelEventBindings
  }

  /** @private @type {Object.<string, Array<Binding>>} */
  #channelEventBindings = {}

  /**
   * The currently active WebSocket connection (read-only).
   *
   * @readonly
   * @returns {Connection} The active connection object
   */
  get activeConnection() {
    return this.#activeConnection
  }

  /** @private @type {Connection=} */
  #activeConnection = null

  /**
   * The client logger (read-only).
   *
   * @readonly
   * @returns {Logger} The client logger
   */
  get logger() {
    return this.#logger
  }

  /** @private @type {Logger} */
  #logger = null

  /**
   * Construct a new Hotsock client instance.
   *
   * @param {string} webSocketUrl The wss:// URL for WebSocket connections.
   * This can be obtained from your installation's `WebSocketsAPIWebSocketURL`
   * CloudFormation stack output.
   * @param {object} options
   * @param {LoadTokenFn} [options.connectTokenFn] A function that returns a
   * JWT that is authorized to connect to the WebSocket. This function may be
   * called multiple times - once for the initial connection and again ahead of
   * any reconnect attempts.
   * @param {number} [options.connectTokenFnMaxAttempts] The number of times to
   * attempt loading the connect JWT by calling `connectTokenFn`. Defaults to
   * 2. Each attempt has a backoff wait that is 500ms longer than the previous
   * attempt.
   * @param {boolean} [options.lazyConnection] If true, a connection will not
   * attempt to be established until there's an attempt to subscribe to a
   * channel. This is particularly useful when you use a single global
   * HotsockClient object that is initialized early on the page, but where the
   * page may not have any subscriptions and you don't need to track the
   * connection itself.
   * @param {Logger} [options.logger] The custom logger to use.
   * @param {string} [options.logLevel] The log level to use on the default
   * logger.
   * @throws {InvalidArgumentError | TypeError} If required parameters are
   * invalid.
   */
  constructor(
    webSocketUrl,
    {
      connectTokenFn,
      connectTokenFnMaxAttempts = 2,
      lazyConnection = false,
      logger,
      logLevel = "warn",
    } = {}
  ) {
    if (!webSocketUrl || webSocketUrl === "") {
      throw new InvalidArgumentError("webSocketUrl must be provided")
    }

    this.#webSocketUrl = webSocketUrl

    if (typeof connectTokenFn !== "function") {
      throw new TypeError("connectTokenFn must be a function")
    }

    this.#connectTokenFn = connectTokenFn
    this.#connectTokenFnMaxAttempts = connectTokenFnMaxAttempts

    this.#logger = this.#createLogger(logLevel)
    if (logger) {
      this.#logger = logger
    }

    this.#activeConnection = new Connection(this, lazyConnection)
  }

  /**
   * Creates the default Hotsock console logger
   *
   * @param {string} initialLevel
   * @returns {Logger}
   */
  #createLogger(initialLevel) {
    const levels = {
      trace: 0,
      debug: 1,
      info: 2,
      warn: 3,
      error: 4,
      silent: 5,
    }

    let currentLevel = levels[initialLevel]

    function log(level, ...args) {
      if (levels[level] >= currentLevel) {
        console[level](...args)
      }
    }

    return {
      setLevel(level) {
        if (levels[level] !== undefined) {
          currentLevel = levels[level]
        }
      },

      trace(...args) {
        log("trace", ...args)
      },

      debug(...args) {
        log("debug", ...args)
      },

      info(...args) {
        log("info", ...args)
      },

      warn(...args) {
        log("warn", ...args)
      },

      error(...args) {
        log("error", ...args)
      },
    }
  }

  /**
   * Bind a callback function to an event.
   *
   * @public
   * @param {string | RegExp} event The name of the event or a RegExp object
   * pattern to bind the callback to. Special client-level events are prefixed
   * with "@@" and include "@@connect", "@@disconnect", "@@message",
   * "@@messageSent", "@@error". All other events come from WebSocket messages
   * on channels. If an event is supplied without the optional
   * `options.channel`, it binds the callback to this event on all channels but
   * will not attempt subscribing to a channel.
   * @param {MessageHandlerFn} messageFn The function that will be called when
   * a matching event is received. This function must take one argument - an
   * Object containing the message received.
   * @param {object} options
   * @param {string} [options.channel] The name of the channel to subscribe
   * to. `messageFn` will also be bound to both this channel name and
   * `event`. Specifying a channel name will automatically handle
   * subscribing to the channel if it's not already subscribed.
   * @param {LoadTokenFn} [options.subscribeTokenFn] A function that returns a
   * JWT that authorizes subscribing to this channel. This function
   * may be called multiple times - once for the initial subscribe and again
   * ahead of any re-subscribe attempts. `subscribeTokenFn` is optional since
   * the connect token often grants channel subscription permission.
   * @returns {Binding} The bound event object.
   */
  bind = (event, messageFn, { channel, subscribeTokenFn } = {}) => {
    if (typeof messageFn !== "function") {
      throw new TypeError("messageFn must be a function")
    }

    const binding = new Binding(this, event, {
      channel,
      unbindFn: () => this.unbind(event, { messageFn, channel }),
      messageFn,
      subscribeTokenFn,
    })

    if (channel) {
      this.#logger.debug(`[hotsock] bind "${event}" on "${channel}"`)

      this.#channelEventBindings[channel] ||= []
      this.#channelEventBindings[channel].push(binding)

      this.#activeConnection.manageSubscriptions()

      return binding
    }

    let bindings = this.#clientEventBindings.get(event)
    if (!bindings) {
      bindings = []
      this.#clientEventBindings.set(event, bindings)
    }

    this.#logger.debug(`[hotsock] bind "${event}" client-wide`)
    bindings.push(binding)

    return binding
  }

  /**
   * Unbind the given callback function from an event. Attempting to unbind
   * non-existent callbacks from valid or invalid events is a no-op.
   *
   * @public
   * @param {string | RegExp} event The name of the event or the RegExp object
   * to unbind the callback from.
   * @param {object} options
   * @param {function} [options.messageFn] The specific function to remove as a
   * callback. If no function is supplied or it's null, all messageFn callbacks
   * for the supplied channel and event will be removed.
   * @param {string} [options.channel] The name of the channel to
   * unsubscribe from.
   * @returns {void}
   */
  unbind = (event, { messageFn, channel } = {}) => {
    if (channel) {
      let filterFn = (binding) => binding.event !== event
      if (messageFn) {
        filterFn = (binding) =>
          binding.event !== event || binding.messageFn !== messageFn
      }

      this.#logger.debug(`[hotsock] unbind "${event}" from "${channel}"`)
      this.#channelEventBindings[channel] ||= []
      this.#channelEventBindings[channel] =
        this.#channelEventBindings[channel].filter(filterFn)

      this.#activeConnection.manageSubscriptions()
      return
    }

    this.#logger.debug(`[hotsock] unbind "${event}" client-wide`)
    this.#clientEventBindings.forEach((bindings, key) => {
      if (
        (typeof key === "string" && key === event) ||
        (key instanceof RegExp && key.test(event))
      ) {
        if (messageFn) {
          // Remove only the specific callback function
          const index = bindings.findIndex(
            (binding) => binding.messageFn === messageFn
          )
          if (index > -1) {
            bindings.splice(index, 1)
          }
        } else {
          // Remove all callbacks for this event
          this.#clientEventBindings.delete(key)
        }
      }
    })

    // Clean up: remove entries with no callbacks
    this.#clientEventBindings.forEach((bindings, key) => {
      if (bindings.length === 0) {
        this.#clientEventBindings.delete(key)
      }
    })
  }

  /**
   * Returns a channel object given a channel name. Provides an interface for
   * binding/unbinding events, accessing metadata, and sending messages within
   * the context of a channel.
   *
   * @public
   * @param {string} channel The channel name
   * @returns {Channel}
   */
  channels = (channel) => new Channel(this, channel)

  /**
   * Send a message to the WebSocket on the specified channel. The
   * connection or channel subscription must be be pre-authorized with
   * "publish" access for this to succeed.
   *
   * @public
   * @param {string} event The name of the event to send.
   * @param {object} options
   * @param {string=} [options.channel] The name of the channel to send the
   * message to.
   * @param {JsonSerializable} [options.data] The message data.
   * @returns {void}
   * @throws {InvalidArgumentError} If required parameters are invalid.
   */
  sendMessage = (event, { channel, data } = {}) => {
    if (!event || event === "") {
      throw new InvalidArgumentError("event must be provided")
    }

    this.sendRawMessage(JSON.stringify({ channel, event, data }))
  }

  /**
   * Suspend the WebSocket connection by disconnecting while retaining event
   * handler bindings. If reconnected, all subscriptions will attempt to
   * resubscribe and events will resume firing.
   *
   * @public
   */
  suspend = () => {
    this.#activeConnection?.close()
  }

  /**
   * Resume the suspended WebSocket connection, re-subscribing to all channels.
   *
   * @public
   */
  resume = () => {
    if (this.#activeConnection?.ws.readyState === 1 /* 1 = OPEN */) return
    this.#activeConnection = new Connection(this)
  }

  /**
   * Reconnect with backoff + jitter
   */
  reconnectWithBackoff = () => {
    const maxBackoffDelay = 20000 // 20 seconds
    let backoffDelay = 1000 // 1 second (initial)

    const connect = async () => {
      try {
        this.#activeConnection = new Connection(this)
        await this.#activeConnection.initializationComplete()

        // Resubscribe to all channels
        this.#activeConnection.manageSubscriptions()
      } catch (error) {
        this.logger.warn("[hotsock] reconnect attempt failed:", error)
        setTimeout(() => {
          const jitter = Math.random() * 1000 // Add jitter up to 1 second
          backoffDelay = Math.min(backoffDelay * 1.5 + jitter, maxBackoffDelay)
          connect()
        }, backoffDelay)
      }
    }

    connect()
  }

  /**
   * Terminate disconnects from the WebSocket and clears all event bindings
   * from this client. Reconnecting with this instance will require re-binding
   * to client events and re-subscribing to channel events.
   *
   * @public
   */
  terminate = () => {
    if (this.#activeConnection) {
      this.#activeConnection.clearClientBindingsOnClose = true
      this.#activeConnection.close()
    }
  }

  /**
   * Send a raw message on the active WebSocket connection.
   *
   * @public
   * @param {string} message The message to send on the WebSocket.
   */
  sendRawMessage = (message) => {
    try {
      this.#activeConnection.sendMessage(message)
    } catch (_error) {
      throw "no WebSocket connection available to send message"
    }
  }

  /**
   * Clear all bindings on this client
   *
   * @private
   */
  clearBindings = () => {
    this.#clientEventBindings = new Map()
    this.#channelEventBindings = {}
  }
}

/**
 * Connection holds a single Hotsock WebSocket connection.
 *
 * @class
 * @constructor
 * @private
 */
class Connection {
  /**
   * The parent Hotsock client instance (read-only).
   *
   * @readonly
   * @returns {HotsockClient} The parent Hotsock client instance.
   */
  get client() {
    return this.#client
  }

  /** @private @type {HotsockClient} */
  #client

  /**
   * If true, the WebSocket connection will not attempt to be established until
   * the first client or channel binding is created.
   * @private
   * @type {boolean}
   */
  #lazy

  /**
   * A promise that is resolved when a server-provided connection ID is known
   * for this connection. This ID is sent in the "hotsock.connected" payload
   * upon a successful connection.
   *
   * @private
   * @type {Promise}
   */
  #connectionIdPromise

  /**
   * @private
   * @type {Promise}
   */
  #resolveConnectionIdPromise

  /**
   * The server-provided connection ID (read-only).
   *
   * @readonly
   * @returns {string=}
   */
  get connectionId() {
    return this.#connectionId
  }

  /** @private @type {string=} */
  #connectionId

  /** @private @type {string} */
  get #connectionIdLogDescription() {
    if (!this.#connectionId) {
      return "<unknown id>"
    }
    return this.#connectionId
  }

  /**
   * Sets the API Gateway connection ID for this connection and resolves the
   * promise that indicates we've received an ID.
   *
   * @private
   * @param {string} value
   */
  #setConnectionId(value) {
    this.#connectionId = value
    if (this.#resolveConnectionIdPromise) {
      this.#resolveConnectionIdPromise(value)
    }
    this.#client.logger.debug(
      `[hotsock] connection id set to "${this.#connectionIdLogDescription}"`
    )
  }

  /**
   * The user ID (uid) for the current user of this connection (read-only).
   *
   * @readonly
   * @returns {string=}
   */
  get uid() {
    return this.#uid
  }

  /** @private @type {string=} */
  #uid

  /**
   * The user metadata (umd) for the current user of this connection
   * (read-only).
   *
   * @readonly
   * @returns {JsonSerializable}
   */
  get umd() {
    return this.#umd
  }

  /** @private @type {JsonSerializable} */
  #umd

  /**
   * The current state of channel subscriptions on this connection. Each key in
   * this object is a channel name, and the value is an object that describes
   * the subscription state and additional properties of that channel.
   *
   * @type {Object.<string, ConnectionChannel>}
   * @public
   */
  channels = {}

  /**
   * The underlying WebSocket object for this connection (read-only).
   *
   * @readonly
   * @returns {WebSocket} The WebSocket object
   */
  get ws() {
    return this.#ws
  }

  /** @type {WebSocket} @private */
  #ws

  /**
   * The interval identifier controlling the periodic subscribe loop.
   *
   * @type {number}
   * @private
   */
  #subscribeLoopInterval

  /**
   * Whether or not the connection should attempt to reconnect automatically.
   * This is true, except when a connection is closed intentionally with
   * close().
   *
   * @type {boolean}
   * @private
   */
  #autoReconnect = true

  /**
   * @type {Promise}
   * @private
   */
  #initializePromise

  /**
   * @param {HotsockClient} client
   * @param {boolean} lazy
   */
  constructor(client, lazy = false) {
    this.#client = client
    this.#lazy = lazy

    this.#connectionIdPromise = new Promise((resolve) => {
      this.#resolveConnectionIdPromise = resolve
    })

    if (this.#lazy) {
      this.#client.logger.debug(
        "[hotsock] lazy connect enabled, waiting for channel binding to establish connection"
      )
      return
    }

    this.#initializePromise = this.initialize()
  }

  /**
   * Async initializer only ever called at the end of the constructor.
   *
   * @private
   * @async
   */
  async initialize() {
    const token = await this.loadTokenWithRetry(
      this.#client.connectTokenFn,
      this.#client.connectTokenFnMaxAttempts
    )

    this.#client.logger.debug(
      `[hotsock] connecting to "${
        this.#client.webSocketUrl
      }" with token "${token}"`
    )

    this.#ws = new WebSocket(`${this.#client.webSocketUrl}?token=${token}`)
    this.#ws.onerror = this.onerror
    this.#ws.onopen = this.onopen
    this.#ws.onclose = this.onclose
    this.#ws.onmessage = this.onmessage
  }

  /**
   * Allows awaiting the WebSocket initialize call. Does not await the
   * actual WebSocket connection being opened. Primarily used for tests.
   *
   * @private
   */
  initializationComplete = () => {
    return this.#initializePromise
  }

  /**
   * Wait for the connection ID to be received from the hotsock.connected
   * message before continuing.
   *
   * @private
   * @async
   */
  async waitForConnectionId() {
    if (this.#connectionId !== undefined) {
      return this.#connectionId
    }
    return this.#connectionIdPromise
  }

  /**
   * Send a raw message on the WebSocket connection.  If sending is successful,
   * notify any subscribers of the `@@messageSent` event with the raw message.
   *
   * The call to the WebSocket send() can throw an error if unsuccessful, which
   * prevents client bindings on "@@messagesSent" from being published if it
   * isn't actually sent.
   *
   * @private
   * @param {string | ArrayBufferLike | Blob | ArrayBufferView} message
   */
  sendMessage = (message) => {
    this.#client.logger.debug(
      `[hotsock] connection "${this.#connectionIdLogDescription}" send message`,
      message
    )

    this.#ws.send(message)

    const bindings = this.#client.clientEventBindings.get("@@messageSent") || []
    bindings.forEach(({ messageFn }) => messageFn(message))
  }

  /**
   * Close this connection's WebSocket connection. Since this is only ever
   * called intentionally, auto-reconnect is disabled.
   *
   * @private
   */
  close() {
    this.#autoReconnect = false
    this.#ws.close()
  }

  /**
   * This is called when a WebSocket-level error occurs. It is not called for
   * Hotsock-level errors - those are called via onmessage with the
   * "hotsock.error" event.
   *
   * @private
   * @param {Event} wsEvent
   */
  onerror = (wsEvent) => {
    const clientBindings = this.#client.clientEventBindings.get("@@error") || []
    clientBindings.forEach(({ messageFn }) => messageFn(wsEvent))
  }

  /**
   * Called when the WebSocket connection is opened.
   *
   * @private
   * @param {Event} wsEvent
   */
  onopen = (wsEvent) => {
    this.#client.logger.debug("[hotsock] connection successful")

    this.startSubscriptionManagementLoop()

    const clientBindings =
      this.#client.clientEventBindings.get("@@connect") || []
    clientBindings.forEach(({ messageFn }) => messageFn(wsEvent))
  }

  /**
   * Called when the WebSocket connection is closed.
   *
   * @private
   * @param {Event} wsEvent
   */
  onclose = (wsEvent) => {
    this.#client.logger.debug(
      `[hotsock] connection "${this.#connectionIdLogDescription}" disconnected`
    )

    this.channels = {}
    this.stopSubscribeLoop()

    const clientBindings =
      this.#client.clientEventBindings.get("@@disconnect") || []
    clientBindings.forEach(({ messageFn }) => messageFn(wsEvent))

    if (this.clearClientBindingsOnClose) {
      this.#client.clearBindings()
      this.clearClientBindingsOnClose = false
    }

    if (!this.#autoReconnect) return

    this.#client.reconnectWithBackoff()
  }

  /**
   * Called whenever any message is received on the WebSocket connection.
   *
   * @private
   * @param {Event} wsEvent
   */
  onmessage = (wsEvent) => {
    this.#client.logger.debug(
      `[hotsock] connection "${
        this.#connectionIdLogDescription
      }" received message`,
      wsEvent.data
    )

    const clientBindings =
      this.#client.clientEventBindings.get("@@message") || []
    clientBindings.forEach(({ messageFn }) => messageFn(wsEvent))

    const message = JSON.parse(wsEvent.data)
    const { channel, data, event, error } = message

    switch (event) {
      case "hotsock.connected":
        this.#uid = message.meta.uid
        this.#umd = message.meta.umd
        this.#setConnectionId(message.data.connectionId)
        break
      case "hotsock.subscribed":
        const uid = message.meta.uid || this.#uid
        const umd = message.meta.umd || this.#umd
        this.channels[channel] ||= new ConnectionChannel(channel)
        this.channels[channel].uid = uid
        this.channels[channel].umd = umd
        this.channels[channel].members = data.members || []
        this.channels[channel].state = "subscribeConfirmed"
        break
      case "hotsock.unsubscribed":
        this.channels[channel] ||= new ConnectionChannel(channel)
        this.channels[channel].uid = null
        this.channels[channel].umd = null
        this.channels[channel].members = []
        this.channels[channel].state = "unsubscribeConfirmed"
        break
      case "hotsock.memberAdded":
        this.channels[channel] ||= new ConnectionChannel(channel)
        this.channels[channel].members = data.members
        break
      case "hotsock.memberRemoved":
        this.channels[channel] ||= new ConnectionChannel(channel)
        this.channels[channel].members = data.members
        break
      case "hotsock.ping":
        this.sendMessage(`{"event":"hotsock.pong"}`)
        break
      case "hotsock.error":
        switch (error?.code) {
          case "NOT_SUBSCRIBED":
            this.channels[channel] ||= new ConnectionChannel(channel)
            this.channels[channel].state = "unsubscribeConfirmed"
            break
          case "ALREADY_SUBSCRIBED":
            this.channels[channel] ||= new ConnectionChannel(channel)
            this.channels[channel].state = "subscribeConfirmed"
            break
          case "SUBSCRIBE_PERMISSION_DENIED":
            this.channels[channel] ||= new ConnectionChannel(channel)
            this.channels[channel].state = "subscribeFailed"
            break
          case "INVALID_SUBSCRIBE_TOKEN":
            this.channels[channel] ||= new ConnectionChannel(channel)
            this.channels[channel].state = "subscribeFailed"
            break
        }
        break
    }

    this.#client.clientEventBindings.forEach((bindings, eventNameOrPattern) => {
      if (eventNameOrPattern instanceof RegExp) {
        if (eventNameOrPattern.test(event)) {
          bindings.forEach((binding) => binding.messageFn(message))
        }
        return
      }

      if (eventNameOrPattern === event) {
        bindings.forEach((binding) => binding.messageFn(message))
      }
    })

    const channelBindings = this.#client.channelEventBindings[channel] || []
    channelBindings.forEach((binding) => {
      if (binding.event instanceof RegExp) {
        if (binding.event.test(event)) {
          binding.messageFn(message)
        }
        return
      }

      if (binding.event === event) {
        binding.messageFn(message)
      }
    })
  }

  /**
   * Runs manageSubscriptions() on this connection every 250ms.
   *
   * @private
   */
  startSubscriptionManagementLoop = () => {
    if (typeof global !== "undefined" && global?.runner === "test") {
      // Not ideal, but by default when testing we'll just call
      // manageSubscriptions() once instead of actually creating a loop because
      // Jest gets mad about the existence of the infinite setInterval loop.
      this.manageSubscriptions()
      return
    }

    this.#subscribeLoopInterval = setInterval(() => {
      this.manageSubscriptions()
    }, 250)
  }

  /**
   * Stop the running subscribe loop.
   *
   * @private
   */
  stopSubscribeLoop = () => {
    clearInterval(this.#subscribeLoopInterval)
    this.#subscribeLoopInterval = null
  }

  /**
   * Subscribe to or unsubscribe from any desired channels based on the state
   * of event bindings and existing channel subscriptions.
   *
   * @private
   */
  manageSubscriptions = () => {
    if (this.#lazy && !this.#ws) {
      this.#initializePromise = this.initialize()
      this.#lazy = false
    }

    if (this.#ws?.readyState !== 1 /* 1 = OPEN */) return

    // Unsubscribe from channels that are no longer bound but still have a
    // subscription state.
    const unsubscribeableStates = ["subscribeConfirmed", "subscribePending"]
    let unsubscribedChannels = []
    Object.keys(this.channels).forEach((channel) => {
      if (
        (this.#client.channelEventBindings[channel] || []).length === 0 &&
        unsubscribeableStates.includes(this.channels[channel]?.state)
      ) {
        unsubscribedChannels.push(channel)
        this.unsubscribe(channel)
      }
    })

    // Subscribe to channels that have bindings but are not yet in the process
    // of subscribing or already subscribed.
    const subscribeableStates = [
      undefined,
      "unsubscribeConfirmed",
      "unsubscribePending",
    ]
    Object.entries(this.#client.channelEventBindings).forEach(
      ([channel, bindings]) => {
        const state = this.channels[channel]?.state
        if (
          bindings.length !== 0 &&
          subscribeableStates.includes(state) &&
          !unsubscribedChannels.includes(channel)
        ) {
          const bindingWithSubscribeFn = bindings.find(
            (binding) => typeof binding.subscribeTokenFn === "function"
          )
          const subscribeTokenFn = bindingWithSubscribeFn
            ? bindingWithSubscribeFn.subscribeTokenFn
            : undefined
          this.subscribe(channel, { subscribeTokenFn })
        }
      }
    )
  }

  /**
   * Subscribe this WebSocket connection to a channel.
   *
   * @private
   * @param {string} channel The channel to subscribe to.
   * @param {Object} options
   * @param {LoadTokenFn} [options.subscribeTokenFn] The token function to be
   * called to authorize the channel subscription when binding/rebinding.
   * @param {number} [options.subscribeTokenMaxAttempts] The maximum number of
   * times to attempt to call `subscribeTokenFn` to load the subscribe token.
   * Defaults to 2.
   */
  subscribe = async (
    channel,
    { subscribeTokenFn, subscribeTokenMaxAttempts = 2 } = {}
  ) => {
    this.#client.logger.debug(`[hotsock] subscribing to "${channel}"`)
    this.channels[channel] ||= new ConnectionChannel(channel)
    this.channels[channel].state = "subscribePending"

    let data

    if (subscribeTokenFn) {
      const connectionId = await this.waitForConnectionId()

      try {
        const token = await this.loadTokenWithRetry(
          () => subscribeTokenFn({ channel, connectionId }),
          subscribeTokenMaxAttempts
        )
        data = { token }
      } catch (error) {
        this.#client.logger.error(
          "[hotsock] failed to load subscribe token:",
          error
        )
        this.channels[channel].state = "subscribeFailed"
        return
      }
    }

    try {
      this.sendMessage(
        JSON.stringify({ event: "hotsock.subscribe", channel, data })
      )
    } catch (err) {
      this.channels[channel].state = "subscribeFailed"
      throw err
    }

    return this.channels[channel]
  }

  /**
   * Unsubscribe this WebSocket connection from a channel.
   *
   * @private
   * @param {string} channel The channel to unsubscribe from.
   */
  unsubscribe = (channel) => {
    this.#client.logger.debug(`[hotsock] unsubscribing from "${channel}"`)
    this.sendMessage(JSON.stringify({ event: "hotsock.unsubscribe", channel }))

    this.channels[channel] ||= new ConnectionChannel(channel)
    this.channels[channel].state = "unsubscribePending"

    return this.channels[channel]
  }

  /** @private */
  looksLikeJWT = (token) => {
    return (
      typeof token === "string" &&
      /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*$/.test(token)
    )
  }

  /**
   * @private
   * @param {LoadTokenFn} tokenFn
   * @param {number} maxAttempts
   */
  loadTokenWithRetry = async (tokenFn, maxAttempts) => {
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        const token = await tokenFn()

        if (token) {
          if (this.looksLikeJWT(token)) {
            return token
          } else {
            throw new Error(
              "Invalid token format: token returned by function must be a valid JWT string"
            )
          }
        }
      } catch (error) {
        this.#client.logger.warn(
          `[hotsock] attempt ${attempts + 1} to get token failed:`,
          error
        )
      }

      attempts++
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempts))
      }
    }

    throw new Error("Failed to load token after maximum attempts")
  }
}

/**
 * Information about a channel subscription on a connection. There can be many
 * bindings on a channel, but there will only ever be one of these per channel
 * on a connection.
 *
 * - `members`: The list of members who are currently in the channel (only populated for presence channels)
 * - `state`: Describes the subscription state with the following possible values:
 *   - 'subscribePending': The subscription request has been sent to the server, and the client is awaiting confirmation.
 *   - 'subscribeConfirmed': The server has confirmed the subscription, and the channel is actively subscribed.
 *   - 'subscribeFailed': The subscription process has encountered a failure.
 *   - 'unsubscribePending': Awaiting server confirmation for unsubscription.
 *   - 'unsubscribeConfirmed': The server has confirmed the unsubscription.
 *   - 'unsubscribeFailed': The unsubscription process has failed.
 * - `uid`: A unique identifier for the user (string or undefined).
 * - `umd`: User metadata which can be any value representable in JSON (object, array, string, number, boolean, or null).
 *
 * @class
 * @constructor
 * @private
 */
class ConnectionChannel {
  /** @public @type {Array} */
  members

  /** @private @type {string} */
  name

  /**
   * @package
   * @type {'subscribePending' | 'subscribeConfirmed' | 'subscribeFailed' | 'unsubscribePending' | 'unsubscribeConfirmed' | 'unsubscribeFailed' | undefined}
   * */
  state

  /** @public @type {string=} */
  uid

  /** @public @type {JsonSerializable} */
  umd

  constructor(name) {
    this.name = name
    this.members = []
  }
}

/**
 * A Channel object allows binding/unbinding events scoped to a channel.
 *
 * @class
 * @constructor
 * @private
 */
class Channel {
  /**
   * @param {HotsockClient} client The parent Hotsock client
   * @param {string} name The name of the channel
   */
  constructor(client, name) {
    this.#client = client
    this.#name = name
  }

  /** @private @type {HotsockClient} */
  #client

  /** @private @type {string=} */
  #name

  /**
   * The token function to be called to authorize the channel subscription when
   * binding/rebinding. If set, any channel subscribe attempts will call this
   * function to fetch a token. If unset, it's assumed that the connection
   * already has the required permissions to subscribe.
   *
   * @public
   * @type {LoadTokenFn}
   * */
  subscribeTokenFn

  /**
   * Bind a callback function to an event on this channel.
   *
   * @param {string | RegExp} event The name of the event or a RegExp object
   * pattern to bind the callback to.
   * @param {MessageHandlerFn} messageFn The function that will be called when
   * a matching event is received. This function must take one argument - an
   * Object containing the message received.
   * @returns {Binding} The bound event object.
   */
  bind = (event, messageFn) => {
    return this.#client.bind(event, messageFn, {
      channel: this.#name,
      subscribeTokenFn: this.subscribeTokenFn,
    })
  }

  /**
   * Unbind the given callback function from an event. Attempting to unbind
   * non-existent callbacks from valid or invalid events is a no-op.
   *
   * @public
   * @param {string | RegExp} event The name of the event or the RegExp object
   * to unbind the callback from.
   * @param {object} options
   * @param {function} [options.messageFn] The specific function to remove as a
   * callback. If no function is supplied or it's null, all messageFn callbacks
   * on this channel and event will be removed.
   * @returns {void}
   */
  unbind = (event, { messageFn }) => {
    return this.#client.unbind(event, { channel: this.#name, messageFn })
  }

  /**
   * Send a message to the WebSocket on this channel. The connection or channel
   * subscription must be be pre-authorized with "publish" access for this to
   * succeed.
   *
   * @public
   * @param {string} event The name of the event to send.
   * @param {object} options
   * @param {JsonSerializable} [options.data] The message data.
   * @returns {void}
   * @throws {InvalidArgumentError} If required parameters are invalid.
   */
  sendMessage = (event, { data } = {}) => {
    return this.#client.sendMessage(event, { channel: this.#name, data })
  }

  /**
   * User ID as represented in the subscription to this channel, if subscribed
   * and if `uid` has a value.
   *
   * @public
   */
  get uid() {
    return this.#connectionChannel?.uid
  }

  /**
   * User metadata represented in the subscription to this channel, if
   * subscribed and if `umd` has a value.
   *
   * @public
   */
  get umd() {
    return this.#connectionChannel?.umd
  }

  /** Members in this channel. @public */
  get members() {
    return this.#connectionChannel?.members || []
  }

  /** @private @returns {ConnectionChannel} */
  get #connectionChannel() {
    return this.#client?.activeConnection?.channels?.[this.#name]
  }
}

/**
 * Binding holds state of an event binding.
 *
 * @class
 * @constructor
 * @private
 */
class Binding {
  /**
   * @param {HotsockClient} client The parent Hotsock client
   * @param {string | RegExp} event The name of the event to bind
   * @param {Object} options
   * @param {string=} options.channel The name of the channel to bind
   * @param {function} options.unbindFn The function that can be called to remove
   * the event binding.
   * @param {MessageHandlerFn} options.messageFn The the function bound to be called
   * with a message.
   * @param {LoadTokenFn} options.subscribeTokenFn The token function to be called
   * to authorize the channel subscription when binding/rebinding.
   */
  constructor(
    client,
    event,
    { channel, unbindFn, messageFn, subscribeTokenFn }
  ) {
    this.#client = client
    this.#channel = channel
    this.#event = event
    this.#unbindFn = unbindFn
    this.#messageFn = messageFn
    this.#subscribeTokenFn = subscribeTokenFn
  }

  /** @private @type {HotsockClient} */
  #client

  /** @private @type {string=} */
  #channel

  /** @private @type {string | RegExp} */
  #event

  /** @private @type {MessageHandlerFn} */
  #messageFn

  /** @private @type {function} */
  #unbindFn

  /** @private @type {LoadTokenFn} */
  #subscribeTokenFn

  /**
   * Remove this event binding.
   *
   * @public
   */
  unbind = () => this.#unbindFn()

  /**
   * Information about the channel for this binding.
   *
   * @public
   * @returns {ConnectionChannel=} The bound channel object. Not all bindings
   * are tied to a specific channel. In that case this will return undefined.
   */
  get channel() {
    if (!this.#channel) {
      return
    }
    return this.#client.activeConnection.channels[this.#channel]
  }

  /**
   * @public
   * @returns {string} The bound event
   */
  get event() {
    return this.#event
  }

  /**
   * @private
   * @returns {MessageHandlerFn} The message handler callback function
   */
  get messageFn() {
    return this.#messageFn
  }

  /**
   * @private
   * @returns {LoadTokenFn} The function to call to get a valid subscribe token
   */
  get subscribeTokenFn() {
    return this.#subscribeTokenFn
  }
}

/**
 * The params passed to LoadTokenFn.
 *
 * @typedef {Object} LoadTokenFnParams
 * @property {string=} channel - The name of the channel. Only provided to
 * subscribe token functions.
 * @property {string=} connectionId - The ID of the connection. Only provided
 * to subscribe token functions.
 */

/**
 * A function that returns a signed JWT that is authorized to connect to the
 * WebSocket or authorized to subscribe to channels. It takes an object as an
 * argument. The function can return the JWT string directly or a promise that
 * resolves to the JWT string.
 *
 * @typedef {function(LoadTokenFnParams): string | Promise<string>} LoadTokenFn
 */

/**
 * A function type for handling messages. This function takes a message
 * as an argument and does not return anything.
 *
 * @typedef {function(Object): void} MessageHandlerFn
 */

/**
 * Represents any value that can be serialized into JSON. This includes objects,
 * arrays, strings, numbers, booleans, and null.
 *
 * @typedef {JsonObject|JsonArray|string|number|boolean|null} JsonSerializable
 */

/**
 * Represents a JSON object.
 *
 * @typedef {Object<string, JsonSerializable>} JsonObject
 */

/**
 * Represents a JSON array.
 *
 * @typedef {Array<JsonSerializable>} JsonArray
 */

/**
 * A logger accepts log entries and can set the log level.
 *
 * @typedef {Object} Logger
 * @property {function(...any): void} trace - Trace logging method.
 * @property {function(...any): void} debug - Debug logging method.
 * @property {function(...any): void} info - Info logging method.
 * @property {function(...any): void} warn - Warn logging method.
 * @property {function(...any): void} error - Error logging method.
 * @property {function(string): void} setLevel - Set log level method.
 */

class InvalidArgumentError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}
