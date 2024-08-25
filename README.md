# Hotsock JavaScript Client

This JS client allows you to connect and handle Hotsock messages on a WebSocket connection. It's designed for use in the browser, provides a small and stable API, and handles reconnects gracefully. React Native is also supported.

## Installation

### Install and import the library

```
npm add @hotsock/hotsock-js
```

or

```
yarn add @hotsock/hotsock-js
```

## Usage

```javascript
import { HotsockClient } from "@hotsock/hotsock-js"
```

### Construct a client object

Each client object manages a WebSocket connection to your Hotsock installation. This client can subscribe to any number of channels and fire callback functions when messages are received.

The `HotsockClient` constructor takes 2 arguments - the WebSocket URL for your installation (`WebSocketsWssUrl` from the installation's CloudFormation stack output) and an object containing a `connectTokenFn` function that returns a valid [connect-scoped JWT](https://www.hotsock.io/docs/connection/claims/#scope) authorizing a connection to the WebSocket.

`connectTokenFn` must return a JWT string or return a `Promise` that resolves to a JWT string (async/await).

Here's an example with a connect function that returns a static JWT string. In a real application, this function would typically be a network call to fetch a token for this user, if they're permitted.

```javascript
const client = new HotsockClient(
  "wss://996iaxdp6g.execute-api.us-east-1.amazonaws.com/v1",
  {
    connectTokenFn: async () => {
      // Implement your token fetching logic here that returns a connect-scoped
      // JWT accepted by your Hotsock installation.
      return "your-jwt-token"
    },
    connectTokenFnMaxAttempts: 3, // Optional, defaults to 2
    lazyConnection: true, // Optional, prevents connection until needed, defaults to false
    logLevel: "debug", // Optional, default log level is "warn"
  }
)
```

### Connection management

You can control the WebSocket connection by suspending, resuming, or terminating it.

```javascript
client.suspend() // Suspend the connection while retaining event bindings
client.resume() // Resume the connection and re-subscribe to channels
client.terminate() // Terminate the connection and clear all bindings
```

### Make a callback function

All message handler functions must accept a single `Object` argument, which is the message pre-parsed from the JSON that came over the WebSocket.

```javascript
function handleMessage(messageObj) {
  console.log("Received Hotsock message", messageObj)
}
```

Given the previous handler, you'd see something like this upon receiving a message in a browser console.

```javascript
Received Hotsock message Object { id: "01HP8BGSHWY952BXW1PE25DSJA", event: "my-event", channel: "my-channel", data: "👋 Hello from Hotsock! こんにちは" }
```

### Subscribe to channel events

By default, a channel subscribe action will use the permissions granted from the [connect-scoped token](https://www.hotsock.io/docs/connection/claims/#scope) that authorized the connection.

The initial `connect` token often does not include permissions for all channels that will be subscribed to during the lifetime of a connection or may need modified [`uid`](https://www.hotsock.io/docs/connections/claims/#uid) / [`umd`](https://www.hotsock.io/docs/connections/claims/#umd) claims. In this case, you can pass a `subscribeTokenFn` that will be called, which must return a valid [subscribe-scoped JWT](https://www.hotsock.io/docs/connections/claims/#scope) that authorizes the channel subscription.

```javascript
const myChannel = client.channels("my-channel")
myChannel.subscribeTokenFn = async ({ channel, connectionId }) => {
  // Implement your token fetching logic here that returns a subscribe-scoped
  // JWT accepted by your Hotsock installation.
  return "your-jwt-token"
}
myChannel.bind("my-event", (message) => {
  console.log("Received message:", message)
})
myChannel.bind("my-other-event", myOtherFn)
```

#### Bind from the client directly

Subscribe to events matching the event name `my-event` on the `my-channel` channel. Each matching message will invoke `handleMessage` with the message object passed as an argument.

```javascript
const binding = client.bind("my-event", handleMessage, {
  channel: "my-channel",
})
```

Or with an inline function:

```javascript
const binding = client.bind("my-event", ({ data }) => console.log(data), {
  channel: "my-channel",
})
```

You can also subscribe with a regex matcher. The following subscribes to all events on the `my-channel` channel.

```javascript
const binding = client.bind(/.+/, handleMessage, { channel: "my-channel" })
```

#### Get info about the channel

From a binding, you can access information about the channel as well as how you're represented in the channel.

Get your connection's `uid` as it is represented in this channel.

```javascript
binding.channel.uid
// "12345"
```

Get your connection's `umd` as it is represented in this channel.

```javascript
binding.channel.umd
// {"name": "Jim"}
```

Get the channel name.

```javascript
binding.channel.name
// "my-channel"
```

Get info about other members of the channel (only populated for presence channels).

```javascript
binding.channel.members
// [{"uid":"12345","umd":{"name":"Jim"},{"uid":"23456","umd":{"name":"Dwight"}]
```

### Publish messages to a channel

If the channel subscription [permits client-initiated messages](https://www.hotsock.io/docs/connections/claims/#channels.messages.publish), use `sendMessage` to publish messages. `data` can be anything that is valid JSON (Object|Array|string|number|boolean|null) up to 32 KiB.

```javascript
const myChannel = client.channels("my-channel")
myChannel.sendMessage("isTyping")
myChannel.sendMessage("chat", { data: { message: "Hello!" } })
```

You can also publish from the client directly, specifying the channel.

```javascript
client.sendMessage("isTyping", { channel: "my-channel" })
client.sendMessage("chat", {
  channel: "my-channel",
  data: { message: "Hello!" },
})
```

### Send a raw message on the WebSocket

If you prepared your message and it's already stringified JSON, you can publish it directly.

```javascript
client.sendRawMessage(`{"event":"hotsock.ping"}`)
client.sendRawMessage(
  `{"event":"chat","channel":"discussion.123","data":{"message":"Hello!"}}`
)
```

# Unsubscribe from channel events

You can unsubscribe from the binding object that was returned when subscribing.

```javascript
binding.unbind()
```

Or, unsubscribe from a channel via the top-level client.

```javascript
client.unbind("my-event", { channel: "my-channel" })
```

## Special connection events

You can subscribe to ALL incoming or outgoing messages at the connection-level, as well as the connection's connect, disconnect, and error events with a special `@@` event prefix for the following events.

```javascript
// Call a function for any message received on the WebSocket, regardless of
// event or channel name.
client.bind("@@message", (event) =>
  console.log("Received WebSocket data", event.data)
)

// Call a function for any message sent on the WebSocket from this client.
client.bind("@@messageSent", (rawMessage) =>
  console.log("Sent WebSocket message", rawMessage)
)

// Call a function when the WebSocket connection is established.
client.bind("@@connect", (event) => console.log("Connected!"))

// Call a function when the WebSocket connection is terminated.
client.bind("@@disconnect", (event) => console.log("Disconnected!"))

// Call a function when a WebSocket-level error occurs. This is not called for
// "hotsock.error" events.
client.bind("@@error", (event) => console.log("An error occurred", event))
```
