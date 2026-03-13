import { HotsockClient } from "../src/hotsock"

class MockWebSocket {
  constructor(url) {
    this.url = url

    this.onerror = jest.fn()
    this.onopen = jest.fn()
    this.onclose = jest.fn()
    this.onmessage = jest.fn()
    this.send = jest.fn()

    this.readyState = 1 // OPEN

    setTimeout(() => this.onopen(), 0) // Simulate async open event
  }

  // Simulate an incoming message
  receiveMessage(rawMessage) {
    this.onmessage({ data: rawMessage })
  }

  // Simulate an outgoing message
  sendMessage(rawMessage) {
    this.send(rawMessage)
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    setTimeout(() => this.onclose(), 0) // Simulate async close event
  }

  error(err) {
    setTimeout(() => this.onerror(err), 0) // Simulate async error event
  }
}

global.WebSocket = MockWebSocket
global.runner = "test"

const wssBaseUrl = "wss://996iaxdp6g.execute-api.us-east-1.amazonaws.com/v1"
const testValidToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFubmVscyI6eyIqIjp7InN1YnNjcmliZSI6dHJ1ZX19LCJleHAiOjQ4ODUxMDkwNTEsInNjb3BlIjoiY29ubmVjdCIsInVpZCI6ImphbWVzIn0.pMsYKBqW9zqS55l_UZoOkywrosDZJfU2SOSJWpuCEps"
const testMalformedToken = "hey"
const testNotActuallyAToken = "a.b.c"
const testExpiredToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFubmVscyI6eyIqIjp7InN1YnNjcmliZSI6dHJ1ZX19LCJleHAiOjE3Mjk0NDEyODksInNjb3BlIjoiY29ubmVjdCIsInVpZCI6ImphbWVzIn0.BgOcCHzzDazIaVIiVzLY3MMZ-dNzArAF8sFxM_jY7vg"

describe("HotsockClient constructor", () => {
  let consoleWarnSpy
  let consoleErrorSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {}) // Suppress console.warn
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {}) // Suppress console.error
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore() // Restore console.warn
    consoleErrorSpy.mockRestore() // Restore console.error
  })

  test("should throw an error if no webSocketUrl is provided", () => {
    expect(() => new HotsockClient()).toThrow("webSocketUrl must be provided")
  })

  test("should throw an error for empty webSocketUrl", () => {
    expect(() => new HotsockClient("")).toThrow("webSocketUrl must be provided")
  })

  test("should throw an error if connectTokenFn is not provided", () => {
    expect(() => new HotsockClient(wssBaseUrl)).toThrow(
      "connectTokenFn must be a function",
    )
  })

  test("should throw an error if connectTokenFn returns something that does not resemble a token", async () => {
    jest.useFakeTimers()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testMalformedToken,
    })
    const promise = hotsock.activeConnection.initializationComplete()
    promise.catch(() => {}) // prevent unhandled rejection during timer advance
    await jest.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toThrow(
      "Failed to load a valid token after maximum attempts",
    )
    jest.useRealTimers()
  })

  test("should throw an error if connectTokenFn returns a token that isn't a parseable JWT", async () => {
    jest.useFakeTimers()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testNotActuallyAToken,
    })
    const promise = hotsock.activeConnection.initializationComplete()
    promise.catch(() => {}) // prevent unhandled rejection during timer advance
    await jest.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toThrow(
      "Failed to load a valid token after maximum attempts",
    )
    jest.useRealTimers()
  })

  test("should throw an error if connectTokenFn returns an expired token", async () => {
    jest.useFakeTimers()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testExpiredToken,
    })
    const promise = hotsock.activeConnection.initializationComplete()
    promise.catch(() => {}) // prevent unhandled rejection during timer advance
    await jest.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toThrow(
      "Failed to load a valid token after maximum attempts",
    )
    jest.useRealTimers()
  })

  test("should call connectTokenErrorFn if connectTokenFn returns an expired token", async () => {
    jest.useFakeTimers()
    const mockErrorFn = jest.fn()

    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testExpiredToken,
      connectTokenErrorFn: mockErrorFn,
    })

    const promise = hotsock.activeConnection.initializationComplete()
    await jest.advanceTimersByTimeAsync(1000)
    await promise

    expect(mockErrorFn).toHaveBeenCalled()
    expect(mockErrorFn.mock.calls[0][0].message).toBe(
      "Failed to load a valid token after maximum attempts",
    )
    jest.useRealTimers()
  })

  test("should throw an error if connectTokenErrorFn is not a function", () => {
    expect(
      () =>
        new HotsockClient(wssBaseUrl, {
          connectTokenFn: () => testValidToken,
          connectTokenErrorFn: "not-a-function",
        }),
    ).toThrow(new TypeError("connectTokenErrorFn must be a function"))
  })

  test("should expose connectTokenFnMaxAttempts with default value", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    expect(hotsock.connectTokenFnMaxAttempts).toBe(2)
    hotsock.terminate()
  })

  test("should expose connectTokenFnMaxAttempts with custom value", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      connectTokenFnMaxAttempts: 5,
    })
    expect(hotsock.connectTokenFnMaxAttempts).toBe(5)
    hotsock.terminate()
  })

  test("should expose connectTokenErrorFn getter", () => {
    const errorFn = jest.fn()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      connectTokenErrorFn: errorFn,
    })
    expect(hotsock.connectTokenErrorFn).toBe(errorFn)
    hotsock.terminate()
  })

  test("should use custom logger when provided", async () => {
    const customLogger = {
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLevel: jest.fn(),
    }
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      logger: customLogger,
    })
    await hotsock.activeConnection.initializationComplete()

    expect(hotsock.logger).toBe(customLogger)
    expect(customLogger.debug).toHaveBeenCalled()
    hotsock.terminate()
  })

  test("should handle async connectTokenFn returning a Promise", async () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => Promise.resolve(testValidToken),
    })
    await hotsock.activeConnection.initializationComplete()

    expect(hotsock.activeConnection.ws).toBeDefined()
    expect(hotsock.activeConnection.ws.url).toBe(
      wssBaseUrl + `?token=${testValidToken}`,
    )
    hotsock.terminate()
  })

  test("should handle connectTokenFn that throws", async () => {
    jest.useFakeTimers()
    const errorFn = jest.fn()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => {
        throw new Error("network error")
      },
      connectTokenErrorFn: errorFn,
    })

    const promise = hotsock.activeConnection.initializationComplete()
    await jest.advanceTimersByTimeAsync(1000)
    await promise

    expect(errorFn).toHaveBeenCalled()
    expect(errorFn.mock.calls[0][0].message).toBe(
      "Failed to load a valid token after maximum attempts",
    )
    jest.useRealTimers()
  })

  test("should create an instance with valid webSocketUrl and connectTokenFn", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    expect(hotsock).toBeInstanceOf(HotsockClient)
    expect(hotsock.webSocketUrl).toBe(wssBaseUrl)
    expect(hotsock.connectTokenFn()).toBe(testValidToken)
    hotsock.terminate()
  })
})

describe("HotsockClient WebSocket lifecycle / mock verification", () => {
  /** @type {HotsockClient} */
  let hotsock

  /** @type {WebSocket} */
  let mockWebSocket

  beforeEach(async () => {
    hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
    mockWebSocket = hotsock.activeConnection.ws
  })

  afterEach(() => {
    hotsock.terminate()
  })

  test("has a correct URL + token", () => {
    expect(mockWebSocket).toBeDefined()
    expect(mockWebSocket.url).toBe(wssBaseUrl + `?token=${testValidToken}`)
  })

  test("triggers onopen", (done) => {
    mockWebSocket.onopen = jest.fn(() => {
      expect(mockWebSocket.onopen).toHaveBeenCalled()
      done()
    })
  })

  test("triggers onclose", (done) => {
    mockWebSocket.onclose = jest.fn(() => {
      expect(mockWebSocket.onclose).toHaveBeenCalled()
      done()
    })

    mockWebSocket.close()
  })

  test("triggers onerror", (done) => {
    mockWebSocket.onerror = jest.fn(() => {
      expect(mockWebSocket.onerror).toHaveBeenCalled()
      done()
    })

    mockWebSocket.error(new Error("bad things happened"))
  })

  test("triggers onmessage via receiveMessage on mock", (done) => {
    const testMessage = {
      event: "hotsock.connected",
      data: { connectionId: "PI0oPcnMoAMCE6g=" },
      meta: { uid: null, umd: null },
    }
    mockWebSocket.onmessage = jest.fn((event) => {
      expect(mockWebSocket.onmessage).toHaveBeenCalled()
      expect(event.data).toBe(JSON.stringify(testMessage))
      done()
    })

    mockWebSocket.receiveMessage(JSON.stringify(testMessage))
  })

  test("triggers send via sendMessage on mock", (done) => {
    const subscribeMessage = {
      event: "hotsock.subscribe",
      channel: "mychannel",
    }
    mockWebSocket.send = jest.fn((event) => {
      expect(mockWebSocket.send).toHaveBeenCalled()
      expect(event).toBe(JSON.stringify(subscribeMessage))
      done()
    })

    mockWebSocket.sendMessage(JSON.stringify(subscribeMessage))
  })
})

