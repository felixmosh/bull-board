# Dashboard pathname

User clarification: no redirect. Use the existing BULL_BOARD_BASE_PATH setting (also --base-path / config.basePath) to mount the dashboard, assets and API directly at /bul. Do not add a redirect from /. Empty path and / keep serving the dashboard at root.

Existing implementation already supports this behavior, so no runtime change is needed. Document the env setting and complete public URL for notification links. Keep the user's env values and stopped app unchanged. Discarded the proposed root redirect after the user's clarification, before committing or rebuilding it.

- [x] Inspect pathname resolution, server mount and UI bootstrap behavior.
- [x] Document direct pathname mounting without a root redirect.
- [x] Smoke-check /bul, its API/static assets and no redirect from / against the built app using synthetic config; check the final diff.

Verification: with BULL_BOARD_BASE_PATH=/bul, GET / returned 404 without a Location header; /bul, /bul/api/queues and the referenced CSS asset returned 200. With an empty base path, the root page, API and CSS returned 200 without a redirect. Used an ephemeral port and no Redis connection. git diff --check passed.
