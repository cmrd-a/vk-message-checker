//================================================================
// VK: site URL and the real VK API calls vk.ru/im itself makes.
//
// Reverse-engineered from a HAR capture of a real, logged-in vk.ru/im
// session. VK's own web client is *not* a static page it scrapes - it
// loads an access_token embedded in the page (window.vk.webToken,
// tied to the browser session, short-lived - a few hours) and then
// calls the same api.vk.ru/method/* REST API that would otherwise need
// a registered OAuth app (which VK no longer issues for this use case;
// see README.md). We do the same two steps ourselves:
//   1. GET vk.ru/im, pull webToken.access_token out of the inline script.
//   2. POST that token to api.vk.ru/method/messages.getDiff (counts) or
//      messages.getItems (conversation previews for the popup).
//================================================================

export const messagesURL = "https://vk.ru/im";
export const siteURL = "https://vk.ru";
export const matchPattern = "*://*.vk.ru/*";

const API_BASE = "https://api.vk.ru/method";
const API_VERSION = "5.289";
// vk.ru/im's own first-party web client app id, embedded in the page - not
// an app we registered. Using it just means our request looks like the
// same client the browser already trusts for this session's token.
const CLIENT_ID = "6287487";

const TOKEN_REGEX = /webToken:\s*\{"access_token":"([^"]+)"/;

// Pull the short-lived access_token vk.ru/im embeds for its own API calls.
export function extractAccessToken(html) {
	const match = html.match(TOKEN_REGEX);
	return match ? match[1] : null;
}

export function apiRequestURL(method) {
	return `${API_BASE}/${method}?v=${API_VERSION}&client_id=${CLIENT_ID}`;
}

// Body for messages.getDiff, trimmed to just what unread counters need.
// lp_version=0 asks for a full current snapshot (the captured request used
// a nonzero version to continue an existing long-poll session, which we
// don't have) rather than an incremental diff.
export function diffRequestBody(accessToken) {
	return new URLSearchParams({
		access_token: accessToken,
		v: API_VERSION,
		app_id: CLIENT_ID,
		lp_version: "0",
		conversations_limit: "0",
		extended_filters: "counters",
		group_id: "0",
		counter_filters: "all",
		supported_types: "channels,business,personal,unread,managed_groups,threads",
	}).toString();
}

// Parse messages.getDiff's response for the total unread-message count.
// NOTE: every message in the captured session was already read, so this
// sums *all* messages_folders[].total_count + channels.total_count as a
// best guess at "total unread" - the exact per-folder meaning (inbox vs.
// requests vs. archive) isn't confirmed against a real unread example.
// If this doesn't match what VK's own UI shows you, that's the first
// place to check.
export function parseUnreadCount(diffResponseJson) {
	const counters = diffResponseJson?.response?.counters;
	if (!counters) { return -1; }
	const folders = counters.messages_folders || [];
	const folderTotal = folders.reduce((sum, f) => sum + (f.total_count || 0), 0);
	const channelsTotal = counters.channels?.total_count || 0;
	const total = folderTotal + channelsTotal;
	return Number.isFinite(total) ? total : -1;
}

// Body for messages.getItems (conversation previews for the popup list).
// The captured request's `fields` list was much longer (photos, online
// status, etc.) - trimmed here to just what building a sender label needs.
export function itemsRequestBody(accessToken) {
	return new URLSearchParams({
		access_token: accessToken,
		v: API_VERSION,
		app_id: CLIENT_ID,
		filter: "all",
		extended: "1",
		target_count: "40",
		group_id: "0",
		fields: "first_name,last_name,name",
	}).toString();
}

// A conversation is unread if it's flagged as such, or its last message
// (from someone else) is newer than the user's own read marker.
function isConversationUnread(conversation, lastMessage) {
	if (conversation.is_marked_unread) { return true; }
	if (lastMessage?.out) { return false; } // last message was sent by us
	return conversation.last_message_id > conversation.in_read;
}

function senderLabel(peer, profiles, groups) {
	if (peer.type === "user") {
		const profile = profiles.find(p => p.id === peer.id);
		if (profile) { return `${profile.first_name || ""} ${profile.last_name || ""}`.trim(); }
	} else if (peer.type === "group") {
		const group = groups.find(g => g.id === Math.abs(peer.id));
		if (group?.name) { return group.name; }
	}
	return null;
}

// Parse messages.getItems into the popup's {isUnread, href, sender,
// subject, snippet, actionField, actionValue} shape (subject carries the
// last message preview; VK conversations don't have a separate subject
// line). actionField/actionValue are left null - no delete/mark-read
// action is wired up yet.
export function parseConversationItems(itemsResponseJson) {
	const response = itemsResponseJson?.response;
	const items = response?.conversations?.items;
	if (!Array.isArray(items)) { return []; }

	const profiles = response.profiles || [];
	const groups = response.groups || [];

	return items.map(item => {
		const { conversation, last_message: lastMessage } = item;
		const peer = conversation.peer;
		const sender = senderLabel(peer, profiles, groups) || `id${peer.id}`;

		return {
			isUnread: isConversationUnread(conversation, lastMessage),
			href: `${messagesURL}?sel=${peer.id}`,
			sender,
			subject: lastMessage?.text || "",
			snippet: "",
			actionField: null,
			actionValue: null,
		};
	});
}
