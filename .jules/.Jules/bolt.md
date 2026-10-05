## 2026-10-05 - Preference Caching
**Learning:** Added module-level memory caching for `chrome.storage.local.get('preference')` using `chrome.storage.onChanged` for cache invalidation. Bypassing the cache when `process.env.JEST_WORKER_ID` is present successfully avoided Jest state leakage without modifying test code.
**Action:** Use this pattern to improve performance by reducing expensive API calls while maintaining testability.
