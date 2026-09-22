//================================================================
// VK Message Checker - Manifest V3 service worker
//================================================================
import {
	messagesURL, matchPattern,
	extractAccessToken, apiRequestURL, diffRequestBody, itemsRequestBody,
	parseUnreadCount, parseConversationItems,
} from "./vk.js";
import { getPreference } from "./preferences.js";

const ALARM_NAME = "checkMessages";
const NEVER_INTERVAL = 0x7fffffff;
const REQUEST_TIMEOUT_MS = 50000;
const DOUBLE_CLICK_MS = 1000;

const CHECKING_COLOR = [60, 120, 216, 255];
const BADGE_COLOR = [0, 119, 255, 255];
const AVAILABLE_LANGS = ["en", "ru"];

// In-memory (non-persistent) state.
const iconCache = { color: null, "mono-light": null, "mono-dark": null };
let darkTheme = false;
let lastIconActive = null;
let checking = false;
let firstClickTime = 0;
let clickTimer = null;
let i18nMessages = {};
let i18nLang = null;
let lastUnreadCount = -1;
let lastCheckedAt = null;
let flashTimer = null;
let cachedToken = null;
let tokenExpiresAt = 0;


//================================================
// Localization (locale chosen in settings)
//================================================
// Map the stored language ("auto"/"en"/"ru") to a concrete supported locale.
export function resolveLang(prefs) {
	let lang = prefs?.lang || "auto";
	if (lang === "auto") {
		const ui = (chrome.i18n.getUILanguage?.() || "en").toLowerCase();
		lang = ui.startsWith("ru") ? "ru" : "en";
	}
	return AVAILABLE_LANGS.includes(lang) ? lang : "en";
}

// Fetch the chosen locale's messages once; skip if already loaded for that lang.
async function loadMessages(prefs) {
	const lang = resolveLang(prefs);
	if (i18nLang === lang) { return; }
	try {
		const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
		i18nMessages = await response.json();
		i18nLang = lang;
	} catch {
		// Keep whatever messages we already had.
	}
}

// Look up a localized string with chrome.i18n-style placeholder substitution.
function t(key, subs) {
	const entry = i18nMessages[key];
	if (!entry?.message) {
		try { return chrome.i18n.getMessage(key, subs) || key; } catch { return key; }
	}
	let text = entry.message;
	if (entry.placeholders) {
		for (const [name, def] of Object.entries(entry.placeholders)) {
			text = text.replace(new RegExp(`\\$${name}\\$`, "gi"), def.content ?? "");
		}
	}
	const args = subs == null ? [] : Array.isArray(subs) ? subs : [subs];
	text = text.replace(/\$(\d+)/g, (_, n) => args[Number(n) - 1] ?? "");
	return text;
}


//================================================
// Icons
//================================================
// Silhouette fill colors for the inactive icon, tuned for each toolbar theme.
const MONO_FILL = {
	"mono-light": [0x5f, 0x63, 0x68],
	"mono-dark": [0xe8, 0xea, 0xed],
};

// Build ImageData from PNG files. setIcon with imageData is reliable in a
// service worker, unlike setIcon with a path which can fail to fetch.
// variant: "color" keeps the artwork; "mono-light" / "mono-dark" recolor it
// into a flat silhouette (using the source alpha) that reads on that theme.
async function loadIconSet(variant) {
	const sources = { 19: "icons/c19.png", 38: "icons/c38.png" };
	const fill = MONO_FILL[variant];

	let rgbMask, alphaMask;
	if (fill) {
		const isLittleEndian = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
		rgbMask = isLittleEndian
			? (fill[2] << 16) | (fill[1] << 8) | fill[0]
			: (fill[0] << 24) | (fill[1] << 16) | (fill[2] << 8);
		alphaMask = isLittleEndian ? 0xFF000000 : 0x000000FF;
	}

	const entries = await Promise.all(
		[19, 38].map(async (size) => {
			const response = await fetch(chrome.runtime.getURL(sources[size]));
			const blob = await response.blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(size, size);
			const ctx = canvas.getContext("2d");
			ctx.drawImage(bitmap, 0, 0, size, size);
			const imageData = ctx.getImageData(0, 0, size, size);
			if (fill) {
				const view32 = new Uint32Array(imageData.data.buffer);
				for (let i = 0; i < view32.length; i++) {
					view32[i] = (view32[i] & alphaMask) | rgbMask;
				}
			}
			return [size, imageData];
		})
	);
	return Object.fromEntries(entries);
}

