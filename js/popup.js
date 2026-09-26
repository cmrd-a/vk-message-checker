//================================================================
// Popup - Manifest V3 (message passing)
//================================================================
"use strict";

const AVATAR_COLORS = ["#0077ff", "#ec3a2f", "#2fbf71", "#b23fec", "#d98c00", "#0fb5c9", "#ec3f8e", "#6b7f99"];
const LAST_CHECKED_REFRESH_MS = 30000;

// Small deterministic hash so the same sender always gets the same color.
function hashCode(str) {
	let h = 0;
	for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
	return Math.abs(h);
}

// A colored circle with the sender's first initial, standing in for an
// avatar until/unless a real photo (avatarUrl) loads on top of it.
function buildAvatar(name, avatarUrl) {
	const avatar = document.createElement("div");
	avatar.className = "msg-avatar";
	avatar.setAttribute("aria-hidden", "true");
	avatar.style.background = AVATAR_COLORS[hashCode(name || "?") % AVATAR_COLORS.length];
	avatar.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";

	if (avatarUrl) {
		const img = document.createElement("img");
		img.className = "msg-avatar-img";
		img.src = avatarUrl;
		img.alt = "";
		img.addEventListener("error", () => img.remove()); // leave the initial showing
		avatar.appendChild(img);
	}

	return avatar;
}

// Render a relative "checked Xm ago" style label.
function formatAgo(timestamp) {
	if (!timestamp) { return ""; }
	const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSec < 45) { return I18N.getMessage("justNow") || "just now"; }
	const minutes = Math.round(diffSec / 60);
	if (minutes < 60) { return I18N.getMessage("minutesAgo", [String(minutes)]) || `${minutes}m ago`; }
	const hours = Math.round(minutes / 60);
	return I18N.getMessage("hoursAgo", [String(hours)]) || `${hours}h ago`;
}

document.addEventListener("DOMContentLoaded", async () => {
	await I18N.ready;
	const close = () => window.close();

	function makeClickable(el, handler) {
		el.addEventListener("click", handler);
		el.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handler(e);
			}
		});
	}

	makeClickable(document.getElementById("open"), () => {
		chrome.runtime.sendMessage({ type: "open" });
		close();
	});
	makeClickable(document.getElementById("openTitle"), () => {
		chrome.runtime.sendMessage({ type: "open" });
		close();
	});
	makeClickable(document.getElementById("checkNow"), () => {
		chrome.runtime.sendMessage({ type: "checkNow" });
		close();
	});
	makeClickable(document.getElementById("options"), () => {
		chrome.runtime.openOptionsPage();
		close();
	});

	// Fetch and display messages
	chrome.runtime.sendMessage({ type: "getMessages" }, (response) => {
		const { messages, lastCheckedAt, unreadCount } = response || {};

		const headerCount = document.getElementById("headerCount");
		headerCount.textContent = unreadCount > 0 ? String(unreadCount) : "";

		const lastChecked = document.getElementById("lastChecked");
		const renderLastChecked = () => {
			const ago = formatAgo(lastCheckedAt);
			lastChecked.textContent = ago ? (I18N.getMessage("lastChecked", [ago]) || `Checked ${ago}`) : "";
		};
		renderLastChecked();
		setInterval(renderLastChecked, LAST_CHECKED_REFRESH_MS);

		const list = document.getElementById("messageList");
		list.innerHTML = "";

		if (!messages || messages.length === 0) {
			const div = document.createElement("div");
			div.className = "no-messages";
			div.textContent = I18N.getMessage("statusEmpty") || "No unread messages";
			list.appendChild(div);
			return;
		}

		// Performance optimization: use a DocumentFragment to batch DOM insertions
		// and avoid multiple layout recalculations (reflows) in the loop.
		const fragment = document.createDocumentFragment();

		// Performance optimization: parse DOM template once instead of multiple createElement calls
		const itemTemplate = document.createElement("template");
		itemTemplate.innerHTML = `
			<div class="msg-item" role="button" tabindex="0">
				<div class="msg-header">
					<div class="msg-texts">
						<div class="msg-sender"></div>
						<div class="msg-subject"></div>
						<div class="msg-snippet"></div>
					</div>
				</div>
			</div>
		`;

		messages.forEach(msg => {
			const item = itemTemplate.content.cloneNode(true).firstElementChild;
			if (msg.isUnread) { item.classList.add("unread"); }

			const header = item.firstElementChild;
			const texts = header.firstElementChild;
			const sender = texts.children[0];
			const subject = texts.children[1];
			const snippet = texts.children[2];

			header.insertBefore(buildAvatar(msg.sender, msg.avatarUrl), texts);

			sender.textContent = msg.sender || "";
			subject.textContent = msg.subject || "";
			snippet.textContent = msg.snippet || "";

			const fullText = `${msg.sender || ""}. ${msg.subject || ""}. ${msg.snippet || ""}`;
			item.setAttribute("aria-label", fullText);
			item.setAttribute("title", fullText);

			makeClickable(item, () => {
				chrome.runtime.sendMessage({ type: "open", url: msg.href });
				close();
			});

			fragment.appendChild(item);
		});

		list.appendChild(fragment);
	});
});

window.addEventListener("contextmenu", (event) => {
	event.preventDefault();
	event.stopPropagation();
	return false;
});
