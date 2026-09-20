//================================================================
// VK: site URL and the messages-page parser.
//
// STUB: unlike Yandex Mail's lite inbox (which we reverse-engineered from
// a real HAR capture), nobody has captured real vk.ru messages markup yet.
// analyzeUnreadCount/analyzeMessagesHTML below are deliberately
// unimplemented (return "unknown") rather than guessed, so the extension
// fails safely instead of showing a wrong count. See README.md for what's
// needed to finish this.
//================================================================

export const messagesURL = "https://vk.ru/im";
export const siteURL = "https://vk.ru";
export const matchPattern = "*://*.vk.ru/*";

// Returns: -3 not connected, -2 logged out, -1 unknown response, 0+ unread count.
export function analyzeHTML(input) {
	if (!input || input.length === 0) {
		return -3;
	}
	// TODO: once we have a real HAR/markup capture of vk.ru/im (or a
	// lighter-weight page VK serves, if one exists), parse the unread
	// dialog count out of `input` here - the same way js/edition.js's
	// analyzeHTML parses Yandex's lite-inbox folder counts.
	return -1;
}

// Returns an array of { isUnread, href, sender, subject, snippet } objects
// for the popup's message list, mirroring analyzeMessagesHTML in the
// Yandex Mail checker. Unimplemented for the same reason as analyzeHTML.
export function analyzeMessagesHTML(input) {
	return [];
}
