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

// Optimization: Cache preferences in-memory to prevent repeated async chrome.storage.local.get calls.
let cachedPreference = null;

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName === 'local' && changes.preference) {
			cachedPreference = { ...DEFAULT_PREFERENCE, ...(changes.preference.newValue ?? {}) };
		}
	});
}

export async function getPreference() {
	// Bypass the cache when tests are running to avoid state leakage between Jest runs.
	const isTestEnv = typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID;

	if (cachedPreference && !isTestEnv) {
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	cachedPreference = merged;
	return { ...merged };
}
