---
name: Coverage Baseline
description: Test coverage state as of 2026-05-12, before and after the coverage-increase session
type: project
---

## Before (2026-05-12 session start)
- All files: 76.03% funcs / 79.56% lines
- 35 tests across 7 files
- lib/websocket/events.ts: 0% (no tests)
- lib/websocket/server.ts: 0% (no tests)
- lib/api/middleware.ts: 0% (no tests)
- lib/utils/time.ts: 33% funcs / 60% lines
- lib/utils/validation.ts: 75% funcs (isValidNodeId untested)
- lib/config/defaults.ts: 50% funcs (nodeIdToPortOffset uncovered path)
- lib/p2p/messaging.ts: 60% funcs (decodeQueryMessage, decodeResponseMessage untested)
- lib/storage/schema.ts: 69% funcs (saveQueryMessage, saveResponseMessage, getAllPeers, deleteStalePeers, getConfig, setConfig, getState, setState untested)

## After (2026-05-12 session end)
- All files: 95.59% funcs / 93.41% lines
- 146 tests across 13 files (+111 tests, +6 files)
- lib/websocket/events.ts: 100% / 100%
- lib/websocket/server.ts: 88.89% / 75.47% (attachNode lines 24-36 uncovered — requires real GNNNode)
- lib/api/middleware.ts: 100% / 100%
- lib/utils/time.ts: 100% / 100%
- lib/utils/validation.ts: 100% / 100%
- lib/config/defaults.ts: 100% / 100%
- lib/p2p/messaging.ts: 100% / 100%
- lib/storage/schema.ts: 100% / 100%
- lib/storage/database.ts: 100% / 100%

## Remaining gaps
- lib/p2p/node.ts: 73.53% funcs / 49.42% lines (lines 119-131, 137-151, 231-348, 366, 386-403, 427-428, 442-448) — requires live libp2p stack, very hard to unit test
- lib/utils/logger.ts: 71.43% funcs / 76.32% lines (lines 11-15, 22, 42-43) — pino transport/file config and initLogger are hard to test without actual file paths

**Why:** node.ts involves real libp2p/network I/O and logger.ts transport config requires filesystem side effects.
**How to apply:** Focus future coverage effort elsewhere; these gaps are acceptable without integration infrastructure.
