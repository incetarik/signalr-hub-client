# signalr-hub-client

A library that provides an easy way to define `SignalR` hubs on the front-end
by a schema object containing the events and the actions.

## Example

```ts
import { useCallback, useEffect } from 'react'
import { CustomType, defineHubObject, Optional } from 'signalr-hub-client'

export const UserHub = defineHubObject({
  // The name of the hub, this will be used to produce the hub url as
  // `/hubs/user`. It is also possible to set the hub url through
  // `hubUrl` property.
  name: 'user',

  // The events on the client-side (front-end), that will be called
  // from the server.
  //
  // The format is like: { [ eventName: string ]: Array<Type> }
  events: {
    onUnreadNotificationNumberChange: [Number /* newNumberOfNotifications */],
    onPermissionChange: [String /* Permission Name */, Boolean /* Permission Value */],
    onAddressChange: [
      {
        country: String,
        addressLine: String,
        extraAddressLine: Optional(String), // will have the `string | undefined` type
        codes: [String] // To represent string array
      }
    ],

    // The following parameter will not have a scheme to validate
    // as the ones defined above, but instead the received argument
    // will have the given type of `YourInterfaceHere`.
    onMessage: [CustomType<YourInterfaceHere>()],
  },

  // The methods that can be invoked/sent from the client-side (front-end) to
  // the server.
  actions: {
    sendMessage: {
      // The arguments to send/invoke the function on the client-side (front-end)
      input: [String /* Receiver ID */, String /* Message Content */],

      // The expected output from the server when it is `invoke`d, optional.
      output: Boolean
    },
    refreshStatus: {
      // No input
      input: [],

      // The output type.
      output: { id: Number, hasChanges: Boolean }
    },

    // The following is an example of an action with no output.
    voidAction: { input: [] }
  },

  // The following properties are optional
  //
  // The `effectModifier` and `callbackModifier` will be used to have
  // modifications/effects on the event functions, which might be useful
  // for React-like libraries.
  effectModifier: useEffect,
  callbackModifier: useCallback,

  // hubStartParameters: ...ObjectPropertiesForSignalRHub...
  // logger: ...LoggerForDebugging...
})
```

At this point, `UserHub` is defined and events can be listened and actions can be
`send` or `invoke`d.

---

## Listening to events

Listening to events are done in two ways:
- `addListener`: Adds an event handler function for an event by name and returns an object
containing `unsubscribe` function property that can be used to unsubscribe the event handler.
- `useListener`: Similar to `addListener` but aiming for `React`-like environments where
a dependency array is passed along with the event listener to unsubscribe/resubscribe to
events.

There are also two ways of adding event listeners:
- Using the `events` property of the defined hub objects.
- Using the `addListener`/`useListener` methods of defined hub objects directly.

The latter requires the event name (type-checked) and there is no other difference
between them.

```ts
const unsubscriber = UserHub.events.onPermissionChange.addListener((permissionName, state) => {
  // Event handler body goes here.
})

// Stop listening to the event when it's not needed anymore.
unsubscriber.unsubscribe()

// -------------------------------

// Another way of event listening:
const unsubscriber = UserHub.addListener('onPermissionChange', (permissionName, state) => {
  // ...
})
```

---

## Listening to events in `React`-like environments

For the `React`-like environments, it may be required to pass a dependency array to re-attach
the event handler with the updated configurations. For such cases, `.useListener` method
can be used. The signature of this method is the same with the `.addListener` with one
additional, optional `dependencyList` parameter.

The handler functions are also passed to `callbackModifier` to have the effect of `useCallback` function.

The `useCallback` and `useEffect` effect functions can be passed to hub definitions.

```tsx
function SomeComponent(props) {
  const [someDependency, setDependency] = useState()

  UserHub.events.onPermissionChange.useListener((permissionName, state) => {
    // Do something here with `someDependency`
  }, [ someDependency ])

  // It is the same if we call it in the following way:
  UserHub.useListener('onPermissionChange', (permissionName, state) => {
    // Do something here with `someDependency`
  }, [ someDependency ])

  return (
    <View/>
  )
}
```

---

## Triggering actions

Calling a method on the server is done in two ways:
- Using `send` method. This will return a `Promise` that will resolve when the request is sent, **not when the response is received**.
- Using `invoke` method. This will return a `Promise` that resolves with the value received
from the server.

```ts
// The following will not wait for the return value from the server
await UserHub.actions.sendMessage.send('receiverId', 'Hello from sender')

// The following will wait the return value from the server
const { id. hasChanges } = await UserHub.actions.refreshStatus.invoke()
```

---

# Support
To support the project, you can send donations to following addresses:
```md
- Bitcoin     : bc1qtut2ss8udkr68p6k6axd0na6nhvngm5dqlyhtn
- Bitcoin Cash: qzmmv43ztae0tfsjx8zf4wwnq3uk6k7zzgcfr9jruk
- Ether       : 0xf542BED91d0218D9c195286e660da2275EF8eC84
- Lightning   : coinos.io/incetarik
```
