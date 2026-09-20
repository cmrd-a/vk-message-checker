import { analyzeHTML, analyzeMessagesHTML, messagesURL, siteURL, matchPattern } from '../js/vk.js';

describe('vk.js constants', () => {
    it('exposes vk.ru URLs', () => {
        expect(messagesURL).toBe('https://vk.ru/im');
        expect(siteURL).toBe('https://vk.ru');
        expect(matchPattern).toBe('*://*.vk.ru/*');
    });
});

// analyzeHTML/analyzeMessagesHTML are stubs pending a real markup capture
// (see js/vk.js) - these tests document the current, deliberately safe
// "unknown" behavior so a future implementation change is a visible diff.
describe('analyzeHTML (stub)', () => {
    it('returns -3 for empty input', () => {
        expect(analyzeHTML('')).toBe(-3);
    });

    it('returns -1 ("unknown") for any non-empty input, not a guessed count', () => {
        expect(analyzeHTML('<html>whatever vk.ru actually returns</html>')).toBe(-1);
    });
});

describe('analyzeMessagesHTML (stub)', () => {
    it('returns an empty array', () => {
        expect(analyzeMessagesHTML('<html>anything</html>')).toEqual([]);
    });
});