// Cached icon set for a given variant (loaded lazily, reused afterwards).
async function getIcons(variant) {
	iconCache[variant] ??= await loadIconSet(variant);
	return iconCache[variant];
}

// Swap the toolbar icon between the color (active) and silhouette (inactive)
// sets, picking the silhouette that matches the current browser theme.
async function setActionIcon(active) {
	lastIconActive = active;
	try {
		const variant = active ? "color" : (darkTheme ? "mono-dark" : "mono-light");
		const icons = await getIcons(variant);
		await chrome.action.setIcon({ imageData: { 19: icons[19], 38: icons[38] } });
	} catch {
		// Ignore transient icon-loading failures.
	}
}

// React to a browser light/dark theme change reported by the offscreen page.
function setDarkTheme(isDark) {
	if (darkTheme === isDark) { return; }
	darkTheme = isDark;
	if (lastIconActive !== null) { setActionIcon(lastIconActive); }
}

// Briefly pulse the badge background to draw the eye to new messages, then
// restore the normal badge color.
const FLASH_COLOR = [255, 196, 0, 255];
const FLASH_STEPS = 4;
const FLASH_INTERVAL_MS = 220;

function flashIcon() {
	if (flashTimer) { clearTimeout(flashTimer); }
	let step = 0;
	const tick = () => {
		chrome.action.setBadgeBackgroundColor({ color: step % 2 === 0 ? FLASH_COLOR : BADGE_COLOR });
		step++;
		if (step < FLASH_STEPS) {
			flashTimer = setTimeout(tick, FLASH_INTERVAL_MS);
		} else {
			flashTimer = null;
			chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
		}
	};
	tick();
}


//================================================
// Offscreen document (theme detection)
//================================================
// Service workers have no matchMedia, so a tiny offscreen page watches
// prefers-color-scheme and messages us whenever it flips.
const OFFSCREEN_DOCUMENT = "html/offscreen.html";
let offscreenReady = null;

async function ensureOffscreenDocument() {
	if (!chrome.offscreen) { return; }
	offscreenReady ??= (async () => {
		try {
			if (await chrome.offscreen.hasDocument?.()) { return; }
			await chrome.offscreen.createDocument({
				url: OFFSCREEN_DOCUMENT,
				reasons: ["MATCH_MEDIA"],
				justification: "Detect the browser light/dark theme to adapt the toolbar icon.",
			});
		} catch {
			// A concurrent wakeup may have created it already; ignore.
		}
	})();
	return offscreenReady;
}

// Ask the offscreen page to play a synthesized notification tone
// ("chime" / "bell"). "default" (system sound) and "none" never get here.
async function playNotificationSound(kind) {
	try {
		await ensureOffscreenDocument();
		await chrome.runtime.sendMessage({ type: "playSound", sound: kind });
	} catch {
		// Offscreen doc/messaging can transiently fail; not critical.
	}
}


//================================================
// Apply status to the toolbar action
//================================================
// Localized prefix used in every toolbar tooltip (e.g. "VK Messages").
function appLabel() {
	return t("appName") || "VK Messages";
}

// Show a transient "checking" indicator (blue badge + tooltip).
function setChecking() {
	chrome.action.setTitle({ title: `${appLabel()}: ${t("statusChecking")}` });
	chrome.action.setBadgeBackgroundColor({ color: CHECKING_COLOR });
	chrome.action.setBadgeText({ text: "…" });
}

// Render the toolbar icon, badge and tooltip for a given check result.
function applyState(state, count, prefs) {
	const label = appLabel();
	chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

	switch (state) {
		case "unread":
			setActionIcon(true);
			chrome.action.setBadgeText({ text: prefs?.showToolbarNumber && count > 0 ? String(count) : "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusUnread", [String(count)])}` });
			break;
		case "empty":
			setActionIcon(true);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusEmpty")}` });
			break;
		case "loggedout":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusLoggedOut")}` });
			break;
		case "disconnected":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusDisconnected")}` });
			break;
		case "timeout":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusTimeout")}` });
			break;
		default:
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "?" });
			chrome.action.setTitle({ title: `${label}: ${t("statusUnknown")}` });
			break;
	}
}