describe("public API", () => {
  /** @type {HotsockClient} */
  let hotsock

  /** @type {WebSocket} */
  let mockWebSocket

  beforeEach(async () => {
    hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
    mockWebSocket = hotsock.activeConnection.ws
  })

  afterEach(() => {
    hotsock.terminate()
  })

  describe("bind()", () => {
    describe("@@connect event", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        hotsock.bind("@@connect", cb)
        const bindings = hotsock.clientEventBindings.get("@@connect")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()
        setTimeout(() => expect(cb).toHaveBeenCalled(), 0) // next tick
      })
    })

    describe("@@disconnect event", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        hotsock.bind("@@disconnect", cb)
        const bindings = hotsock.clientEventBindings.get("@@disconnect")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()
        mockWebSocket.close()
        setTimeout(() => expect(cb).toHaveBeenCalled(), 0) // next tick
      })
    })

    describe("@@message event", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        hotsock.bind("@@message", cb)
        const bindings = hotsock.clientEventBindings.get("@@message")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "anything",
            channel: "does not matter",
          }),
        )
        expect(cb).toHaveBeenCalled()
      })
    })

    describe("@@messageSent event", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        hotsock.bind("@@messageSent", cb)
        const bindings = hotsock.clientEventBindings.get("@@messageSent")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()

        hotsock.sendMessage("outgoing-message", { channel: "sent" })
        expect(cb).toHaveBeenCalled()
      })
    })

    describe("@@error event", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        const errEvent = { type: "error" }
        mockWebSocket.onerror(errEvent)
        expect(cb).not.toHaveBeenCalled()

        hotsock.bind("@@error", cb)
        const bindings = hotsock.clientEventBindings.get("@@error")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.onerror(errEvent)
        expect(cb).toHaveBeenCalled()
      })

      describe("invalid callback", () => {
        test("it throws", () => {
          expect(() => {
            hotsock.bind("bad-callback", "not-a-function")
          }).toThrow(new TypeError("messageFn must be a function"))
        })
      })
    })

    describe("global event and callback", () => {
      test("it adds the client event binding and fires the callback", () => {
        const cb = jest.fn()
        hotsock.bind("random-event", cb)
        const bindings = hotsock.clientEventBindings.get("random-event")
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "random-event",
            channel: "does-not-matter",
          }),
        )
        expect(cb).toHaveBeenCalled()
      })

      test("regex wildcard event matches and fires the callback", () => {
        const cb = jest.fn()
        const pattern = /^wildcard\..*\.match\..*$/
        hotsock.bind(pattern, cb)
        const bindings = hotsock.clientEventBindings.get(pattern)
        expect(bindings[0].messageFn).toBe(cb)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "wildcard.MATCHES.match.MATCHES",
            channel: "does-not-matter",
          }),
        )
        expect(cb).toHaveBeenCalled()
      })

      test("regex client binding does not fire when event does not match", () => {
        const cb = jest.fn()
        const pattern = /^specific\.prefix\..+$/
        hotsock.bind(pattern, cb)

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "different.prefix.event",
            channel: "does-not-matter",
          }),
        )
        expect(cb).not.toHaveBeenCalled()
      })
    })

    describe("channel event and callback", () => {
      test("it adds the channel event bindings, calls hotsock.subscribe once, and fires the callback", () => {
        const cb = jest.fn()
        const cbnotcalled = jest.fn()
        hotsock.bind("my-event", cb, { channel: "my-channel" })
        hotsock.bind("my-other-event", cbnotcalled, { channel: "my-channel" })
        const bindings = hotsock.channelEventBindings["my-channel"]
        expect(bindings[0].messageFn).toBe(cb)
        expect(bindings[0].event).toBe("my-event")
        expect(bindings[1].messageFn).toBe(cbnotcalled)
        expect(bindings[1].event).toBe("my-other-event")
        expect(cb).not.toHaveBeenCalled()
        expect(cbnotcalled).not.toHaveBeenCalled()

        expect(mockWebSocket.send).toHaveBeenCalledTimes(1)
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          '{"event":"hotsock.subscribe","channel":"my-channel"}',
        )

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "my-event",
            channel: "some-other-channel",
          }),
        )
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "my-event",
            channel: "my-channel",
          }),
        )
        expect(cb).toHaveBeenCalled()
        expect(cbnotcalled).not.toHaveBeenCalled()
      })

      test("regex wildcard event matches and fires the callback", () => {
        const cb = jest.fn()
        const pattern = /^wildcard\..*\.match\..*$/
        hotsock.bind(pattern, cb, { channel: "wildcard-channel" })
        const bindings = hotsock.channelEventBindings["wildcard-channel"]
        expect(bindings[0].messageFn).toBe(cb)
        expect(bindings[0].event).toBe(pattern)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "wildcard.MATCHES.match.MATCHES",
            channel: "wildcard-channel",
          }),
        )
        expect(cb).toHaveBeenCalled()
      })

      test("regex wildcard event does not match and does not fire the callback", () => {
        const cb = jest.fn()
        const pattern = /^wildcard\..*\.match\..*$/
        hotsock.bind(pattern, cb, { channel: "wildcard-channel-nomatch" })
        const bindings =
          hotsock.channelEventBindings["wildcard-channel-nomatch"]
        expect(bindings[0].messageFn).toBe(cb)
        expect(bindings[0].event).toBe(pattern)
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "wildcard.NOMATCH.nomatch.NOMATCH",
            channel: "wildcard-channel-nomatch",
          }),
        )
        expect(cb).not.toHaveBeenCalled()
      })
    })

    describe("Binding object return value", () => {
      test("has unbind() function on global client event", () => {
        const cb = jest.fn()
        const binding = hotsock.bind("turn-off-client-event", cb)
        binding.unbind()
        expect(
          hotsock.clientEventBindings.get("turn-off-client-event"),
        ).toStrictEqual(undefined)
      })

      test("has unbind() function on channel event", () => {
        const cb = jest.fn()
        const binding = hotsock.bind("turn-off-channel-event", cb, {
          channel: "turn-off-channel",
        })
        binding.unbind()
        expect(hotsock.channelEventBindings["turn-off-channel"]).toStrictEqual(
          [],
        )
      })
    })
    describe("incoming message handling for known event types", () => {
      describe("hotsock.connected", () => {
        beforeEach(() => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.connected",
              data: { connectionId: "QDpLKfv7IAMCJOw=" },
              meta: { uid: "123", umd: { name: "Dwight" } },
            }),
          )
        })
        test("sets connectionId", () => {
          expect(hotsock.activeConnection.connectionId).toBe("QDpLKfv7IAMCJOw=")
        })
        test("sets uid", () => {
          expect(hotsock.activeConnection.uid).toBe("123")
        })
        test("sets umd", () => {
          expect(hotsock.activeConnection.umd).toStrictEqual({ name: "Dwight" })
        })
        test("sets connectionSecret", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.connected",
              data: {
                connectionId: "c1",
                connectionSecret: "secret-abc",
                connectionExpiresAt: "2099-06-15T12:00:00Z",
              },
              meta: { uid: "u1", umd: null },
            }),
          )
          expect(hotsock.activeConnection.connectionSecret).toBe("secret-abc")
        })
        test("sets connectionExpiresAt as a Date", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.connected",
              data: {
                connectionId: "c1",
                connectionSecret: "s1",
                connectionExpiresAt: "2099-06-15T12:00:00Z",
              },
              meta: { uid: "u1", umd: null },
            }),
          )
          expect(hotsock.activeConnection.connectionExpiresAt).toStrictEqual(
            new Date("2099-06-15T12:00:00Z"),
          )
        })
        test("connectionExpiresAt returns undefined when not set", () => {
          expect(hotsock.activeConnection.connectionExpiresAt).toBeUndefined()
        })
      })
      describe("hotsock.subscribed", () => {
        beforeEach(() => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.subscribed",
              channel: "my-channel",
              data: {},
              meta: { uid: "456", umd: { name: "Jim" } },
            }),
          )
        })
        test("sets channel state", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["state"]).toBe(
            "subscribeConfirmed",
          )
        })
        test("sets channel uid", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["uid"]).toBe(
            "456",
          )
        })
        test("sets channel umd", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["umd"],
          ).toStrictEqual({ name: "Jim" })
        })
        test("sets channel members", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["members"],
          ).toStrictEqual([])
        })
        test("sets channel name", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["name"],
          ).toStrictEqual("my-channel")
        })
        test("falls back to connection uid when meta.uid is null", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.connected",
              data: { connectionId: "c1" },
              meta: { uid: "connection-uid", umd: { role: "admin" } },
            }),
          )
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.subscribed",
              channel: "fallback-channel",
              data: {},
              meta: { uid: null, umd: null },
            }),
          )
          expect(
            hotsock.activeConnection.channels["fallback-channel"].uid,
          ).toBe("connection-uid")
          expect(
            hotsock.activeConnection.channels["fallback-channel"].umd,
          ).toStrictEqual({ role: "admin" })
        })
      })
      describe("hotsock.unsubscribed", () => {
        beforeEach(() => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.subscribed",
              channel: "my-channel",
              data: {},
              meta: { uid: "456", umd: { name: "Jim" } },
            }),
          )
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.unsubscribed",
              channel: "my-channel",
              data: {},
            }),
          )
        })
        test("sets channels state", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["state"]).toBe(
            "unsubscribeConfirmed",
          )
        })
        test("clears channels uid", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["uid"]).toBe(
            null,
          )
        })
        test("clears channels umd", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["umd"]).toBe(
            null,
          )
        })
        test("clears channels members", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["members"],
          ).toStrictEqual([])
        })
        test("keeps channel name", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["name"],
          ).toStrictEqual("my-channel")
        })
      })
      describe("hotsock.ping", () => {
        test("responds with pong", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.ping",
              data: {},
            }),
          )
          expect(mockWebSocket.send).toHaveBeenCalledWith(
            `{"event":"hotsock.pong"}`,
          )
        })
      })
      describe("hotsock.memberAdded", () => {
        test("updates channel members", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.memberAdded",
              channel: "presence-channel",
              data: { members: [{ uid: "alice" }, { uid: "bob" }] },
            }),
          )
          expect(
            hotsock.activeConnection.channels["presence-channel"].members,
          ).toStrictEqual([{ uid: "alice" }, { uid: "bob" }])
        })
      })
      describe("hotsock.memberRemoved", () => {
        test("updates channel members", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.memberAdded",
              channel: "presence-channel",
              data: { members: [{ uid: "alice" }, { uid: "bob" }] },
            }),
          )
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.memberRemoved",
              channel: "presence-channel",
              data: { members: [{ uid: "alice" }] },
            }),
          )
          expect(
            hotsock.activeConnection.channels["presence-channel"].members,
          ).toStrictEqual([{ uid: "alice" }])
        })
      })
      describe("hotsock.error", () => {
        test("NOT_SUBSCRIBED sets channel state to unsubscribeConfirmed", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.error",
              channel: "err-channel",
              error: { code: "NOT_SUBSCRIBED" },
            }),
          )
          expect(hotsock.activeConnection.channels["err-channel"].state).toBe(
            "unsubscribeConfirmed",
          )
        })

        test("ALREADY_SUBSCRIBED sets channel state to subscribeConfirmed", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.error",
              channel: "err-channel-2",
              error: { code: "ALREADY_SUBSCRIBED" },
            }),
          )
          expect(hotsock.activeConnection.channels["err-channel-2"].state).toBe(
            "subscribeConfirmed",
          )
        })

        test("INVALID_SUBSCRIBE_TOKEN sets channel state to subscribeFailed", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.error",
              channel: "err-channel-3",
              error: { code: "INVALID_SUBSCRIBE_TOKEN" },
            }),
          )
          expect(hotsock.activeConnection.channels["err-channel-3"].state).toBe(
            "subscribeFailed",
          )
        })

        test("unknown error code does not set channel state", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.error",
              channel: "err-channel-unknown",
              error: { code: "SOMETHING_UNKNOWN" },
            }),
          )
          expect(
            hotsock.activeConnection.channels["err-channel-unknown"],
          ).toBeUndefined()
        })
      })
    })
  })

  describe("unbind()", () => {
    describe("global event without callback (turns off all callbacks matching event)", () => {
      test("it removes the client event bindings and does not fire the callbacks", () => {
        const event = "off-global-event-no-cb"
        const messageFn1 = jest.fn()
        const messageFn2 = jest.fn()
        hotsock.bind(event, messageFn1)
        hotsock.bind(event, messageFn2)
        hotsock.unbind(event)

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: event,
            channel: "does-not-matter",
          }),
        )
        expect(messageFn1).not.toHaveBeenCalled()
        expect(messageFn2).not.toHaveBeenCalled()
      })
    })

    describe("global event and callback", () => {
      test("it removes the client event binding and does not fire the callback", () => {
        const event = "off-global-event"
        const messageFn = jest.fn()
        hotsock.bind(event, messageFn)
        hotsock.unbind(event, { messageFn })

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event,
            channel: "does-not-matter",
          }),
        )
        expect(messageFn).not.toHaveBeenCalled()
      })
    })

    describe("channel event and callback", () => {
      test("it removes the client event binding, calls hotsock.unsubscribe and does not fire the callback", () => {
        const event = "off-channel-event"
        const messageFn1 = jest.fn()
        const messageFn2 = jest.fn()
        hotsock.bind(event, messageFn1, {
          channel: "off-channel",
        })
        hotsock.bind(event, messageFn2, {
          channel: "off-channel",
        })
        hotsock.unbind(event, {
          messageFn: messageFn1,
          channel: "off-channel",
        })
        expect(mockWebSocket.send).toHaveBeenCalledTimes(1)

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event,
            channel: "off-channel",
          }),
        )
        expect(messageFn1).not.toHaveBeenCalled()
        expect(messageFn2).toHaveBeenCalled()

        hotsock.unbind(event, {
          messageFn: messageFn2,
          channel: "off-channel",
        })

        expect(mockWebSocket.send).toHaveBeenCalledTimes(2)
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          '{"event":"hotsock.subscribe","channel":"off-channel"}',
        )
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          '{"event":"hotsock.unsubscribe","channel":"off-channel"}',
        )
      })
    })

    describe("channel event without callback (turns off all callbacks matching event)", () => {
      test("it removes the channel event binding and does not fire the callback", () => {
        const event = "off-channel-event-no-cb"
        const messageFn1 = jest.fn()
        const messageFn2 = jest.fn()
        hotsock.bind(event, messageFn1, {
          channel: "off-channel",
        })
        hotsock.bind(event, messageFn2, {
          channel: "off-channel",
        })
        hotsock.unbind(event, {
          channel: "off-channel",
        })

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event,
            channel: "off-channel",
          }),
        )
        expect(messageFn1).not.toHaveBeenCalled()
        expect(messageFn2).not.toHaveBeenCalled()
      })
    })

    describe("RegExp client event binding", () => {
      test("unbind with string removes matching RegExp binding", () => {
        const pattern = /^test\..*$/
        const cb = jest.fn()
        hotsock.bind(pattern, cb)
        expect(hotsock.clientEventBindings.get(pattern).length).toBe(1)

        hotsock.unbind("test.something")
        expect(hotsock.clientEventBindings.get(pattern)).toBeUndefined()

        mockWebSocket.receiveMessage(
          JSON.stringify({ event: "test.something", channel: "ch" }),
        )
        expect(cb).not.toHaveBeenCalled()
      })
    })

    describe("empty binding cleanup", () => {
      test("unbind with specific messageFn cleans up empty Map entries", () => {
        const cb = jest.fn()
        hotsock.bind("cleanup-event", cb)
        expect(hotsock.clientEventBindings.has("cleanup-event")).toBe(true)

        hotsock.unbind("cleanup-event", { messageFn: cb })
        expect(hotsock.clientEventBindings.has("cleanup-event")).toBe(false)
      })
    })

    describe("unbind with non-existent messageFn", () => {
      test("is a no-op when the specific messageFn is not bound", () => {
        const cb1 = jest.fn()
        const cb2 = jest.fn()
        hotsock.bind("keep-event", cb1)

        // Try to unbind a different function that was never bound
        hotsock.unbind("keep-event", { messageFn: cb2 })

        // Original binding should still be intact
        const bindings = hotsock.clientEventBindings.get("keep-event")
        expect(bindings.length).toBe(1)
        expect(bindings[0].messageFn).toBe(cb1)
      })
    })

    describe("unbind skips non-matching keys in forEach", () => {
      test("only removes the matching event, leaving other events intact", () => {
        const cb1 = jest.fn()
        const cb2 = jest.fn()
        hotsock.bind("event-a", cb1)
        hotsock.bind("event-b", cb2)

        hotsock.unbind("event-a")

        // event-a should be removed
        expect(hotsock.clientEventBindings.has("event-a")).toBe(false)
        // event-b should remain
        expect(hotsock.clientEventBindings.has("event-b")).toBe(true)
        expect(hotsock.clientEventBindings.get("event-b")[0].messageFn).toBe(
          cb2,
        )
      })
    })
  })

  describe("sendMessage()", () => {
    test("missing event throws", () => {
      expect(() => {
        hotsock.sendMessage()
      }).toThrow("event must be provided")

      expect(() => {
        hotsock.sendMessage("")
      }).toThrow("event must be provided")
    })
    test("valid minimal event sends to WebSocket", () => {
      hotsock.sendMessage("my-event")
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1)
      expect(mockWebSocket.send).toHaveBeenCalledWith('{"event":"my-event"}')
    })
    test("valid channel event sends to WebSocket", () => {
      hotsock.sendMessage("my-event", {
        channel: "my-channel",
        data: { my: "data" },
      })
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1)
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        '{"channel":"my-channel","event":"my-event","data":{"my":"data"}}',
      )
    })
  })

  describe("sendRawMessage()", () => {
    test("valid channel event sends to WebSocket", () => {
      const message =
        '{"channel":"my-channel","event":"my-event","data":{"my":"data"}}'
      hotsock.sendRawMessage(message)
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1)
      expect(mockWebSocket.send).toHaveBeenCalledWith(message)
    })

    test("throws when no WebSocket connection is available", () => {
      const lazyHotsock = new HotsockClient(wssBaseUrl, {
        connectTokenFn: () => testValidToken,
        lazyConnection: true,
      })
      expect(() => lazyHotsock.sendRawMessage("test")).toThrow(
        "no WebSocket connection available to send message",
      )
      lazyHotsock.terminate()
    })
  })

  describe("clearBindings()", () => {
    test("removes all client and channel bindings", () => {
      hotsock.bind("@@connect", jest.fn())
      hotsock.bind("my-event", jest.fn(), { channel: "my-channel" })

      expect(hotsock.clientEventBindings.size).toBeGreaterThan(0)
      expect(Object.keys(hotsock.channelEventBindings).length).toBeGreaterThan(
        0,
      )

      hotsock.clearBindings()

      expect(hotsock.clientEventBindings.size).toBe(0)
      expect(hotsock.channelEventBindings).toStrictEqual({})
    })
  })

  describe("resume()", () => {
    test("is a no-op when WebSocket is already open", async () => {
      const originalConnection = hotsock.activeConnection

      hotsock.resume()

      expect(hotsock.activeConnection).toBe(originalConnection)
    })

    test("creates a new connection after suspend", () => {
      const originalConnection = hotsock.activeConnection

      hotsock.suspend()
      hotsock.resume()

      expect(hotsock.activeConnection).not.toBe(originalConnection)
      hotsock.terminate()
    })
  })

  describe("auto-subscription behavior", () => {
    describe("when a channel is auto-subscribed", () => {
      beforeEach(() => {
        // Simulate auto-subscription from server
        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "hotsock.subscribed",
            channel: "auto-channel",
            data: { autoSubscribed: true },
            meta: { uid: "test-user", umd: { role: "viewer" } },
          }),
        )
      })

      test("sets autoSubscribed to true", () => {
        expect(
          hotsock.activeConnection.channels["auto-channel"].autoSubscribed,
        ).toBe(true)
      })

      test("does not unsubscribe when manageSubscriptions runs with no bindings", () => {
        // Clear any send calls from setup
        mockWebSocket.send.mockClear()

        // Run manageSubscriptions - should not call unsubscribe
        hotsock.activeConnection.manageSubscriptions()

        // Verify no unsubscribe message was sent
        expect(mockWebSocket.send).not.toHaveBeenCalledWith(
          JSON.stringify({
            event: "hotsock.unsubscribe",
            channel: "auto-channel",
          }),
        )
      })

      test("channel remains in subscribeConfirmed state", () => {
        // Run manageSubscriptions
        hotsock.activeConnection.manageSubscriptions()

        expect(hotsock.activeConnection.channels["auto-channel"].state).toBe(
          "subscribeConfirmed",
        )
      })
    })

    describe("when a channel is manually subscribed", () => {
      beforeEach(() => {
        // Simulate manual subscription from server (no auto flag)
        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "hotsock.subscribed",
            channel: "manual-channel",
            data: {},
            meta: { uid: "test-user", umd: { role: "viewer" } },
          }),
        )
      })

      test("sets autoSubscribed to false", () => {
        expect(
          hotsock.activeConnection.channels["manual-channel"].autoSubscribed,
        ).toBe(false)
      })

      test("unsubscribes when manageSubscriptions runs with no bindings", () => {
        // Clear any send calls from setup
        mockWebSocket.send.mockClear()

        // Run manageSubscriptions - should call unsubscribe
        hotsock.activeConnection.manageSubscriptions()

        // Verify unsubscribe message was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            event: "hotsock.unsubscribe",
            channel: "manual-channel",
          }),
        )
      })
    })

    describe("mixed auto and manual subscriptions", () => {
      beforeEach(() => {
        // Auto-subscribed channel
        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "hotsock.subscribed",
            channel: "auto-channel",
            data: { autoSubscribed: true },
            meta: { uid: "test-user", umd: null },
          }),
        )

        // Manually subscribed channel
        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "hotsock.subscribed",
            channel: "manual-channel",
            data: {},
            meta: { uid: "test-user", umd: null },
          }),
        )
      })

      test("only unsubscribes from manual channel when no bindings exist", () => {
        // Clear any send calls from setup
        mockWebSocket.send.mockClear()

        // Run manageSubscriptions
        hotsock.activeConnection.manageSubscriptions()

        // Should only unsubscribe from manual channel
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            event: "hotsock.unsubscribe",
            channel: "manual-channel",
          }),
        )
        expect(mockWebSocket.send).not.toHaveBeenCalledWith(
          JSON.stringify({
            event: "hotsock.unsubscribe",
            channel: "auto-channel",
          }),
        )
      })

      test("auto channel stays subscribed while manual channel gets unsubscribed", () => {
        hotsock.activeConnection.manageSubscriptions()

        expect(hotsock.activeConnection.channels["auto-channel"].state).toBe(
          "subscribeConfirmed",
        )
        expect(hotsock.activeConnection.channels["manual-channel"].state).toBe(
          "unsubscribePending",
        )
      })
    })
  })

  describe("failed subscription retry", () => {
    test("unbind and re-bind sends subscribe after a prior subscribeFailed", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "restricted-channel" })

      // Initial subscribe should have been sent
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          event: "hotsock.subscribe",
          channel: "restricted-channel",
        }),
      )

      // Server responds with permission denied error
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.error",
          channel: "restricted-channel",
          error: { code: "SUBSCRIBE_PERMISSION_DENIED" },
        }),
      )

      expect(
        hotsock.activeConnection.channels["restricted-channel"].state,
      ).toBe("subscribeFailed")

      // Unbind the failed binding
      hotsock.unbind("my-event", cb, { channel: "restricted-channel" })
      mockWebSocket.send.mockClear()

      // Re-bind to the same channel — bind() calls manageSubscriptions()
      // internally, which should not skip the channel due to subscribeFailed
      hotsock.bind("my-event", cb, { channel: "restricted-channel" })

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          event: "hotsock.subscribe",
          channel: "restricted-channel",
        }),
      )
    })
  })

  describe("channel alias support", () => {
    test("hotsock.subscribed with channelAlias sets up alias mapping and clears stale alias entry", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "foo" })

      // Library subscribes to "foo"
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.subscribe", channel: "foo" }),
      )
      expect(hotsock.activeConnection.channels["foo"].state).toBe(
        "subscribePending",
      )

      // Server responds with the real channel name and alias
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      // Real channel is tracked
      expect(hotsock.activeConnection.channels["foo.123"].state).toBe(
        "subscribeConfirmed",
      )
      expect(hotsock.activeConnection.channels["foo.123"].uid).toBe("james")

      // Stale alias entry is removed
      expect(hotsock.activeConnection.channels["foo"]).toBeUndefined()

      // Alias maps are recorded
      expect(hotsock.activeConnection.channelAliasToReal["foo"]).toBe("foo.123")
      expect(hotsock.activeConnection.channelRealToAlias["foo.123"]).toBe("foo")
    })

    test("events on real channel are dispatched to alias bindings", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "foo" })

      // Establish alias mapping
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      // Server sends an event on the real channel
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "my-event",
          channel: "foo.123",
          data: { hello: "world" },
        }),
      )

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith({
        event: "my-event",
        channel: "foo.123",
        data: { hello: "world" },
      })
    })

    test("regex bindings on alias match events on real channel", () => {
      const cb = jest.fn()
      hotsock.bind(/my-.*/, cb, { channel: "foo" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "my-event",
          channel: "foo.123",
          data: {},
        }),
      )

      expect(cb).toHaveBeenCalledTimes(1)
    })

    test("manageSubscriptions does not unsubscribe aliased real channel when alias has bindings", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "foo" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      mockWebSocket.send.mockClear()
      hotsock.activeConnection.manageSubscriptions()

      // Should NOT unsubscribe from foo.123
      expect(mockWebSocket.send).not.toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.unsubscribe", channel: "foo.123" }),
      )
      // Should NOT re-subscribe to foo
      expect(mockWebSocket.send).not.toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.subscribe", channel: "foo" }),
      )
    })

    test("manageSubscriptions does not re-subscribe alias when real channel is already subscribed", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "foo" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      // Clear and run again — should not send any subscribe/unsubscribe
      mockWebSocket.send.mockClear()
      hotsock.activeConnection.manageSubscriptions()
      hotsock.activeConnection.manageSubscriptions()
      hotsock.activeConnection.manageSubscriptions()

      expect(mockWebSocket.send).not.toHaveBeenCalled()
    })

    test("unbinding all alias bindings triggers unsubscribe of real channel", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "foo" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "foo" },
        }),
      )

      mockWebSocket.send.mockClear()
      hotsock.unbind("my-event", { messageFn: cb, channel: "foo" })

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.unsubscribe", channel: "foo.123" }),
      )
    })

    test("Binding.channel getter returns real ConnectionChannel for alias binding", () => {
      const cb = jest.fn()
      const binding = hotsock.bind("my-event", cb, { channel: "foo" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: {},
          meta: { uid: "james", umd: { role: "admin" }, channelAlias: "foo" },
        }),
      )

      expect(binding.channel).toBeDefined()
      expect(binding.channel.name).toBe("foo.123")
      expect(binding.channel.state).toBe("subscribeConfirmed")
      expect(binding.channel.uid).toBe("james")
      expect(binding.channel.umd).toStrictEqual({ role: "admin" })
    })

    test("Channel class accessors work with alias", () => {
      const channel = hotsock.channels("foo")
      const cb = jest.fn()
      channel.bind("my-event", cb)

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "foo.123",
          data: { members: [{ uid: "james" }] },
          meta: { uid: "james", umd: { role: "admin" }, channelAlias: "foo" },
        }),
      )

      expect(channel.uid).toBe("james")
      expect(channel.umd).toStrictEqual({ role: "admin" })
      expect(channel.members).toStrictEqual([{ uid: "james" }])
    })

    test("manageSubscriptions unsubscribes real channel when alias has no bindings", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "bar" })

      // Establish alias mapping: bar -> bar.456
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "bar.456",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "bar" },
        }),
      )

      // Remove all bindings on the alias
      hotsock.unbind("my-event", { messageFn: cb, channel: "bar" })
      mockWebSocket.send.mockClear()

      // Manually set bar.456 back to subscribeConfirmed for next manageSubscriptions
      hotsock.activeConnection.channels["bar.456"].state = "subscribeConfirmed"

      // Remove the alias binding entry entirely so alias has no bindings
      delete hotsock.channelEventBindings["bar"]

      hotsock.activeConnection.manageSubscriptions()

      // Real channel bar.456 should be unsubscribed (alias has no bindings)
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.unsubscribe", channel: "bar.456" }),
      )
    })

    test("manageSubscriptions skips subscribing alias whose real channel was just unsubscribed", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "baz" })

      // Establish alias mapping: baz -> baz.789
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "baz.789",
          data: {},
          meta: { uid: "james", umd: null, channelAlias: "baz" },
        }),
      )

      // Break the reverse mapping so unsubscribe loop won't count alias bindings.
      // This simulates a race where the mapping is inconsistent, which is
      // exactly the edge case the guard at line 1179 protects against.
      delete hotsock.activeConnection.channelRealToAlias["baz.789"]

      // Real channel has subscribeConfirmed state and is not autoSubscribed
      hotsock.activeConnection.channels["baz.789"].state = "subscribeConfirmed"
      hotsock.activeConnection.channels["baz.789"].autoSubscribed = false

      // Ensure no direct bindings on the real channel name
      delete hotsock.channelEventBindings["baz.789"]

      // Alias still has bindings via channelEventBindings["baz"]
      expect(hotsock.channelEventBindings["baz"].length).toBeGreaterThan(0)

      // channelAliasToReal still maps baz -> baz.789
      expect(hotsock.activeConnection.channelAliasToReal["baz"]).toBe("baz.789")

      mockWebSocket.send.mockClear()
      hotsock.activeConnection.manageSubscriptions()

      // Unsubscribe loop: baz.789 has no reverse alias mapping, no direct bindings,
      // subscribeConfirmed, not autoSubscribed → gets unsubscribed
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ event: "hotsock.unsubscribe", channel: "baz.789" }),
      )

      // Subscribe loop: "baz" has bindings, realChannel = "baz.789",
      // state resolves to "unsubscribePending" (subscribeable), but baz.789 is
      // in unsubscribedChannels → guard at line 1179 prevents re-subscription
      expect(mockWebSocket.send).not.toHaveBeenCalledWith(
        expect.stringContaining('"event":"hotsock.subscribe"'),
      )
    })

    test("events dispatched on channel with alias but no alias-specific bindings", () => {
      // Bind to real channel name directly (no alias bindings)
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "real-ch" })

      // Server sends subscribed without alias
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "real-ch",
          data: {},
          meta: { uid: "james", umd: null },
        }),
      )

      // Manually set up an alias mapping (rare scenario)
      hotsock.activeConnection.channelRealToAlias["real-ch"] = "alias-ch"
      hotsock.activeConnection.channelAliasToReal["alias-ch"] = "real-ch"

      // Event on real channel - should dispatch to real channel bindings
      // The alias path in dispatch has no bindings for "alias-ch"
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "my-event",
          channel: "real-ch",
          data: {},
        }),
      )

      expect(cb).toHaveBeenCalledTimes(1)
    })

    test("hotsock.subscribed without channelAlias works as before", () => {
      const cb = jest.fn()
      hotsock.bind("my-event", cb, { channel: "normal-channel" })

      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "hotsock.subscribed",
          channel: "normal-channel",
          data: {},
          meta: { uid: "456", umd: null },
        }),
      )

      expect(hotsock.activeConnection.channels["normal-channel"].state).toBe(
        "subscribeConfirmed",
      )
      expect(
        hotsock.activeConnection.channelAliasToReal["normal-channel"],
      ).toBeUndefined()

      // Events still dispatch normally
      mockWebSocket.receiveMessage(
        JSON.stringify({
          event: "my-event",
          channel: "normal-channel",
          data: {},
        }),
      )
      expect(cb).toHaveBeenCalledTimes(1)
    })
  })
})

