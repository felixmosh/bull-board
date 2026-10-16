# Rich failure notifications

Goal: improve the existing Discord/Telegram terminal-failure alerts and add env-configured links into Bull Board.

Design: Discord uses a red embed with queue, prefix, engine, job ID, failure reason, native timestamp and links to the job and failed queue. Telegram uses escaped HTML and inline URL buttons. Add optional BULL_BOARD_NOTIFICATION_BOARD_URL containing the complete public dashboard root (including base path); empty means no links. Validate HTTP(S), reject embedded credentials, queries and fragments, and bound URL length. Show this public setting in the existing read-only Settings section.

Fetch retained-job name, attempts and processing time best-effort, without including job data or options in messages. Limit metadata reads globally to four, fall back after 500 ms or immediately under load, and suppress pending callbacks after queue close. Auto-removed jobs still notify with event metadata. Maintain existing bounded delivery/retry semantics. Do not send test messages to live channels or restart the user's stopped app.

- [x] Add config, formatting/payload, link encoding, metadata fallback and retained-job integration tests; verify red.
- [x] Implement URL validation, structured channel-specific formatting and provider payloads; retain response/retry behavior.
- [x] Implement bounded metadata enrichment and queue wiring; show safe public URL in Settings.
- [x] Document env setting and payload behavior; add empty URL field to local ignored .env without changing credentials.
- [x] Run focused tests, build, CLI integration against disposable Redis, UI tests, formatting/lint and review. Commit verified changes.

Verification: new format/config tests failed against the old text implementation; metadata tests failed against the stub and actual Bull/BullMQ event tests failed on missing metadata before enrichment was wired. Root build passed. Full CLI: 17 suites, 209 passed / 3 skipped. Full UI: 55 suites, 363 passed. Focused oxlint, oxfmt and diff whitespace checks passed. Actual provider payloads inspected with synthetic metadata only; no messages sent to live channels. Local .env keeps credentials unchanged and adds an empty public URL entry. The previously stopped dashboard was not restarted.

Independent review found empty query/fragment delimiters and malformed Unicode route identifiers could break navigation. Added four failing regression cases, rejected literal URL delimiters and added safe route-link fallback on encoding failure. Focused regression verification: 2 suites / 32 tests passed; review confirmed both resolved with no further actionable findings. CLI TypeScript compilation, full CLI suite, format/lint and whitespace checks were rerun successfully after the fixes.
