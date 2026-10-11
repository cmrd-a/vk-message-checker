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
	// Bypass caching in Jest tests to prevent state leakage
	const isJest = typeof process !== "undefined" && process?.env?.JEST_WORKER_ID;

	if (!isJest && cachedPreference) {
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };

	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	if (!isJest) {
		cachedPreference = merged;
		return { ...cachedPreference };
	}

	return merged;
}
