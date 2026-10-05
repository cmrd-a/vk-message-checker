export const DEFAULT_PREFERENCE = {
	lang: "auto",
	interval: 30,
	showToolbarNumber: true,
	showPopup: true,
	resetCounter: false,
	reUseExistingTab: true,
	openBehavior: 1,
	showOnlyUnreadInPopup: true,
	enableNotifications: true,
	notificationSound: "default",
	flashIconOnNewMail: true,
	quietHoursEnabled: false,
	quietHoursStart: "23:00",
	quietHoursEnd: "07:00",
};

let cachedPreference = null;

// Listen for preference changes from other contexts to keep cache fresh
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes.preference) {
			// Ensure we always have full preferences by merging defaults
			cachedPreference = { ...DEFAULT_PREFERENCE, ...(changes.preference.newValue ?? {}) };
		}
	});
}

export async function getPreference() {
	// Bypass cache during Jest tests to prevent state leakage
	const isTestEnv = typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID;

	if (cachedPreference && !isTestEnv) {
		// Return a copy to prevent consumers from accidentally mutating the cache
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	if (!isTestEnv) {
		cachedPreference = { ...merged }; // Store a copy
	}

	// Return a copy to prevent consumers from mutating the merged object
	return { ...merged };
}
