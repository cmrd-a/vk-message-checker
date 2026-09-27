import { jest } from '@jest/globals';
import { getPreference, DEFAULT_PREFERENCE } from '../js/preferences.js';

describe('getPreference', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
        }
      }
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return DEFAULT_PREFERENCE and set storage when no preference exists', async () => {
    global.chrome.storage.local.get.mockResolvedValue({});
    global.chrome.storage.local.set.mockResolvedValue();

    const result = await getPreference();

    expect(global.chrome.storage.local.get).toHaveBeenCalledWith('preference');
    expect(result).toEqual(DEFAULT_PREFERENCE);
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ preference: DEFAULT_PREFERENCE });
  });

  it('should return merged preference and not set storage when partial preference exists', async () => {
    const partialPref = { interval: 60, showPopup: false };
    global.chrome.storage.local.get.mockResolvedValue({ preference: partialPref });

    const result = await getPreference();

    expect(global.chrome.storage.local.get).toHaveBeenCalledWith('preference');
    expect(result).toEqual({ ...DEFAULT_PREFERENCE, ...partialPref });
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('should return saved preference and not set storage when full preference exists', async () => {
    const fullPref = { ...DEFAULT_PREFERENCE, lang: 'en', interval: 15 };
    global.chrome.storage.local.get.mockResolvedValue({ preference: fullPref });

    const result = await getPreference();

    expect(global.chrome.storage.local.get).toHaveBeenCalledWith('preference');
    expect(result).toEqual(fullPref);
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
