## 2024-05-24 - Efficient base64 encoding from Uint8Array
**Learning:** String concatenation inside a byte-by-byte loop to convert a `Uint8Array` to a binary string (`String.fromCharCode(bytes[i])`) is extremely slow due to function call overhead and O(N²) string building characteristics in some engines.
**Action:** Use chunked array processing with `String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))` (where CHUNK_SIZE is a safe value like 8192 to avoid `Maximum call stack size exceeded` errors).
