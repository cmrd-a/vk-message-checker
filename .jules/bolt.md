## 2024-05-24 - Efficient base64 encoding from Uint8Array
**Learning:** String concatenation inside a byte-by-byte loop to convert a `Uint8Array` to a binary string (`String.fromCharCode(bytes[i])`) is extremely slow due to function call overhead and O(N²) string building characteristics in some engines.
**Action:** Use chunked array processing with `String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))` (where CHUNK_SIZE is a safe value like 8192 to avoid `Maximum call stack size exceeded` errors).

## 2024-05-18 - Concurrent Notification Avatar Fetching Ordering
**Learning:** When fetching resources (like user avatars) concurrently via `Promise.all` for a sequential action (like displaying desktop notifications), the order of execution matters. Doing the sequential action inside `Promise.all(map(...))` results in actions happening out-of-order as promises resolve at different times.
**Action:** Always fetch concurrently first with `Promise.all()`, store the array of results, and then iterate sequentially through the results to preserve the original chronological sequence.