describe("connected message timeout", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let originalWebSocket

  // A WebSocket mock that opens successfully but never sends hotsock.connected
  class OpenButSilentWebSocket {
    constructor(url) {
      this.url = url
      this.readyState = 1 // OPEN
      this.send = jest.fn()
      this.onerror = () => {}
      this.onopen = () => {}
      this.onclose = () => {}
      this.onmessage = () => {}
      this.closeCalled = false

      setTimeout(() => this.onopen(), 0)
    }
    close() {
      this.closeCalled = true
      this.readyState = 3
      setTimeout(() => this.onclose(), 0)
    }
  }

  beforeEach(() => {
    jest.useFakeTimers()
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    originalWebSocket = global.WebSocket
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    global.WebSocket = originalWebSocket
  })

  test("closes the WebSocket if hotsock.connected is not received within 5 seconds", async () => {
    global.WebSocket = OpenButSilentWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)

    const ws = hotsock.activeConnection.ws
    expect(ws.closeCalled).toBe(false)

    // Advance to just before 5s — should not have closed
    await jest.advanceTimersByTimeAsync(4998)
    expect(ws.closeCalled).toBe(false)

    // Advance past 5s — should close
    await jest.advanceTimersByTimeAsync(2)
    expect(ws.closeCalled).toBe(true)

    hotsock.terminate()
  })

  test("does not close the WebSocket if hotsock.connected is received in time", async () => {
    global.WebSocket = OpenButSilentWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)

    const ws = hotsock.activeConnection.ws

    // Simulate hotsock.connected arriving at 2 seconds
    await jest.advanceTimersByTimeAsync(2000)
    ws.onmessage({
      data: JSON.stringify({
        event: "hotsock.connected",
        data: {
          connectionId: "test-conn-id",
          connectionSecret: "test-secret",
          connectionExpiresAt: "2099-01-01T00:00:00Z",
        },
        meta: { uid: "test-uid", umd: null },
      }),
    })

    // Advance well past the 5s timeout — should NOT have closed
    await jest.advanceTimersByTimeAsync(10000)
    expect(ws.closeCalled).toBe(false)

    hotsock.terminate()
  })

  test("triggers reconnection after the timeout closes the connection", async () => {
    let connectionCount = 0

    global.WebSocket = class extends OpenButSilentWebSocket {
      constructor(url) {
        super(url)
        connectionCount++
      }
    }

    const connectTokenFn = jest.fn(() => testValidToken)
    jest.spyOn(Math, "random").mockReturnValue(0)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)
    expect(connectionCount).toBe(1)

    // Advance past 5s to trigger the timeout close
    await jest.advanceTimersByTimeAsync(5000)

    // Let onclose fire and trigger reconnectWithBackoff
    await jest.advanceTimersByTimeAsync(1)

    // The reconnect creates a new connection immediately (first attempt)
    expect(connectionCount).toBe(2)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    Math.random.mockRestore()
    hotsock.terminate()
  })

  test("clears the timeout when the connection closes for other reasons", async () => {
    global.WebSocket = OpenButSilentWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)

    const ws = hotsock.activeConnection.ws

    // Close the WebSocket at 2s for an unrelated reason
    await jest.advanceTimersByTimeAsync(2000)
    ws.close()

    // Let onclose fire
    await jest.advanceTimersByTimeAsync(1)

    // Reset closeCalled tracking — the close already happened once
    ws.closeCalled = false

    // Advance well past the 5s timeout — should NOT trigger another close
    await jest.advanceTimersByTimeAsync(10000)
    expect(ws.closeCalled).toBe(false)

    hotsock.terminate()
  })

  test("clears the timeout on intentional close() via suspend", async () => {
    global.WebSocket = OpenButSilentWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)

    const ws = hotsock.activeConnection.ws

    // Suspend at 2s (calls close() on the connection)
    await jest.advanceTimersByTimeAsync(2000)
    hotsock.suspend()

    // Let onclose fire
    await jest.advanceTimersByTimeAsync(1)

    // Reset closeCalled tracking
    ws.closeCalled = false

    // Advance well past the 5s timeout — should NOT trigger another close
    await jest.advanceTimersByTimeAsync(10000)
    expect(ws.closeCalled).toBe(false)
  })

  test("timeout is a no-op when connectionId is already set", async () => {
    global.WebSocket = OpenButSilentWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let the WebSocket open
    await jest.advanceTimersByTimeAsync(1)

    const ws = hotsock.activeConnection.ws

    // Temporarily stub clearTimeout so the timeout is NOT cleared when
    // hotsock.connected arrives. This simulates the race condition where
    // the timeout fires after connectionId was already set.
    const originalClearTimeout = global.clearTimeout
    global.clearTimeout = jest.fn()

    // Send hotsock.connected — sets connectionId but clearTimeout is stubbed
    ws.onmessage({
      data: JSON.stringify({
        event: "hotsock.connected",
        data: {
          connectionId: "race-conn-id",
          connectionSecret: "test-secret",
          connectionExpiresAt: "2099-01-01T00:00:00Z",
        },
        meta: { uid: "test-uid", umd: null },
      }),
    })

    // Restore clearTimeout so jest fake timers work properly
    global.clearTimeout = originalClearTimeout

    // Advance past 5s — timeout fires but connectionId is set so no close
    await jest.advanceTimersByTimeAsync(5000)
    expect(ws.closeCalled).toBe(false)

    hotsock.terminate()
  })
})

