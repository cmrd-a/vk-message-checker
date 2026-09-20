//================================================================
// Offscreen page: report the browser light/dark theme to the
// service worker (which cannot call matchMedia itself).
//================================================================
"use strict";

const query = matchMedia("(prefers-color-scheme: dark)");

function reportTheme() {
	chrome.runtime.sendMessage({ type: "themeChanged", dark: query.matches }).catch(() => {
		// Service worker may be asleep; it re-reads on next wakeup.
	});
}

query.addEventListener("change", reportTheme);
reportTheme();


//================================================================
// Notification sounds: synthesized so no audio assets need bundling.
//================================================================
const TONE_PRESETS = {
	chime: { wave: "triangle", notes: [523.25, 659.25, 783.99] }, // ascending C-E-G triad
	bell: { wave: "sine", notes: [880, 660] }, // two-tone bell
};

function playTone(kind) {
	const preset = TONE_PRESETS[kind];
	if (!preset) { return; }
	try {
		const ctx = new (window.AudioContext || window.webkitAudioContext)();
		const now = ctx.currentTime;
		preset.notes.forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = preset.wave;
			osc.frequency.value = freq;
			const start = now + i * 0.12;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
			osc.connect(gain).connect(ctx.destination);
			osc.start(start);
			osc.stop(start + 0.55);
		});
		setTimeout(() => ctx.close(), 1200);
	} catch {
		// Audio unavailable in this context; ignore.
	}
}

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === "playSound") { playTone(message.sound); }
});
