## 2024-05-24 - Efficient base64 encoding from Uint8Array
**Learning:** String concatenation inside a byte-by-byte loop to convert a `Uint8Array` to a binary string (`String.fromCharCode(bytes[i])`) is extremely slow due to function call overhead and O(N²) string building characteristics in some engines.
**Action:** Use chunked array processing with `String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))` (where CHUNK_SIZE is a safe value like 8192 to avoid `Maximum call stack size exceeded` errors).
## 2024-05-24 - DOM template cloning over sequential element creation
**Learning:** In scenarios with repeated list rendering on the frontend, instantiating a DOM `<template>` once and using `cloneNode(true)` followed by `.children` navigation avoids the parsing overhead and multiple function calls of `document.createElement`.
**Action:** Use a pre-constructed template and `cloneNode(true)` in loops creating complex HTML element structures, especially for dynamically generated lists where performance is key.
## 2026-09-26 - Pre-computing static URL parameters
**Learning:** Instantiating and stringifying `URLSearchParams` on every API request is computationally expensive (benchmarks show ~20x slower) when the majority of the parameters are static configurations.
**Action:** Extract the static parts of request bodies/URLs into a pre-computed string using `URLSearchParams` at module load time, and concatenate dynamic values (like `access_token`) into it using template literals (`key=${encodeURIComponent(val)}&${STATIC_PARAMS}`).
