## 2026-10-04 - Jest Module Caching
**Learning:** When implementing module-level caching in ES modules that are tested by Jest, the cache persists across test runs, which can break tests that mock dependencies (like chrome.storage) to return different values sequentially.
**Action:** Always bypass the module-level cache during Jest tests by checking `typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID` to ensure tests remain isolated and side-effect free, without having to inject test-only clear functions.