//================================================
// Check messages
//================================================
// Fetch a URL as text with credentials and an abortable timeout.
async function fetchText(method, url, body) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
	const options = { method, credentials: "include", redirect: "follow", signal: controller.signal };
	if (body != null) {
		options.body = body;
		options.headers = { "Content-type": "application/x-www-form-urlencoded" };
	}
	try {
		const response = await fetch(url, options);
		return await response.text();
	} finally {
		clearTimeout(timer);
	}
}

// Parse a "HH:MM" preference string into minutes since midnight.
function parseHHMM(value) {
	const [h, m] = String(value || "0:0").split(":").map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Whether "now" (local time) falls inside the configured quiet-hours window.
// Handles overnight ranges (e.g. 23:00 -> 07:00).
export function isQuietHours(prefs, now = new Date()) {
	if (!prefs?.quietHoursEnabled) { return false; }
	const start = parseHHMM(prefs.quietHoursStart);
	const end = parseHHMM(prefs.quietHoursEnd);
	if (start === end) { return false; }
	const nowMin = now.getHours() * 60 + now.getMinutes();
	return start < end ? (nowMin >= start && nowMin < end) : (nowMin >= start || nowMin < end);
}

// GET vk.ru/im and pull out the access_token it embeds for its own API
// calls. `empty` distinguishes a blank response (disconnected) from a real
// page with no token in it (not logged in); throws (like any other fetch)
// if the request itself fails.
async function fetchAccessToken() {
	if (cachedToken && Date.now() < tokenExpiresAt) {
		return { token: cachedToken, empty: false };
	}
	const html = await fetchText("GET", messagesURL, null);
	if (!html) {
		cachedToken = null;
		tokenExpiresAt = 0;
		return { token: null, empty: true };
	}
	const token = extractAccessToken(html);
	if (token) {
		cachedToken = token;
		// Cache for 30 minutes
		tokenExpiresAt = Date.now() + 30 * 60 * 1000;
	}
	return { token, empty: false };
}

// -1 unknown response, 0+ unread count. Distinct from the -3/-2 page-level
// states, which fetchAccessToken already covers.
async function fetchUnreadCount(token) {
	const body = diffRequestBody(token);
	const responseText = await fetchText("POST", apiRequestURL("messages.getDiff"), body);
	let json;
	try {
		json = JSON.parse(responseText);
	} catch {
		return -1;
	}
	if (json.error) {
		return json.error.error_code === 5 ? -2 : -1; // 5 = VK's "authorization failed"
	}
	return parseUnreadCount(json);
}

// Fetch conversation previews (used by both the popup and notifications).
async function fetchConversationItems(token) {
	const body = itemsRequestBody(token);
	const responseText = await fetchText("POST", apiRequestURL("messages.getItems"), body);
	let json;
	try {
		json = JSON.parse(responseText);
	} catch {
		return [];
	}
	if (json.error) { return []; }
	return parseConversationItems(json);
}

// Fetch conversation previews for the popup.
async function getMessages(prefs) {
	const { token } = await fetchAccessToken();
	if (!token) { return []; }
	const messages = await fetchConversationItems(token);
	return prefs.showOnlyUnreadInPopup ? messages.filter(m => m.isUnread) : messages;
}

// chrome.notifications' iconUrl does NOT accept a remote https:// URL
// (unlike Firefox) - only extension-relative paths, data: URLs or blob:
// URLs. To show a sender's real VK avatar we fetch it ourselves and
// convert it to a data URL first. Requires *.vkuserphoto.ru in
// host_permissions (VK's avatar CDN) or the fetch is cross-origin blocked.
async function fetchAvatarDataURL(url) {
	if (!url) { return null; }
	try {
		const response = await fetch(url);
		if (!response.ok) { return null; }
		const contentType = response.headers.get("content-type") || "image/jpeg";
		const bytes = new Uint8Array(await response.arrayBuffer());
		let binary = "";
		// Performance optimization: converting byte array to string in chunks
		// instead of character-by-character to avoid O(N^2) string concatenation overhead.
		const CHUNK_SIZE = 8192;
		for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
			binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
		}
		return `data:${contentType};base64,${btoa(binary)}`;
	} catch {
		return null;
	}
}

