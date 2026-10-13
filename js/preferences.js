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

// Cache for preferences to avoid slow I/O calls to chrome.storage.local.get
let cachedPreference = null;

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName === "local" && changes.preference) {
			const newValue = changes.preference.newValue;
			if (newValue) {
				cachedPreference = { ...DEFAULT_PREFERENCE, ...newValue };
			} else {
				cachedPreference = null;
			}
		}
	});
}

export async function getPreference() {
	// Skip caching during test runs to prevent state leakage across Jest test suites
	const isTestEnv = typeof process !== "undefined" && process?.env?.JEST_WORKER_ID;

	// Fast path: use cached object if available, returning a copy to prevent accidental mutation.
	if (!isTestEnv && cachedPreference !== null) {
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	if (!isTestEnv) {
		cachedPreference = merged;
	}

	return { ...merged };
}
