## 2024-05-18 - Range Slider Accessibility
**Learning:** For custom range inputs (like the Auto-check interval), relying on the default numeric value (1-181) is not meaningful for screen readers. Using `aria-valuetext` alongside hiding visual markers with `aria-hidden` provides a much clearer experience by reading the actual computed text (e.g., "5 min" or "Never").
**Action:** When implementing range inputs that map to non-linear or formatted values, always use `aria-valuetext` dynamically in JavaScript to reflect the localized, human-readable value.
