# Changelog
This file contains the changes made to the package.

The sections are in descending order of the change date.

## [2.0.1] - 2025-05-15
### Fixed
- `Unsubscriber` returned from `addListener` might be wrong and be default value returning `false` instead of actually unsubscribing the event.
The issue is [fixed](https://github.com/incetarik/signalr-hub-client/pull/1) thanks to @sahinkutlu.


## [2.0.0] - 2024-02-12
### Fixed
- `HubClient.off` method may use `.splice` method when a function is passed
to `method` parameter and it was not found and therefore causing `.indexOf`
method to return `-1` which would be passed to `.splice` method causing
an operation that was not supposed to happen.

### Added
- `acceptCleanup` option for allowing any `useListener` event handler function to
return a function to run it on clean-up stage. This option may be a `boolean` or
a function which will take the event name and the hub name and return a `boolean`
indicating if the function returned from the event handler can be used for clean-up
stage.

### Changed
- `HubClient.untilConnected` now uses an internal locking mechanism.
- `DEBUG_HUB_CLIENT` debugging environment is expected to be named as
`SIGNALR_HUB_CLIENT_DEBUG` now.

### Removed
- `HubClient.state` property, `connectionState` property can be used instead.
- `HubClient.methods` property. It is inlined and the methods are passed to the
underlying handler directly.

## [1.0.0] - 2024-01-28
The initial version of the package.

[Unreleased]: https://github.com/incetarik/signalr-hub-client/compare/2.0.1...HEAD
[2.0.1]: https://github.com/incetarik/signalr-hub-client/compare/2.0.1...2.0.0
[2.0.0]: https://github.com/incetarik/signalr-hub-client/compare/2.0.0...1.0.0
[1.0.0]: https://github.com/incetarik/signalr-hub-client/releases/tag/1.0.0
