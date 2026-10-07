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

// Keep cache updated when storage changes
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes.preference) {
			const newValue = changes.preference.newValue;
			cachedPreference = { ...DEFAULT_PREFERENCE, ...(newValue ?? {}) };
		}
	});
}

export async function getPreference() {
	// Bypass cache during Jest tests to prevent state leakage
	const isTestEnv = typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID;

	if (cachedPreference && !isTestEnv) {
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };

	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	if (!isTestEnv) {
		cachedPreference = merged;
		return { ...cachedPreference };
	}

	return merged;
}
