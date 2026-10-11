# Neutralino 6.5 home-directory compatibility

The existing backend calls `os.getPath('home')` for Codex auth, local providers,
quota enrichment and autostart. The pinned framework is 6.5.0, whose path
controller rejects `home` with `NE_OS_INVKNPT` before any auth file is read.

Verified upstream: [Neutralino v6.5.0 os.cpp](https://github.com/neutralinojs/neutralinojs/blob/v6.5.0/api/os/os.cpp),
`os::getPath` and its controller; [official OS API](https://neutralino.js.org/docs/api/os/).
This fix uses the existing upstream `os.getEnv('HOME')` API as a Linux fallback.
No upstream code or assets are copied and no dependency/license boundary changes.
Keeping the pinned runtime avoids an unrelated framework upgrade.

`src/services/neutralinoPaths.ts` centralizes this host adaptation. Newer runtimes
use their native home path; unsupported or empty paths fall back to HOME, while
permission/connection errors remain failures. The config explicitly permits
`os.getEnv`. Existing auth schema, settings, storage, scanner and UI are preserved.

Regression coverage checks auth through the backend with the 6.5 error, newer
runtime behavior, different users (including Unicode and custom home paths),
the shipped `nativeAllowList`, empty paths, missing HOME and native permission errors. No
upstream tests are transplanted; these are project host-compatibility tests.

The fix is part of the repository source and production configuration, not a
launcher environment override or a machine-specific authentication path. Both
`./run.sh` and `pnpm neutralino:build` include it in freshly built desktop packages.
Run `pnpm test` for the compatibility regressions and `pnpm build` to verify the
production frontend. No authentication file is modified or bundled.