describe("reconnectWithBackoff", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let originalWebSocket
  let mathRandomSpy

  // A WebSocket mock that immediately closes (simulating network failure)
  class ImmediateCloseWebSocket {
    constructor(url) {
      this.url = url
      this.readyState = 3 // CLOSED
      this.send = jest.fn()
      this.onerror = () => {}
      this.onopen = () => {}
      this.onclose = () => {}
      this.onmessage = () => {}
      setTimeout(() => this.onclose(), 0)
    }
    close() {
      setTimeout(() => this.onclose(), 0)
    }
  }

  beforeEach(() => {
    jest.useFakeTimers()
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    originalWebSocket = global.WebSocket
    // Remove jitter so backoff timing is deterministic
    mathRandomSpy = jest.spyOn(Math, "random").mockReturnValue(0)
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    mathRandomSpy.mockRestore()
    global.WebSocket = originalWebSocket
  })

  test("does not rapidly call connectTokenFn when WebSocket immediately closes", async () => {
    global.WebSocket = ImmediateCloseWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Let initial connection initialize and its WebSocket close.
    // The first reconnect attempt fires immediately (no delay), so we get
    // 2 calls: initial connection + immediate first reconnect attempt.
    await jest.advanceTimersByTimeAsync(1)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // Let the first reconnect attempt's WebSocket close
    await jest.advanceTimersByTimeAsync(1)

    // After 500ms, should NOT have fetched another token (backoff is 1000ms)
    await jest.advanceTimersByTimeAsync(500)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // After 1000ms total, the second reconnect attempt fires
    await jest.advanceTimersByTimeAsync(500)
    expect(connectTokenFn).toHaveBeenCalledTimes(3)

    // Let that WebSocket close too
    await jest.advanceTimersByTimeAsync(1)

    // Next backoff is 1500ms (1000 * 1.5, jitter=0). Should NOT fire at 1000ms.
    await jest.advanceTimersByTimeAsync(1000)
    expect(connectTokenFn).toHaveBeenCalledTimes(3)

    // Should fire at 1500ms
    await jest.advanceTimersByTimeAsync(500)
    expect(connectTokenFn).toHaveBeenCalledTimes(4)

    hotsock.terminate()
  })

  test("backoff delay increases with each failed attempt", async () => {
    global.WebSocket = ImmediateCloseWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Initial connection + close + immediate first reconnect (also closes).
    // All resolves within the first tick.
    await jest.advanceTimersByTimeAsync(1)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // With jitter=0, backoff sequence: 1000, 1500, 2250, 3375
    const expectedDelays = [1000, 1500, 2250, 3375]

    for (let i = 0; i < expectedDelays.length; i++) {
      const delay = expectedDelays[i]
      const callsBefore = connectTokenFn.mock.calls.length

      // Advance to just before the delay - should not have fired
      await jest.advanceTimersByTimeAsync(delay - 2)
      expect(connectTokenFn).toHaveBeenCalledTimes(callsBefore)

      // Advance past the delay - should fire (and the new WS close resolves
      // within the same tick, scheduling the next backoff)
      await jest.advanceTimersByTimeAsync(3)
      expect(connectTokenFn).toHaveBeenCalledTimes(callsBefore + 1)
    }

    hotsock.terminate()
  })

  test("onclose does not start duplicate reconnect loops", async () => {
    global.WebSocket = ImmediateCloseWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Initial connection + close + immediate first reconnect = 2 calls
    await jest.advanceTimersByTimeAsync(1)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // Let reconnect WS close
    await jest.advanceTimersByTimeAsync(1)

    // Manually call reconnectWithBackoff again (simulating duplicate onclose)
    hotsock.reconnectWithBackoff()
    hotsock.reconnectWithBackoff()

    // After 1000ms, should have exactly 1 more reconnect attempt (not 3 more)
    await jest.advanceTimersByTimeAsync(1000)
    expect(connectTokenFn).toHaveBeenCalledTimes(3)

    hotsock.terminate()
  })

  test("suspend() cancels the reconnection loop", async () => {
    global.WebSocket = ImmediateCloseWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Initial connection + close + immediate first reconnect = 2 calls
    await jest.advanceTimersByTimeAsync(1)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // Suspend cancels the reconnection loop
    hotsock.suspend()

    // Advance well past when reconnect would have fired
    await jest.advanceTimersByTimeAsync(30000)
    expect(connectTokenFn).toHaveBeenCalledTimes(2) // No additional calls
  })

  test("terminate() cancels the reconnection loop", async () => {
    global.WebSocket = ImmediateCloseWebSocket
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Initial connection + close + immediate first reconnect = 2 calls
    await jest.advanceTimersByTimeAsync(1)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // Terminate cancels the reconnection loop
    hotsock.terminate()

    // Advance well past when reconnect would have fired
    await jest.advanceTimersByTimeAsync(30000)
    expect(connectTokenFn).toHaveBeenCalledTimes(2) // No additional calls
  })

  test("successful reconnection stops the backoff loop", async () => {
    let connectionCount = 0

    // First 2 connections immediately close, third one opens successfully
    global.WebSocket = class ConditionalWebSocket {
      constructor(url) {
        this.url = url
        this.send = jest.fn()
        this.onerror = () => {}
        this.onopen = () => {}
        this.onclose = () => {}
        this.onmessage = () => {}
        connectionCount++

        if (connectionCount <= 2) {
          this.readyState = 3
          setTimeout(() => this.onclose(), 0)
        } else {
          this.readyState = 1
          setTimeout(() => this.onopen(), 0)
        }
      }
      close() {
        setTimeout(() => this.onclose(), 0)
      }
    }

    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })

    // Connection 1 (initial) immediately closes.
    // Connection 2 (immediate first reconnect) also immediately closes.
    await jest.advanceTimersByTimeAsync(1)
    expect(connectionCount).toBe(2)
    expect(connectTokenFn).toHaveBeenCalledTimes(2)

    // Let connection 2's WebSocket close
    await jest.advanceTimersByTimeAsync(1)

    // Connection 3: reconnect after 1000ms backoff, opens successfully
    await jest.advanceTimersByTimeAsync(1000)
    expect(connectionCount).toBe(3)
    expect(connectTokenFn).toHaveBeenCalledTimes(3)
    await jest.advanceTimersByTimeAsync(1) // let it open

    // Simulate server sending hotsock.connected on the successful connection
    hotsock.activeConnection.ws.onmessage({
      data: JSON.stringify({
        event: "hotsock.connected",
        data: {
          connectionId: "test-conn-id",
          connectionSecret: "test-secret",
          connectionExpiresAt: "2099-01-01T00:00:00Z",
        },
        meta: { uid: "test-uid", umd: null },
      }),
    })

    // No more reconnect attempts should happen
    await jest.advanceTimersByTimeAsync(30000)
    expect(connectionCount).toBe(3)
    expect(connectTokenFn).toHaveBeenCalledTimes(3)

    hotsock.terminate()
  })
})