// Chrome auto-assigns a unique id when notificationId is omitted, so each
// call here produces its own separate, stacked notification rather than
// replacing/merging with the previous one - important for showing distinct
// senders as distinct notifications instead of collapsing them into one.
function createNotification(title, message, iconUrl, prefs, useSystemSound) {
	chrome.notifications.create({
		type: "basic",
		iconUrl: iconUrl || chrome.runtime.getURL("icons/c128.png"),
		title,
		message,
		silent: !useSystemSound // "default" plays the system sound; other choices are played ourselves (or muted)
	});
}

// Fire one notification per newly-arrived unread message - every sender
// gets their own, none summarized away - using the actual sender/text/
// avatar when we can fetch it. Falls back to a single generic
// "Unread (N)" notification if that lookup comes back empty (e.g. the
// new messages are in a category messages.getItems doesn't surface as
// unread the same way messages.getDiff's counters do).
async function notifyNewMessages(token, count, prefs) {
	const useSystemSound = prefs.notificationSound === "default";
	const delta = Math.max(1, count - lastUnreadCount);

	let newItems = [];
	try {
		const items = await fetchConversationItems(token);
		// Conversations come back sorted newest-active-first, so the first
		// `delta` unread ones are our best guess at "what's new since last check".
		newItems = items.filter(m => m.isUnread).slice(0, delta);
	} catch {
		// Fall through to the generic notification below.
	}

	if (newItems.length === 0) {
		createNotification(t("appName") || "VK Messages", t("statusUnread", [String(count)]), null, prefs, useSystemSound);
	} else {
		for (const item of newItems) {
			const iconUrl = await fetchAvatarDataURL(item.avatarUrl);
			createNotification(item.sender || t("appName") || "VK Messages", item.subject || t("statusUnread", [String(count)]), iconUrl, prefs, useSystemSound);
		}
	}

	if (!useSystemSound && prefs.notificationSound !== "none") {
		playNotificationSound(prefs.notificationSound);
	}
}

// Run a single check and reflect the result on the toolbar icon.
// showProgress: whether to flash the "checking" indicator. Automatic update
// checks (alarm-driven) pass false so the icon doesn't blink on every refresh.
async function checkNow(showProgress = true) {
	if (checking) { return; }
	checking = true;

	let prefs;
	try {
		prefs = await getPreference();
		await loadMessages(prefs);
		if (showProgress) { setChecking(); }

		const { token, empty } = await fetchAccessToken();
		let count;
		if (empty) { count = -3; }
		else if (!token) { count = -2; }
		else { count = await fetchUnreadCount(token); }

		if (count === -3) {
			applyState("disconnected", 0, prefs);
		} else if (count === -2) {
			cachedToken = null;
			tokenExpiresAt = 0;
			applyState("loggedout", 0, prefs);
		} else if (count === -1) {
			applyState("unknown", 0, prefs);
		} else if (count === 0) {
			applyState("empty", 0, prefs);
		} else {
			applyState("unread", count, prefs);

			if (lastUnreadCount !== -1 && count > lastUnreadCount) {
				const quiet = isQuietHours(prefs);
				if (prefs.flashIconOnNewMail && !quiet) { flashIcon(); }
				if (prefs.enableNotifications && !quiet) {
					await notifyNewMessages(token, count, prefs);
				}
			}
		}

		if (count >= 0) {
			lastUnreadCount = count;
		}
	} catch (error) {
		const timedOut = error === "timeout" || error?.name === "AbortError";
		applyState(timedOut ? "timeout" : "disconnected", 0, prefs);
	} finally {
		lastCheckedAt = Date.now();
		checking = false;
	}
}


