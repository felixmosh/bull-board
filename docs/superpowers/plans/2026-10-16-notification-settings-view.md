# Read-only notification settings

User request: show notification configuration inside the existing Settings modal, as a read-only section matching the supplied screenshot. This extends the previously approved env-only notification design; configuration changes remain in env.

Design: add a Notifications accordion after Jobs. Display the active CLI config snapshot through the existing UIConfig bootstrap, using an explicit allowlist without webhook URLs or bot tokens. Show enabled state, terminal-failure policy, queue/prefix scope, app label, channel status, credential configured flags, Telegram chat/topic, Discord thread, timeout, retries and capacity. If notifications are disabled, state that there is no active delivery configuration rather than inventing settings from ignored env values. Explain that changes require an env edit and restart. Embedded boards without the CLI snapshot retain their existing settings.

Implementation plan:

- [x] Add failing CLI tests for a credential-free snapshot and rendered HTML containing the snapshot but no secrets.
- [x] Add failing SettingsModal tests for readonly values, disabled notifications and missing snapshot.
- [x] Add a public safe DTO in API types, a CLI projection, and pass it through UIConfig in run().
- [x] Add a semantic description list component inside the existing accordion with responsive token-based styling and localized labels.
- [x] Run CLI and UI tests, build, lint/format, and inspect the actual browser at desktop/mobile and dark theme.
- [x] Review and report verified results. Keep changes on the existing feature branch.

Verification: root build passed; UI 55 suites / 363 tests passed; CLI 15 suites / 185 tests passed, 3 cluster tests skipped. Focused oxlint and git diff --check passed. Independent review found no actionable issues. Browser preview checked at the default desktop size, 390×844 (document width 390, dialog width 358), and dark theme, including scroll access to Telegram and delivery settings. Preview used synthetic public config only. The initial full UI test attempt overlapped the API clean/build and could not resolve generated constants; rerunning after build passed all suites.