describe("default logger", () => {
  let consoleSpies

  beforeEach(() => {
    consoleSpies = {
      trace: jest.spyOn(console, "trace").mockImplementation(() => {}),
      debug: jest.spyOn(console, "debug").mockImplementation(() => {}),
      info: jest.spyOn(console, "info").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    Object.values(consoleSpies).forEach((spy) => spy.mockRestore())
  })

  test("default logLevel 'warn' suppresses trace, debug, and info", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    hotsock.logger.trace("test-trace")
    hotsock.logger.debug("test-debug")
    hotsock.logger.info("test-info")

    expect(consoleSpies.trace).not.toHaveBeenCalledWith("test-trace")
    expect(consoleSpies.debug).not.toHaveBeenCalledWith("test-debug")
    expect(consoleSpies.info).not.toHaveBeenCalledWith("test-info")

    hotsock.terminate()
  })

  test("default logLevel 'warn' allows warn and error through", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    hotsock.logger.warn("test-warn-msg")
    hotsock.logger.error("test-error-msg")

    expect(consoleSpies.warn).toHaveBeenCalledWith("test-warn-msg")
    expect(consoleSpies.error).toHaveBeenCalledWith("test-error-msg")

    hotsock.terminate()
  })

  test("logLevel 'trace' allows all messages through", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      logLevel: "trace",
    })

    hotsock.logger.trace("t")
    hotsock.logger.debug("d")
    hotsock.logger.info("i")
    hotsock.logger.warn("w")
    hotsock.logger.error("e")

    expect(consoleSpies.trace).toHaveBeenCalledWith("t")
    expect(consoleSpies.debug).toHaveBeenCalledWith("d")
    expect(consoleSpies.info).toHaveBeenCalledWith("i")
    expect(consoleSpies.warn).toHaveBeenCalledWith("w")
    expect(consoleSpies.error).toHaveBeenCalledWith("e")

    hotsock.terminate()
  })

  test("logLevel 'silent' suppresses all messages", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      logLevel: "silent",
    })

    hotsock.logger.warn("silent-warn")
    hotsock.logger.error("silent-error")

    expect(consoleSpies.warn).not.toHaveBeenCalledWith("silent-warn")
    expect(consoleSpies.error).not.toHaveBeenCalledWith("silent-error")

    hotsock.terminate()
  })

  test("setLevel dynamically changes the log level", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    hotsock.logger.info("should-not-appear")
    expect(consoleSpies.info).not.toHaveBeenCalledWith("should-not-appear")

    hotsock.logger.setLevel("info")
    hotsock.logger.info("should-appear")
    expect(consoleSpies.info).toHaveBeenCalledWith("should-appear")

    hotsock.terminate()
  })

  test("setLevel with invalid level is a no-op", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      logLevel: "info",
    })

    hotsock.logger.setLevel("notavalidlevel")
    hotsock.logger.info("still-works")
    expect(consoleSpies.info).toHaveBeenCalledWith("still-works")

    hotsock.terminate()
  })
})

