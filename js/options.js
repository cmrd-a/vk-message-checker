//================================================================
// Options - Manifest V3 (chrome.storage based)
//================================================================
"use strict";

import { getPreference } from "./preferences.js";

const MAX_AUTO_CHECK_RANGE = 181;
const NEVER_INTERVAL = 0x7fffffff;

const $ = (id) => document.getElementById(id);

const msg = (key, subs) => I18N.getMessage(key, subs);

// Format the slider value as a human-readable "check every ..." line.
function updateAutoCheckText() {
	const value = Number($("autoCheckRange").value);
	let text;
	if (value === MAX_AUTO_CHECK_RANGE) {
		text = msg("never");
	} else if (value >= 60) {
		const hours = Math.floor(value / 60);
		const minutes = value % 60;
		text = `${hours} ${msg("hoursShort")}`;
		if (minutes !== 0) { text += ` ${minutes} ${msg("minutesShort")}`; }
	} else {
		text = `${value} ${msg("minutesShort")}`;
	}
	$("autoCheckText").textContent = msg("checkEvery", [text]);
	$("autoCheckRange").setAttribute("aria-valuetext", text);
}

// Convert a stored interval (minutes, or "never") to a slider position.
function intervalToSlider(interval) {
	if (interval === NEVER_INTERVAL) { return MAX_AUTO_CHECK_RANGE; }
	return Math.min(180, Math.max(1, interval));
}

// Convert a slider position back to a stored interval value.
function sliderToInterval(slider) {
	return slider === MAX_AUTO_CHECK_RANGE ? NEVER_INTERVAL : slider;
}

// Populate every form control from the given preferences.
function loadForm(prefs) {
	$("lang").value = prefs.lang;
	$("showOnlyUnreadInPopup").checked = prefs.showOnlyUnreadInPopup;
	$("autoCheckRange").value = intervalToSlider(prefs.interval);
	updateAutoCheckText();
	$("showToolbarNumber").checked = prefs.showToolbarNumber;
	$("showPopup").checked = prefs.showPopup;
	$("noPopup").checked = !prefs.showPopup;
	$("resetCounter").checked = prefs.resetCounter;
	$("reUseExistingTab").checked = prefs.reUseExistingTab;
	$("openInCurrentTab").checked = prefs.openBehavior === 0;
	$("openInNewTab").checked = prefs.openBehavior === 1;
	$("openInNewBackgroundTab").checked = prefs.openBehavior === 2;

	if ($("enableNotifications")) {
		$("enableNotifications").checked = prefs.enableNotifications;
	}
	$("flashIconOnNewMail").checked = prefs.flashIconOnNewMail;
	$("notificationSound").value = prefs.notificationSound;
	$("quietHoursEnabled").checked = prefs.quietHoursEnabled;
	$("quietHoursStart").value = prefs.quietHoursStart;
	$("quietHoursEnd").value = prefs.quietHoursEnd;
	updateQuietHoursRow();
}

// Grey out the quiet-hours time range while the toggle is off.
function updateQuietHoursRow() {
	const enabled = $("quietHoursEnabled").checked;
	$("quietHoursStart").disabled = !enabled;
	$("quietHoursEnd").disabled = !enabled;
	$("quietHoursRow").classList.toggle("disabled", !enabled);
}

// Collect a preferences object from the current form state.
function readForm() {
	let openBehavior = 1;
	if ($("openInCurrentTab").checked) {
		openBehavior = 0;
	} else if ($("openInNewBackgroundTab").checked) {
		openBehavior = 2;
	}

	return {
		lang: $("lang").value,
		showOnlyUnreadInPopup: $("showOnlyUnreadInPopup").checked,
		interval: sliderToInterval(Number($("autoCheckRange").value)),
		showToolbarNumber: $("showToolbarNumber").checked,
		showPopup: $("showPopup").checked,
		resetCounter: $("resetCounter").checked,
		reUseExistingTab: $("reUseExistingTab").checked,
		openBehavior,
		enableNotifications: $("enableNotifications") ? $("enableNotifications").checked : true,
		flashIconOnNewMail: $("flashIconOnNewMail").checked,
		notificationSound: $("notificationSound").value,
		quietHoursEnabled: $("quietHoursEnabled").checked,
		quietHoursStart: $("quietHoursStart").value,
		quietHoursEnd: $("quietHoursEnd").value,
	};
}

// Fill texts that aren't static data-i18n nodes (title, version, interval).
function applyDynamicTexts() {
	$("name").textContent = msg("name");
	$("aboutName").textContent = msg("name");
	const { version } = chrome.runtime.getManifest();
	$("aboutVersion").textContent = msg("versionLabel", [version]);
	updateAutoCheckText();
}

// Persist the form, notify the worker, then re-localize in case lang changed.
async function saveForm() {
	await chrome.storage.local.set({ preference: readForm() });
	chrome.runtime.sendMessage({ type: "prefsUpdated" });
	await I18N.reload();
	applyDynamicTexts();
	const status = $("status");
	status.textContent = msg("saved");
	setTimeout(() => { status.textContent = ""; }, 1500);
}

document.addEventListener("DOMContentLoaded", async () => {
	await I18N.ready;
	loadForm(await getPreference());
	applyDynamicTexts();

	$("autoCheckRange").addEventListener("input", updateAutoCheckText);
	$("quietHoursEnabled").addEventListener("change", updateQuietHoursRow);
	$("save").addEventListener("click", saveForm);
});
