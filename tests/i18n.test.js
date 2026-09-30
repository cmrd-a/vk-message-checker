import { jest } from '@jest/globals';
import fs from 'fs';
import vm from 'vm';

function createI18NEnvironment(mockResponses = {}, storagePreference = {}, uiLang = "en") {
    const chromeMock = {
        storage: {
            local: { get: jest.fn().mockResolvedValue({ preference: storagePreference }) }
        },
        i18n: {
            getUILanguage: jest.fn().mockReturnValue(uiLang),
            getMessage: jest.fn((key) => `mocked_${key}`)
        },
        runtime: {
            getURL: jest.fn().mockImplementation((path) => `chrome-extension://mock-id/${path}`)
        }
    };

    const fetchMock = jest.fn().mockImplementation((url) => {
        if (url.includes('en/messages.json') && mockResponses.en) {
            return Promise.resolve({ json: jest.fn().mockResolvedValue(mockResponses.en) });
        } else if (url.includes('ru/messages.json') && mockResponses.ru) {
            return Promise.resolve({ json: jest.fn().mockResolvedValue(mockResponses.ru) });
        }
        return Promise.reject(new Error("Not found"));
    });

    const mockElements = {
        '[data-i18n]': [],
        '[data-i18n-value]': [],
        '[data-i18n-title]': []
    };

    const mockDocument = {
        readyState: "loading",
        addEventListener: jest.fn(),
        querySelectorAll: jest.fn().mockImplementation(() => [
            ...mockElements['[data-i18n]'],
            ...mockElements['[data-i18n-value]'],
            ...mockElements['[data-i18n-title]'],
        ])
    };

    const context = vm.createContext({
        chrome: chromeMock,
        fetch: fetchMock,
        document: mockDocument,
        console: console,
        Array: Array,
        String: String,
        Number: Number,
        Promise: Promise,
        Object: Object,
        setTimeout: setTimeout,
        mockElements
    });

    const code = fs.readFileSync('./js/i18n.js', 'utf-8');
    const script = new vm.Script(code + '\n;globalThis.I18N = I18N;');
    script.runInContext(context);

    return { I18N: context.I18N, context, chromeMock, fetchMock, mockElements };
}

describe('i18n', () => {
    describe('Initialization and Language Resolution', () => {
        it('resolves "auto" to "en" when UI language is English', async () => {
            const { I18N, fetchMock } = createI18NEnvironment({ en: { "key": { "message": "en_msg" } } }, { lang: "auto" }, "en");
            await I18N.ready;
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('en/messages.json'));
        });

        it('resolves "auto" to "ru" when UI language is Russian', async () => {
            const { I18N, fetchMock } = createI18NEnvironment({ ru: { "key": { "message": "ru_msg" } } }, { lang: "auto" }, "ru-RU");
            await I18N.ready;
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ru/messages.json'));
        });

        it('respects explicitly set language over UI language', async () => {
            const { I18N, fetchMock } = createI18NEnvironment({ ru: { "key": { "message": "ru_msg" } } }, { lang: "ru" }, "en");
            await I18N.ready;
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ru/messages.json'));
        });

        it('falls back to "en" if fetching locale fails', async () => {
            // "ru" fetch fails (no mock for ru), should fall back to "en"
            const { I18N, fetchMock } = createI18NEnvironment({ en: { "key": { "message": "en_fallback" } } }, { lang: "ru" }, "ru");
            await I18N.ready;
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ru/messages.json'));
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('en/messages.json'));
            expect(I18N.getMessage("key")).toBe("en_fallback");
        });
    });

    describe('getMessage', () => {
        let I18N;
        beforeEach(async () => {
            const env = createI18NEnvironment({
                en: {
                    "simple": { "message": "Just text" },
                    "with_placeholders": {
                        "message": "Hello $NAME$ you have $1 messages",
                        "placeholders": {
                            "name": { "content": "$1" }
                        }
                    },
                    "missing_placeholder": {
                        "message": "Hey $UNKNOWN$",
                        "placeholders": {}
                    }
                }
            });
            I18N = env.I18N;
            await I18N.ready;
        });

        it('returns exact message if no placeholders are used', () => {
            expect(I18N.getMessage("simple")).toBe("Just text");
        });

        it('substitutes placeholders and numeric arguments correctly', () => {
            expect(I18N.getMessage("with_placeholders", ["Alice"])).toBe("Hello Alice you have Alice messages");
        });

        it('keeps unknown placeholders intact', () => {
            expect(I18N.getMessage("missing_placeholder", ["Bob"])).toBe("Hey $UNKNOWN$");
        });

        it('falls back to chrome.i18n.getMessage for keys missing from messages.json', () => {
            expect(I18N.getMessage("missing_key")).toBe("mocked_missing_key");
        });
    });

    describe('localizePage', () => {
        let I18N, mockElements;
        beforeEach(async () => {
            const env = createI18NEnvironment({
                en: {
                    "ui_text": { "message": "Localized Text" },
                    "ui_value": { "message": "Localized Value" },
                    "ui_title": { "message": "Localized Title" }
                }
            });
            I18N = env.I18N;
            mockElements = env.mockElements;
            await I18N.ready;
        });

        it('fills textContent for [data-i18n] nodes', () => {
            const node = { dataset: { i18n: "ui_text" }, textContent: "" };
            mockElements['[data-i18n]'].push(node);

            I18N.localizePage();

            expect(node.textContent).toBe("Localized Text");
        });

        it('fills value for [data-i18n-value] nodes', () => {
            const node = { dataset: { i18nValue: "ui_value" }, value: "" };
            mockElements['[data-i18n-value]'].push(node);

            I18N.localizePage();

            expect(node.value).toBe("Localized Value");
        });

        it('fills title and aria-label for [data-i18n-title] nodes', () => {
            const setAttributeMock = jest.fn();
            const node = { dataset: { i18nTitle: "ui_title" }, title: "", setAttribute: setAttributeMock };
            mockElements['[data-i18n-title]'].push(node);

            I18N.localizePage();

            expect(node.title).toBe("Localized Title");
            expect(setAttributeMock).toHaveBeenCalledWith("aria-label", "Localized Title");
        });
    });
});