describe("terminate()", () => {
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("clears all bindings after connection closes", async () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()

    hotsock.bind("@@connect", jest.fn())
    hotsock.bind("my-event", jest.fn(), { channel: "my-channel" })

    expect(hotsock.clientEventBindings.size).toBeGreaterThan(0)
    expect(Object.keys(hotsock.channelEventBindings).length).toBeGreaterThan(0)

    hotsock.terminate()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(hotsock.clientEventBindings.size).toBe(0)
    expect(hotsock.channelEventBindings).toStrictEqual({})
  })

  test("bind() after terminate() establishes a new connection", async () => {
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, { connectTokenFn })
    await hotsock.activeConnection.initializationComplete()
    const originalWs = hotsock.activeConnection.ws
    const originalConnection = hotsock.activeConnection

    // terminate() closes the connection and clears bindings
    hotsock.terminate()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(originalWs.readyState).toBe(3) // CLOSED
    expect(hotsock.clientEventBindings.size).toBe(0)
    expect(hotsock.channelEventBindings).toStrictEqual({})

    // bind() with a channel after terminate creates a new connection
    hotsock.bind("my-event", jest.fn(), { channel: "my-channel" })
    await hotsock.activeConnection.initializationComplete()

    // A new connection was created with a new WebSocket
    expect(hotsock.activeConnection).not.toBe(originalConnection)
    expect(hotsock.activeConnection.ws).not.toBe(originalWs)
    expect(hotsock.activeConnection.ws.readyState).toBe(1) // OPEN

    // The binding is present and will be subscribed on the new connection
    expect(hotsock.channelEventBindings["my-channel"]).toHaveLength(1)

    hotsock.terminate()
  })

  test("terminate() on lazy connection before any channel activity", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      lazyConnection: true,
    })

    // Connection exists even in lazy mode, but WebSocket isn't initialized
    expect(hotsock.activeConnection).toBeDefined()
    expect(hotsock.activeConnection.ws).toBeUndefined()

    // terminate() should not throw and should close the connection cleanly
    expect(() => hotsock.terminate()).not.toThrow()
  })
})

