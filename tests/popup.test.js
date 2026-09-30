import { jest } from '@jest/globals';
import { protectProperties } from 'jest-util';

// Mock document before importing popup.js. The mocks are protected so Jest's
// per-test global cleanup does not gut the shared objects mid-suite.
global.document = {
    addEventListener: jest.fn(),
    createElement: jest.fn().mockReturnValue({
        className: '',
        setAttribute: jest.fn(),
        style: {},
        textContent: '',
        addEventListener: jest.fn(),
        appendChild: jest.fn(),
        classList: { add: jest.fn() }
    }),
    getElementById: jest.fn().mockReturnValue({
        addEventListener: jest.fn(),
        textContent: '',
        innerHTML: '',
        appendChild: jest.fn()
    }),
    createDocumentFragment: jest.fn().mockReturnValue({
        appendChild: jest.fn()
    })
};
protectProperties(global.document);

global.window = {
    addEventListener: jest.fn(),
    close: jest.fn()
};

global.I18N = {
    ready: Promise.resolve(),
    getMessage: jest.fn((key, args) => {
        if (key === "justNow") return "just now";
        if (key === "minutesAgo") return `${args[0]}m ago`;
        if (key === "hoursAgo") return `${args[0]}h ago`;
        return key;
    })
};

global.chrome = {
    runtime: {
        sendMessage: jest.fn(),
        openOptionsPage: jest.fn()
    }
};

let popup;

beforeAll(async () => {
    popup = await import('../js/popup.js');
});

describe('hashCode', () => {
    it('returns consistent deterministic hash for the same string', () => {
        expect(popup.hashCode("test string")).toBe(popup.hashCode("test string"));
        expect(popup.hashCode("John Doe")).toBe(popup.hashCode("John Doe"));
    });

    it('returns different hash for different strings', () => {
        expect(popup.hashCode("Alice")).not.toBe(popup.hashCode("Bob"));
    });

    it('handles empty strings gracefully', () => {
        // FNV-1a returns its offset basis for an empty string; the point is that
        // it is a stable, non-negative number rather than throwing.
        expect(popup.hashCode("")).toBe(0x811c9dc5);
    });

    it('always returns a positive number', () => {
        const testCases = [
            "a", "b", "z", "A", "Z", "0", "9", "!", "@", "#", " ", "\n", "\t",
            "hello world", "very long string with lots of characters!@#$%",
            "Русский текст", "😊" // Emoji and non-latin chars
        ];

        for (const tc of testCases) {
            expect(popup.hashCode(tc)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('formatAgo', () => {
    const now = Date.now();

    it('returns empty string for missing timestamp', () => {
        expect(popup.formatAgo(null)).toBe("");
        expect(popup.formatAgo(undefined)).toBe("");
    });

    it('returns "just now" for less than 45 seconds', () => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const timestamp1 = now - 1000 * 10; // 10 seconds ago
        const timestamp2 = now - 1000 * 44; // 44 seconds ago

        expect(popup.formatAgo(timestamp1)).toBe("just now");
        expect(popup.formatAgo(timestamp2)).toBe("just now");
        jest.restoreAllMocks();
    });

    it('returns minutes ago for less than 60 minutes', () => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const timestamp1 = now - 1000 * 60 * 5; // 5 minutes ago
        const timestamp2 = now - 1000 * 60 * 59; // 59 minutes ago

        expect(popup.formatAgo(timestamp1)).toBe("5m ago");
        expect(popup.formatAgo(timestamp2)).toBe("59m ago");
        jest.restoreAllMocks();
    });

    it('returns hours ago for 60 minutes or more', () => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const timestamp1 = now - 1000 * 60 * 60 * 2; // 2 hours ago
        const timestamp2 = now - 1000 * 60 * 60 * 24; // 24 hours ago

        expect(popup.formatAgo(timestamp1)).toBe("2h ago");
        expect(popup.formatAgo(timestamp2)).toBe("24h ago");
        jest.restoreAllMocks();
    });
});
