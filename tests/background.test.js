import { jest } from '@jest/globals';

// Setup chrome mock
const chromeMock = {
  action: {
    setTitle: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setBadgeText: jest.fn(),
    setIcon: jest.fn(),
    setPopup: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  alarms: {
    clear: jest.fn().mockResolvedValue(),
    create: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    onAlarm: { addListener: jest.fn() }
  },
  i18n: {
    getUILanguage: jest.fn().mockReturnValue("en")
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    getManifest: jest.fn(() => ({ version: "0.1.0" }))
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({ preference: {} }),
      set: jest.fn().mockResolvedValue()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ windowId: 1 }),
    create: jest.fn().mockResolvedValue({ id: 2 })
  },
  windows: {
    update: jest.fn().mockResolvedValue()
  },
  offscreen: {
    createDocument: jest.fn().mockResolvedValue(),
    hasDocument: jest.fn().mockResolvedValue(false),
    closeDocument: jest.fn().mockResolvedValue()
  }
};

global.chrome = chromeMock;
global.fetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue({
    statusUnread: { message: "Unread" },
    statusDisconnected: { message: "Disconnected" }
  }),
  text: jest.fn().mockResolvedValue("mock html")
});
global.OffscreenCanvas = class OffscreenCanvas {
  constructor() {}
  getContext() {
    return {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: [] })),
      clearRect: jest.fn()
    };
  }
};

global.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });

// We'll capture listeners to trigger them later
let onMessageListener;
let onAlarmListener;
let onInstalledListener;
let vkMock;
let bg;

beforeAll(async () => {
  // Capture listeners
  chromeMock.runtime.onMessage.addListener.mockImplementation((listener) => {
    onMessageListener = listener;
  });
  chromeMock.alarms.onAlarm.addListener.mockImplementation((listener) => {
    onAlarmListener = listener;
  });
  chromeMock.runtime.onInstalled.addListener.mockImplementation((listener) => {
    onInstalledListener = listener;
  });

  // Mock vk.js before importing background.js
  jest.unstable_mockModule('../js/vk.js', () => ({
    messagesURL: 'http://mock.test/im',
    siteURL: 'http://mock.test',
    matchPattern: '*://mock.test/*',
    extractAccessToken: jest.fn(),
    apiRequestURL: jest.fn((method) => `http://mock.test/method/${method}`),
    diffRequestBody: jest.fn(() => 'mock-diff-body'),
    itemsRequestBody: jest.fn(() => 'mock-items-body'),
    parseUnreadCount: jest.fn(),
    parseConversationItems: jest.fn(() => []),
  }));

  vkMock = await import('../js/vk.js');
  bg = await import('../js/background.js');

  // Wait for the initialize() triggered on load to complete
  await new Promise((resolve) => setTimeout(resolve, 50));
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockResolvedValue({
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue("mock html")
  });
});