//================================================
// Open VK
//================================================
// openMode: 0 = current tab, 1 = new/active tab, 2 = new background tab.
async function openURL(targetURL, openMode) {
	if (openMode === 0) {
		const tabs = await chrome.tabs.query({ windowType: "normal", active: true, lastFocusedWindow: true });
		if (tabs.length > 0) {
			await chrome.tabs.update(tabs[0].id, { url: targetURL, active: true });
		} else {
			await openURL(targetURL, 1);
		}
	} else if (openMode === 1) {
		const tabs = await chrome.tabs.query({ windowType: "normal", active: true, lastFocusedWindow: true });
		if (tabs.length > 0 && tabs[0].url === "chrome://newtab/") {
			await chrome.tabs.update(tabs[0].id, { url: targetURL, active: true });
		} else {
			await chrome.tabs.create({ url: targetURL, active: true });
		}
	} else {
		await chrome.tabs.create({ url: targetURL, active: false });
	}
}

// Clear the badge right after opening VK, if the user enabled that option.
function resetCounterOnOpen(prefs) {
	if (prefs.resetCounter) {
		chrome.action.setBadgeText({ text: "" });
		setActionIcon(true);
		chrome.action.setTitle({ title: `${appLabel()}: ${t("statusEmpty")}` });
	}
}

// Open VK messages, optionally reusing an existing VK tab first.
async function openVK(specificUrl = null) {
	const prefs = await getPreference();
	await loadMessages(prefs);
	let targetURL = specificUrl || messagesURL;
	if (prefs.reUseExistingTab) {
		const tabs = await chrome.tabs.query({ windowType: "normal", url: matchPattern });
		if (tabs.length > 0) {
			const tab = await chrome.tabs.update(tabs[0].id, { url: targetURL, active: true });
			if (tab) { await chrome.windows.update(tab.windowId, { focused: true }); }
			if (prefs.resetCounter) resetCounterOnOpen(prefs);
			return;
		}
	}
	await openURL(targetURL, prefs.openBehavior);
	if (prefs.resetCounter) resetCounterOnOpen(prefs);
}


//================================================
// Scheduling
//================================================
// Force recreate (used when the interval setting changes).
async function rescheduleAlarm(prefs) {
	await chrome.alarms.clear(ALARM_NAME);
	if (prefs.interval !== NEVER_INTERVAL) {
		chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, prefs.interval) });
	}
}

// Create only if missing, so frequent service worker wakeups don't reset the countdown.
async function ensureAlarm(prefs) {
	if (prefs.interval === NEVER_INTERVAL) {
		await chrome.alarms.clear(ALARM_NAME);
		return;
	}
	const existing = await chrome.alarms.get(ALARM_NAME);
	if (!existing) {
		chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, prefs.interval) });
	}
}

// Enable the popup menu, or clear it so clicks go to onClicked (single/double).
function applyPopupSetting(prefs) {
	chrome.action.setPopup({ popup: prefs.showPopup ? "html/popup.html" : "" });
}

// Apply settings, ensure the alarm exists and run an initial check.
async function initialize() {
	const prefs = await getPreference();
	applyPopupSetting(prefs);
	ensureOffscreenDocument();
	await ensureAlarm(prefs);
	checkNow(false);
}


//================================================
// Listeners
//================================================
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) { checkNow(false); }
});

chrome.notifications.onClicked.addListener((notificationId) => {
	chrome.notifications.clear(notificationId);
	openVK();
});

chrome.action.onClicked.addListener(() => {
	// Only fires when no popup is set (single/double click mode).
	if (firstClickTime === 0) {
		firstClickTime = Date.now();
		clickTimer = setTimeout(() => {
			firstClickTime = 0;
			openVK();
		}, DOUBLE_CLICK_MS);
	} else {
		clearTimeout(clickTimer);
		firstClickTime = 0;
		checkNow();
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "getMessages") {
		const respond = (messages) => sendResponse({ messages, lastCheckedAt, unreadCount: lastUnreadCount });
		getPreference().then(prefs => getMessages(prefs)).then(respond).catch(() => respond([]));
		return true; // Keep the messaging channel open for sendResponse
	}
	if (message?.type === "themeChanged") {
		setDarkTheme(!!message.dark);
		return false;
	}
	switch (message?.type) {
		case "open":
			openVK(message.url);
			break;
		case "checkNow":
			checkNow();
			break;
		case "prefsUpdated":
			getPreference().then((prefs) => {
				applyPopupSetting(prefs);
				rescheduleAlarm(prefs);
				checkNow(false);
			});
			break;
	}
	return false;
});

// Run once when the service worker is first loaded.
initialize();
export { fetchText, REQUEST_TIMEOUT_MS };
