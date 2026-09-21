## 2024-05-24 - DOM Append Optimization
**Learning:** DocumentFragment provides an easy way to bundle DOM insertions to prevent reflow triggers inside loops.
**Action:** Always prefer DocumentFragment when creating and appending multiple DOM nodes sequentially inside loops to improve frontend performance.