describe('fetchText', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should abort and throw when fetch response exceeds REQUEST_TIMEOUT_MS', async () => {
    global.fetch.mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          reject(new Error(options.signal.reason || 'AbortError'));
        };

        if (options.signal.aborted) {
          return onAbort();
        }

        options.signal.addEventListener('abort', onAbort);
      });
    });

    const fetchTextPromise = bg.fetchText('GET', 'http://example.com');

    jest.advanceTimersByTime(bg.REQUEST_TIMEOUT_MS);

    await expect(fetchTextPromise).rejects.toThrow('timeout');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should clear the timeout if fetch succeeds before REQUEST_TIMEOUT_MS', async () => {
    const mockResponse = {
      text: jest.fn().mockResolvedValue('success text')
    };
    global.fetch.mockResolvedValue(mockResponse);

    const fetchTextPromise = bg.fetchText('GET', 'http://example.com');

    const result = await fetchTextPromise;
    expect(result).toBe('success text');

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('resolveLang', () => {
  beforeEach(() => {
    chromeMock.i18n.getUILanguage = jest.fn();
  });

  it('returns "en" when lang is "en"', () => {
    expect(bg.resolveLang({ lang: 'en' })).toBe('en');
  });

  it('returns "ru" when lang is "ru"', () => {
    expect(bg.resolveLang({ lang: 'ru' })).toBe('ru');
  });

  it('falls back to "en" for unsupported languages', () => {
    expect(bg.resolveLang({ lang: 'fr' })).toBe('en');
  });

  it('defaults to "auto" and resolves to "en" when chrome.i18n is not ru', () => {
    chromeMock.i18n.getUILanguage.mockReturnValue('en-US');
    expect(bg.resolveLang({})).toBe('en');
  });

  it('defaults to "auto" and resolves to "ru" when chrome.i18n starts with ru', () => {
    chromeMock.i18n.getUILanguage.mockReturnValue('ru-RU');
    expect(bg.resolveLang({})).toBe('ru');
  });

  it('handles missing chrome.i18n.getUILanguage method gracefully', () => {
    chromeMock.i18n.getUILanguage = undefined;
    expect(bg.resolveLang({ lang: 'auto' })).toBe('en');
  });

  it('handles null preferences', () => {
    chromeMock.i18n.getUILanguage.mockReturnValue('ru-RU');
    expect(bg.resolveLang(null)).toBe('ru');
  });
});

describe('isQuietHours', () => {
  it('returns false when quiet hours are disabled', () => {
    expect(bg.isQuietHours({ quietHoursEnabled: false, quietHoursStart: '23:00', quietHoursEnd: '07:00' }, new Date(2024, 0, 1, 2, 0))).toBe(false);
  });

  it('returns false when start equals end', () => {
    expect(bg.isQuietHours({ quietHoursEnabled: true, quietHoursStart: '10:00', quietHoursEnd: '10:00' }, new Date(2024, 0, 1, 10, 0))).toBe(false);
  });

  it('handles a same-day range', () => {
    const prefs = { quietHoursEnabled: true, quietHoursStart: '09:00', quietHoursEnd: '17:00' };
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 12, 0))).toBe(true);
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 8, 59))).toBe(false);
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 20, 0))).toBe(false);
  });

  it('handles an overnight range', () => {
    const prefs = { quietHoursEnabled: true, quietHoursStart: '23:00', quietHoursEnd: '07:00' };
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 0, 30))).toBe(true);
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 23, 30))).toBe(true);
    expect(bg.isQuietHours(prefs, new Date(2024, 0, 1, 12, 0))).toBe(false);
  });
});

describe('background.js', () => {
  test('setup mock env', () => {
    expect(chrome.action.setTitle).toBeDefined();
  });

  test('initialize sets up alarm and action', async () => {
    if (onInstalledListener) {
      await onInstalledListener();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.storage.local.get).toHaveBeenCalledWith("preference");
    expect(chrome.action.setPopup).toHaveBeenCalled();
    expect(chrome.alarms.get).toHaveBeenCalledWith("checkMessages");
  });

  test('checkNow success sets unread state', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { showToolbarNumber: true, enableNotifications: false } });
    vkMock.extractAccessToken.mockReturnValue('FAKE_TOKEN');
    vkMock.parseUnreadCount.mockReturnValue(5); // 5 unread messages

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("{}")
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalled();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" });
  });

  test('checkNow disconnected state (blank page response)', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: {} });

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("")
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  test('checkNow logged-out state (page loads but has no access token)', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: {} });
    vkMock.extractAccessToken.mockReturnValue(null);

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("<html>login page</html>")
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  test('checkNow unknown state when the VK API returns an error', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: {} });
    vkMock.extractAccessToken.mockReturnValue('FAKE_TOKEN');

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('{"error":{"error_code":10,"error_msg":"Internal error"}}')
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "?" });
  });

  test('open creates new tab', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { openBehavior: 1, resetCounter: false } });
    chrome.tabs.query.mockResolvedValue([]); // No matching tabs

    if (onMessageListener) {
      onMessageListener({ type: "open" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://mock.test/im', active: true }));
  });
});
