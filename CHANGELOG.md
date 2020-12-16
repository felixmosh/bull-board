# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2020-12-16

### Added

- Added the job's return value - #190
- Added example with authentication usage
- Full HMR support at dev time

### Changed

- Bump ini version due to security issue

## [1.1.2] - 2020-12-07

### Fixed

- "Cannot assign to read only property 'exports'" error

## [1.0.0] - 2020-01-X

### Added

- Added pipeline for tests, linting and automatic website deployment upon tagging
- Added website for documentation
- Added the first trivial unit test which snapshots the exposed
- Added a Compose File (`docker-compose.yml`) to simplify running Redis locally
- Added support for `bullmq`
- Added `redis-info` dependency for displaying up-to-date stats from Redis
- Added `constants.ts` for static constants in the client

### Changed

- Migrated entire project to TypeScript
- Bumped dependencies' versions
- Improved README
- Updated example to include `bullmq`
- Renamed `UI` to `router` to reflect what it is
- Refactor `function`'s to arrow functions
- Replaced exclusive `.npmignore` with inclusive `files: Array` in `package.json`

### Fixed

- Fixed eslint configuration

### Removed

- Removed Ramda dependency

## [0.6.0] - 2019-12-05

### Added

- Adds Clean all button for failed jobs as well, previously that was only available on the delayed queue

## [0.5.0] - 2019-10-31

### Added

- Allows users to use different paths from the one configured in Express through proxyUrl param when provided in the request

## [0.4.0] - 2019-10-14

### Added

- This release adds the option to work with queues already set in Bull. This is introduced by the method setQueues, for more information, check docs.

## [0.3.0] - 2019-10-05

### Added

- Add delayed information with updates in real time (kudos to @alexleroyross for one more PR)

### Changed

- Bump Bull, React and date-fns dependencies

### Fixed

- fixes some styling for error stack traces

## [0.2.0] - 2019-09-24

### Added

- Add a Clean action for the queue in delayed status. #18

## [0.1.1] - 2019-09-12

### Fixed

- Fix issue when total_system_memory is not present. #12

## [0.1.0] - 2019-09-03

### Fixed

- Queue data and error stack traces with better highlighting

## [0.0.6] - 2019-08-30

First working version with correct dependencies in place and minimal features available to users

### Added

- Auto polls status for each queue.
- Retry one or all failed jobs
- Status overview for queue healthy (such as memory and connected clients)
