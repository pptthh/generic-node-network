---
name: Project Testing Conventions
description: How tests are structured in this repo — bun:test for new files, vitest imports in legacy files, key patterns
type: project
---

The existing unit tests (test/unit/config.test.ts, messaging.test.ts, storage.test.ts, types.test.ts) import from `vitest` not `bun:test`. Do NOT migrate them — they still run correctly with `bun test` because Bun has a vitest-compatible API. New test files must import from `bun:test`.

Test files live under `test/unit/` for unit tests. Use `*.test.ts` naming.

Run tests with `bun test` (never jest/vitest CLI). Run with coverage: `bun test --coverage`.

The `package.json` "test" script points to `vitest run` — this still works via Bun's vitest compat layer. To run only bun-native tests use `bun test <path>` directly.

Database tests require tmpdir isolation: use `join(tmpdir(), \`gnn-test-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`)` for unique paths.

Logger emits pino JSON to stdout during error/warn tests — this is expected noise, not failures.

**Why:** Mixing import sources would break if vitest compat ever changes; keeping existing files stable avoids risk.
**How to apply:** Always use `import { test, expect, describe, ... } from 'bun:test'` in any new test file.
