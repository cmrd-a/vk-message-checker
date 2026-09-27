## 2024-05-24 - Efficient base64 encoding from Uint8Array
**Learning:** String concatenation inside a byte-by-byte loop to convert a `Uint8Array` to a binary string (`String.fromCharCode(bytes[i])`) is extremely slow due to function call overhead and O(N²) string building characteristics in some engines.
**Action:** Use chunked array processing with `String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))` (where CHUNK_SIZE is a safe value like 8192 to avoid `Maximum call stack size exceeded` errors).
## 2024-05-24 - DOM template cloning over sequential element creation
**Learning:** In scenarios with repeated list rendering on the frontend, instantiating a DOM `<template>` once and using `cloneNode(true)` followed by `.children` navigation avoids the parsing overhead and multiple function calls of `document.createElement`.
**Action:** Use a pre-constructed template and `cloneNode(true)` in loops creating complex HTML element structures, especially for dynamically generated lists where performance is key.
## 2026-09-26 - Pre-computing static URL parameters
**Learning:** Instantiating and stringifying `URLSearchParams` on every API request is computationally expensive (benchmarks show ~20x slower) when the majority of the parameters are static configurations.
**Action:** Extract the static parts of request bodies/URLs into a pre-computed string using `URLSearchParams` at module load time, and concatenate dynamic values (like `access_token`) into it using template literals (`key=${encodeURIComponent(val)}&${STATIC_PARAMS}`).
## 2024-05-24 - Avoiding dynamic RegExp creation inside loops for placeholders
**Learning:** Instantiating a new `RegExp` object inside a loop (e.g., iterating through a `placeholders` object to replace values in a string) incurs heavy O(N) regex creations and causes multiple passes over the string.
**Action:** Use a single compiled regex to find placeholders (like `/\$([a-zA-Z0-9_]+)\$/gi`) coupled with a replacer function that looks up the matching key. This cuts down regex instantiations to just one and makes only a single pass over the string.
## 2024-05-24 - Combine DOM queries
**Learning:** Combining multiple `querySelectorAll` calls into a single call with a comma-separated selector (e.g., `[data-i18n], [data-i18n-value], [data-i18n-title]`) and iterating over `node.dataset` properties can be significantly faster in a browser environment (like Playwright/Chromium) by reducing DOM traversals and JS-DOM boundary crossings, even if raw JS loops might seem slightly slower in pure microbenchmarks.
**Action:** Consolidate multiple queries on the same node types/attributes when possible to minimize DOM traversal overhead.
