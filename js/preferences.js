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
			cachedPreference = { ...DEFAULT_PREFERENCE, ...(changes.preference.newValue ?? {}) };
		}
	});
}

export async function getPreference() {
	const isTest = typeof process !== "undefined" && process?.env?.JEST_WORKER_ID;

	if (cachedPreference && !isTest) {
		return { ...cachedPreference };
	}

	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };

	if (!isTest) {
		cachedPreference = merged;
	}

	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}

	return { ...merged };
}