describe("lazy connection", () => {
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("does not establish WebSocket on construction", () => {
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn,
      lazyConnection: true,
    })

    expect(connectTokenFn).not.toHaveBeenCalled()
    expect(hotsock.activeConnection.ws).toBeUndefined()

    hotsock.terminate()
  })

  test("first bind with channel triggers connection", async () => {
    const connectTokenFn = jest.fn(() => testValidToken)
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn,
      lazyConnection: true,
    })

    expect(connectTokenFn).not.toHaveBeenCalled()

    hotsock.bind("my-event", jest.fn(), { channel: "lazy-channel" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(connectTokenFn).toHaveBeenCalled()
    expect(hotsock.activeConnection.ws).toBeDefined()

    hotsock.terminate()
  })
})

describe("subscribe with subscribeTokenFn", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let consoleErrorSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test("subscribes with token from subscribeTokenFn", async () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
    const mockWs = hotsock.activeConnection.ws

    mockWs.receiveMessage(
      JSON.stringify({
        event: "hotsock.connected",
        data: { connectionId: "conn-123" },
        meta: { uid: "u1", umd: null },
      }),
    )

    const subscribeTokenFn = jest.fn(() => testValidToken)
    hotsock.bind("my-event", jest.fn(), {
      channel: "token-channel",
      subscribeTokenFn,
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(subscribeTokenFn).toHaveBeenCalledWith({
      channel: "token-channel",
      connectionId: "conn-123",
    })

    const subscribeCall = mockWs.send.mock.calls.find((call) =>
      call[0].includes("token-channel"),
    )
    const parsed = JSON.parse(subscribeCall[0])
    expect(parsed.data.token).toBe(testValidToken)

    hotsock.terminate()
  })

  test("failed subscribeTokenFn sets channel state to subscribeFailed", async () => {
    jest.useFakeTimers()
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await jest.advanceTimersByTimeAsync(0)
    const mockWs = hotsock.activeConnection.ws

    mockWs.receiveMessage(
      JSON.stringify({
        event: "hotsock.connected",
        data: { connectionId: "conn-123" },
        meta: { uid: "u1", umd: null },
      }),
    )

    const subscribeTokenFn = jest.fn(() => {
      throw new Error("token fetch failed")
    })
    hotsock.bind("my-event", jest.fn(), {
      channel: "fail-token-channel",
      subscribeTokenFn,
    })

    // Advance past the retry backoff delays
    await jest.advanceTimersByTimeAsync(2000)

    expect(hotsock.activeConnection.channels["fail-token-channel"].state).toBe(
      "subscribeFailed",
    )

    hotsock.terminate()
    jest.useRealTimers()
  })
})

