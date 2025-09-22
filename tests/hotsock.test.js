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
      "connectTokenFn must be a function"
    )
  })

  test("should throw an error if connectTokenFn returns something that does not resemble a token", async () => {
    await expect(async () => {
      const hotsock = new HotsockClient(wssBaseUrl, {
        connectTokenFn: () => testMalformedToken,
      })
      await hotsock.activeConnection.initializationComplete()
    }).rejects.toThrow("Failed to load a valid token after maximum attempts")
  })

  test("should throw an error if connectTokenFn returns a token that isn't a parseable JWT", async () => {
    await expect(async () => {
      const hotsock = new HotsockClient(wssBaseUrl, {
        connectTokenFn: () => testNotActuallyAToken,
      })
      await hotsock.activeConnection.initializationComplete()
    }).rejects.toThrow("Failed to load a valid token after maximum attempts")
  })

  test("should throw an error if connectTokenFn returns an expired token", async () => {
    await expect(async () => {
      const hotsock = new HotsockClient(wssBaseUrl, {
        connectTokenFn: () => testExpiredToken,
      })
      await hotsock.activeConnection.initializationComplete()
    }).rejects.toThrow("Failed to load a valid token after maximum attempts")
  })

  test("should call connectTokenErrorFn if connectTokenFn returns an expired token", async () => {
    const mockErrorFn = jest.fn()

    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testExpiredToken,
      connectTokenErrorFn: mockErrorFn,
    })

    await hotsock.activeConnection.initializationComplete()

    expect(mockErrorFn).toHaveBeenCalled()
    expect(mockErrorFn.mock.calls[0][0].message).toBe(
      "Failed to load a valid token after maximum attempts"
    )
  })

  test("should create an instance with valid webSocketUrl and connectTokenFn", () => {
    const hotsock = new HotsockClient(wssBaseUrl, {
      connectTokenFn: () => testValidToken,
    })

    expect(hotsock).toBeInstanceOf(HotsockClient)
    expect(hotsock.webSocketUrl).toBe(wssBaseUrl)
    expect(hotsock.connectTokenFn()).toBe(testValidToken)
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
          })
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
          })
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
          })
        )
        expect(cb).toHaveBeenCalled()
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
          '{"event":"hotsock.subscribe","channel":"my-channel"}'
        )

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "my-event",
            channel: "some-other-channel",
          })
        )
        expect(cb).not.toHaveBeenCalled()

        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "my-event",
            channel: "my-channel",
          })
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
          })
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
          })
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
          hotsock.clientEventBindings.get("turn-off-client-event")
        ).toStrictEqual(undefined)
      })

      test("has unbind() function on channel event", () => {
        const cb = jest.fn()
        const binding = hotsock.bind("turn-off-channel-event", cb, {
          channel: "turn-off-channel",
        })
        binding.unbind()
        expect(hotsock.channelEventBindings["turn-off-channel"]).toStrictEqual(
          []
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
            })
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
      })
      describe("hotsock.subscribed", () => {
        beforeEach(() => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.subscribed",
              channel: "my-channel",
              data: {},
              meta: { uid: "456", umd: { name: "Jim" } },
            })
          )
        })
        test("sets channel state", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["state"]).toBe(
            "subscribeConfirmed"
          )
        })
        test("sets channel uid", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["uid"]).toBe(
            "456"
          )
        })
        test("sets channel umd", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["umd"]
          ).toStrictEqual({ name: "Jim" })
        })
        test("sets channel members", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["members"]
          ).toStrictEqual([])
        })
        test("sets channel name", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["name"]
          ).toStrictEqual("my-channel")
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
            })
          )
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.unsubscribed",
              channel: "my-channel",
              data: {},
            })
          )
        })
        test("sets channels state", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["state"]).toBe(
            "unsubscribeConfirmed"
          )
        })
        test("clears channels uid", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["uid"]).toBe(
            null
          )
        })
        test("clears channels umd", () => {
          expect(hotsock.activeConnection.channels["my-channel"]["umd"]).toBe(
            null
          )
        })
        test("clears channels members", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["members"]
          ).toStrictEqual([])
        })
        test("keeps channel name", () => {
          expect(
            hotsock.activeConnection.channels["my-channel"]["name"]
          ).toStrictEqual("my-channel")
        })
      })
      describe("hotsock.ping", () => {
        test("responds with pong", () => {
          mockWebSocket.receiveMessage(
            JSON.stringify({
              event: "hotsock.ping",
              data: {},
            })
          )
          expect(mockWebSocket.send).toHaveBeenCalledWith(
            `{"event":"hotsock.pong"}`
          )
        })
      })
      describe("hotsock.error", () => {})
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
          })
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
          })
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
          })
        )
        expect(messageFn1).not.toHaveBeenCalled()
        expect(messageFn2).toHaveBeenCalled()

        hotsock.unbind(event, {
          messageFn: messageFn2,
          channel: "off-channel",
        })

        expect(mockWebSocket.send).toHaveBeenCalledTimes(2)
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          '{"event":"hotsock.subscribe","channel":"off-channel"}'
        )
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          '{"event":"hotsock.unsubscribe","channel":"off-channel"}'
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
          })
        )
        expect(messageFn1).not.toHaveBeenCalled()
        expect(messageFn2).not.toHaveBeenCalled()
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
        '{"channel":"my-channel","event":"my-event","data":{"my":"data"}}'
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
          })
        )
      })

      test("sets autoSubscribed to true", () => {
        expect(
          hotsock.activeConnection.channels["auto-channel"].autoSubscribed
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
          })
        )
      })

      test("channel remains in subscribeConfirmed state", () => {
        // Run manageSubscriptions
        hotsock.activeConnection.manageSubscriptions()

        expect(hotsock.activeConnection.channels["auto-channel"].state).toBe(
          "subscribeConfirmed"
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
          })
        )
      })

      test("sets autoSubscribed to false", () => {
        expect(
          hotsock.activeConnection.channels["manual-channel"].autoSubscribed
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
          })
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
          })
        )

        // Manually subscribed channel
        mockWebSocket.receiveMessage(
          JSON.stringify({
            event: "hotsock.subscribed",
            channel: "manual-channel",
            data: {},
            meta: { uid: "test-user", umd: null },
          })
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
          })
        )
        expect(mockWebSocket.send).not.toHaveBeenCalledWith(
          JSON.stringify({
            event: "hotsock.unsubscribe",
            channel: "auto-channel",
          })
        )
      })

      test("auto channel stays subscribed while manual channel gets unsubscribed", () => {
        hotsock.activeConnection.manageSubscriptions()

        expect(hotsock.activeConnection.channels["auto-channel"].state).toBe(
          "subscribeConfirmed"
        )
        expect(hotsock.activeConnection.channels["manual-channel"].state).toBe(
          "unsubscribePending"
        )
      })
    })
  })
})
