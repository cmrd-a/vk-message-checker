//================================================================
// i18n helper: loads a locale chosen in settings (not the browser
// UI language) and fills [data-i18n] / [data-i18n-value] elements.
//================================================================
"use strict";

class I18N {
	static #AVAILABLE = ["en", "ru"];
	static #messages = {};

	// Resolve the stored language ("auto"/"en"/"ru") to a supported locale.
	static async #resolveLang() {
		let lang = "auto";
		try {
			const { preference } = await chrome.storage.local.get("preference");
			if (preference?.lang) { lang = preference.lang; }
		} catch {
			// storage may be unavailable; fall back to auto.
		}
		if (lang === "auto") {
			const ui = (chrome.i18n.getUILanguage?.() || "en").toLowerCase();
			lang = ui.startsWith("ru") ? "ru" : "en";
		}
		return I18N.#AVAILABLE.includes(lang) ? lang : "en";
	}

	// Fetch a locale's messages.json from the packaged _locales folder.
	static async #loadLocale(lang) {
		const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
		const response = await fetch(url);
		return response.json();
	}

	// Load the active locale, falling back to English on error.
	static async #init() {
		const lang = await I18N.#resolveLang();
		try {
			I18N.#messages = await I18N.#loadLocale(lang);
		} catch {
			I18N.#messages = await I18N.#loadLocale("en").catch(() => ({}));
		}
		return lang;
	}

	// Look up a string with chrome.i18n-style placeholder substitution.
	static getMessage(key, subs) {
		const entry = I18N.#messages[key];
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

	// Fill [data-i18n] text and [data-i18n-value] values from the locale.
	static localizePage() {
		for (const node of document.querySelectorAll("[data-i18n]")) {
			const message = I18N.getMessage(node.dataset.i18n);
			if (message) { node.textContent = message; }
		}
		for (const node of document.querySelectorAll("[data-i18n-value]")) {
			const message = I18N.getMessage(node.dataset.i18nValue);
			if (message) { node.value = message; }
		}
	}

	// Re-read the selected locale and re-render the page (after a language change).
	static reload() {
		return I18N.#init().then(I18N.localizePage);
	}

	// Resolves once the initial locale is loaded.
	static ready = I18N.#init();
}

I18N.ready.then(() => {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", I18N.localizePage);
	} else {
		I18N.localizePage();
	}
});