describe("Channel class", () => {
  let hotsock
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(async () => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
  })

  afterEach(() => {
    hotsock.terminate()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("unbind() delegates to client.unbind()", () => {
    const channel = hotsock.channels("unbind-test-channel")
    const cb = jest.fn()
    channel.bind("my-event", cb)

    expect(hotsock.channelEventBindings["unbind-test-channel"].length).toBe(1)

    channel.unbind("my-event", { messageFn: cb })
    expect(hotsock.channelEventBindings["unbind-test-channel"].length).toBe(0)
  })

  test("sendMessage() delegates to client.sendMessage()", () => {
    const channel = hotsock.channels("send-test-channel")
    const mockWs = hotsock.activeConnection.ws

    channel.sendMessage("my-event", { data: { key: "value" } })

    expect(mockWs.send).toHaveBeenCalledWith(
      '{"channel":"send-test-channel","event":"my-event","data":{"key":"value"}}',
    )
  })

  test("sendMessage() works without data option", () => {
    const channel = hotsock.channels("send-no-data")
    const mockWs = hotsock.activeConnection.ws

    channel.sendMessage("my-event")

    expect(mockWs.send).toHaveBeenCalledWith(
      '{"channel":"send-no-data","event":"my-event"}',
    )
  })

  test("subscribeTokenFn is passed through to bind()", () => {
    const channel = hotsock.channels("stfn-channel")
    const tokenFn = jest.fn(() => testValidToken)
    channel.subscribeTokenFn = tokenFn

    const binding = channel.bind("my-event", jest.fn())
    expect(binding.subscribeTokenFn).toBe(tokenFn)
  })

  test("members returns empty array when not subscribed", () => {
    const channel = hotsock.channels("nonexistent-channel")
    expect(channel.members).toStrictEqual([])
  })

  test("uid and umd return undefined when not subscribed", () => {
    const channel = hotsock.channels("nonexistent-channel")
    expect(channel.uid).toBeUndefined()
    expect(channel.umd).toBeUndefined()
  })
})

describe("Binding class", () => {
  let hotsock
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(async () => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
  })

  afterEach(() => {
    hotsock.terminate()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("channel returns undefined for client-level binding", () => {
    const binding = hotsock.bind("@@connect", jest.fn())
    expect(binding.channel).toBeUndefined()
  })

  test("messageFn getter returns the bound function", () => {
    const cb = jest.fn()
    const binding = hotsock.bind("my-event", cb)
    expect(binding.messageFn).toBe(cb)
  })

  test("subscribeTokenFn getter returns the token function", () => {
    const tokenFn = jest.fn()
    const binding = hotsock.bind("my-event", jest.fn(), {
      channel: "test-chan",
      subscribeTokenFn: tokenFn,
    })
    expect(binding.subscribeTokenFn).toBe(tokenFn)
  })

  test("event getter returns the bound event name", () => {
    const binding = hotsock.bind("specific-event", jest.fn())
    expect(binding.event).toBe("specific-event")
  })

  test("channel returns ConnectionChannel for direct (non-alias) channel binding", () => {
    const cb = jest.fn()
    const binding = hotsock.bind("my-event", cb, { channel: "direct-ch" })

    hotsock.activeConnection.ws.receiveMessage(
      JSON.stringify({
        event: "hotsock.subscribed",
        channel: "direct-ch",
        data: {},
        meta: { uid: "u1", umd: null },
      }),
    )

    expect(binding.channel).toBeDefined()
    expect(binding.channel.name).toBe("direct-ch")
    expect(binding.channel.state).toBe("subscribeConfirmed")
  })
})

describe("connectionOpen() rejection", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let originalWebSocket

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    originalWebSocket = global.WebSocket
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    global.WebSocket = originalWebSocket
  })

  test("rejects when WebSocket closes before opening", async () => {
    global.WebSocket = class NeverOpenWebSocket {
      constructor(url) {
        this.url = url
        this.readyState = 3
        this.send = jest.fn()
        this.onerror = () => {}
        this.onopen = () => {}
        this.onclose = () => {}
        this.onmessage = () => {}
        setTimeout(() => this.onclose(), 0)
      }
      close() {
        setTimeout(() => this.onclose(), 0)
      }
    }

    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()

    await expect(hotsock.activeConnection.connectionOpen()).rejects.toThrow(
      "connection closed",
    )

    hotsock.terminate()
  })
})

describe("onopen when already closed", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let originalWebSocket

  beforeEach(() => {
    jest.useFakeTimers()
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    originalWebSocket = global.WebSocket
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    global.WebSocket = originalWebSocket
  })

  test("does not set connected timeout when close was called before onopen", async () => {
    global.WebSocket = class DelayedOpenWebSocket {
      constructor(url) {
        this.url = url
        this.readyState = 0
        this.send = jest.fn()
        this.onerror = () => {}
        this.onopen = () => {}
        this.onclose = () => {}
        this.onmessage = () => {}
        this.closeCalled = false
        setTimeout(() => {
          this.readyState = 1
          this.onopen()
        }, 100)
      }
      close() {
        this.closeCalled = true
        this.readyState = 3
        setTimeout(() => this.onclose(), 0)
      }
    }

    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    // Suspend calls close() before the WebSocket opens
    hotsock.suspend()

    // Let onopen fire after 100ms delay
    await jest.advanceTimersByTimeAsync(101)

    const ws = hotsock.activeConnection.ws
    ws.closeCalled = false

    // Advance well past 5s timeout - should NOT close again
    await jest.advanceTimersByTimeAsync(10000)
    expect(ws.closeCalled).toBe(false)
  })
})

describe("subscription management loop (non-test mode)", () => {
  let consoleWarnSpy
  let consoleDebugSpy
  let originalRunner

  beforeEach(() => {
    jest.useFakeTimers()
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
    originalRunner = global.runner
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
    global.runner = originalRunner
  })

  test("starts setInterval loop when not in test mode", async () => {
    global.runner = undefined

    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    // Let WebSocket open and trigger startSubscriptionManagementLoop
    await jest.advanceTimersByTimeAsync(1)

    const mockWs = hotsock.activeConnection.ws

    // Manually place a subscribed channel with no bindings (not autoSubscribed)
    // so the interval's manageSubscriptions call will unsubscribe it
    hotsock.activeConnection.channels["orphan-channel"] = {
      state: "subscribeConfirmed",
      autoSubscribed: false,
    }
    mockWs.send.mockClear()

    // The interval fires at 250ms, calling manageSubscriptions
    await jest.advanceTimersByTimeAsync(250)

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({
        event: "hotsock.unsubscribe",
        channel: "orphan-channel",
      }),
    )

    hotsock.terminate()
  })
})

describe("Connection.client getter", () => {
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("returns the parent HotsockClient", async () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()

    expect(hotsock.activeConnection.client).toBe(hotsock)

    hotsock.terminate()
  })
})

describe("subscribe sendMessage failure", () => {
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("sets channel state to subscribeFailed when sendMessage throws", async () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })
    await hotsock.activeConnection.initializationComplete()
    const mockWs = hotsock.activeConnection.ws

    // Make send throw to simulate a WebSocket failure during subscribe
    mockWs.send.mockImplementation(() => {
      throw new Error("WebSocket is closed")
    })

    await expect(
      hotsock.activeConnection.subscribe("fail-send-channel"),
    ).rejects.toThrow("WebSocket is closed")

    expect(hotsock.activeConnection.channels["fail-send-channel"].state).toBe(
      "subscribeFailed",
    )

    hotsock.terminate()
  })
})

describe("decodeBase64 fallback paths", () => {
  let consoleWarnSpy
  let consoleDebugSpy

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleDebugSpy.mockRestore()
  })

  test("uses BufferInstance when atob is unavailable", async () => {
    const originalAtob = globalThis.atob
    delete globalThis.atob

    try {
      const hotsock = new HotsockClient(wssBaseUrl, {
        connectTokenFn: () => testValidToken,
      })
      await hotsock.activeConnection.initializationComplete()

      // Token was validated successfully using Buffer fallback
      expect(hotsock.activeConnection.ws).toBeDefined()
      expect(hotsock.activeConnection.ws.url).toBe(
        wssBaseUrl + `?token=${testValidToken}`,
      )

      hotsock.terminate()
    } finally {
      globalThis.atob = originalAtob
    }
  })
})

describe("module-level Buffer loading", () => {
  test("loads BufferInstance from require('buffer') when global.Buffer is missing", () => {
    const savedBuffer = global.Buffer
    delete global.Buffer

    jest.resetModules()
    const { HotsockClient: FreshHotsockClient } = require("../src/hotsock")
    expect(FreshHotsockClient).toBeDefined()

    global.Buffer = savedBuffer
    jest.resetModules()
  })

  test("skips require('buffer') when window is defined (browser-like environment)", () => {
    const savedBuffer = global.Buffer
    const savedWindow = global.window
    delete global.Buffer
    global.window = {} // simulate browser-like environment

    jest.resetModules()
    // In browser-like env, typeof window !== "undefined" so the else-if
    // at line 5 is skipped, leaving BufferInstance as null. The module
    // still loads; decoding will rely on atob instead.
    const { HotsockClient: FreshHotsockClient } = require("../src/hotsock")
    expect(FreshHotsockClient).toBeDefined()

    global.Buffer = savedBuffer
    if (savedWindow === undefined) {
      delete global.window
    } else {
      global.window = savedWindow
    }
    jest.resetModules()
  })

  test("decodeBase64 throws when neither atob nor BufferInstance is available", async () => {
    jest.useFakeTimers()
    const savedBuffer = global.Buffer
    const savedAtob = globalThis.atob
    delete global.Buffer
    delete globalThis.atob

    jest.resetModules()
    jest.mock("buffer", () => ({ Buffer: undefined }))

    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {})
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {})

    const { HotsockClient: FreshHotsockClient } = require("../src/hotsock")

    // With no atob and no BufferInstance, isJwtExpired catches the decodeBase64
    // error and returns true, treating the token as expired, exhausting retries
    const errorFn = jest.fn()
    const hotsock = new FreshHotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
      connectTokenErrorFn: errorFn,
    })
    const promise = hotsock.activeConnection.initializationComplete()
    await jest.advanceTimersByTimeAsync(1000)
    await promise

    expect(errorFn).toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    global.Buffer = savedBuffer
    globalThis.atob = savedAtob
    jest.unmock("buffer")
    jest.resetModules()
    jest.useRealTimers()
  })
})
