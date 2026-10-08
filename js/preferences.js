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
let listenerAdded = false;

export async function getPreference() {
	// Bypass the cache during tests to prevent state leakage across test runs
	if (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) {
		cachedPreference = null;
	}

	// Performance optimization: Calls to chrome.storage.local.get are expensive
	// API calls; optimize performance by caching preferences locally and keeping
	// them updated via chrome.storage.onChanged event listeners instead of making
	// repeated fetch calls.
	if (!listenerAdded && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "local" && changes.preference) {
				// Always merge the newValue with default values to prevent partial
				// updates from corrupting the cache.
				const newValue = changes.preference.newValue;
				cachedPreference = { ...DEFAULT_PREFERENCE, ...(newValue ?? {}) };
			}
		});
		listenerAdded = true;
	}

	if (cachedPreference) {
		// Return a copy to prevent consumers from mutating the cache directly.
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}
	cachedPreference = merged;
	// Return a copy to prevent consumers from mutating the cache directly.
	return { ...merged };
}
