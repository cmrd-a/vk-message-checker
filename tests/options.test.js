import { jest } from '@jest/globals';

global.document = {
    addEventListener: jest.fn(),
    getElementById: jest.fn()
};
global.I18N = {
    ready: Promise.resolve(),
    getMessage: jest.fn(),
    reload: jest.fn()
};
global.chrome = {
    storage: { local: { set: jest.fn() } },
    runtime: { sendMessage: jest.fn(), getManifest: jest.fn(() => ({version: "1.0"})) }
};

const {
    intervalToSlider, sliderToInterval,
    MAX_AUTO_CHECK_RANGE, NEVER_INTERVAL
} = await import('../js/options.js');

describe('options.js interval conversion', () => {
    describe('intervalToSlider', () => {
        it('returns MAX_AUTO_CHECK_RANGE when interval is NEVER_INTERVAL', () => {
            expect(intervalToSlider(NEVER_INTERVAL)).toBe(MAX_AUTO_CHECK_RANGE);
        });

        it('returns regular values bounded between 1 and 180', () => {
            // Normal in-range value
            expect(intervalToSlider(60)).toBe(60);
            expect(intervalToSlider(1)).toBe(1);
            expect(intervalToSlider(180)).toBe(180);

            // Out-of-bounds (lower)
            expect(intervalToSlider(0)).toBe(1);
            expect(intervalToSlider(-10)).toBe(1);

            // Out-of-bounds (higher, but not NEVER_INTERVAL)
            expect(intervalToSlider(200)).toBe(180);
            expect(intervalToSlider(181)).toBe(180);
        });
    });

    describe('sliderToInterval', () => {
        it('returns NEVER_INTERVAL when slider is MAX_AUTO_CHECK_RANGE', () => {
            expect(sliderToInterval(MAX_AUTO_CHECK_RANGE)).toBe(NEVER_INTERVAL);
        });

        it('returns regular slider values directly', () => {
            expect(sliderToInterval(1)).toBe(1);
            expect(sliderToInterval(60)).toBe(60);
            expect(sliderToInterval(180)).toBe(180);
        });
    });
});
