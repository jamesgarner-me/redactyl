import { describe, expect, it } from 'vitest';
import { isMobilePlatform } from './platform';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('isMobilePlatform', () => {
  it('blocks iPhone and Android by user agent', () => {
    expect(isMobilePlatform({ userAgent: IPHONE })).toBe(true);
    expect(isMobilePlatform({ userAgent: ANDROID })).toBe(true);
  });

  it('blocks an iPadOS that masquerades as a desktop Mac (touch points betray it)', () => {
    // Modern iPad Safari sends a Mac UA and platform; only maxTouchPoints differs.
    expect(
      isMobilePlatform({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it('allows a real desktop Mac (no touch points)', () => {
    expect(
      isMobilePlatform({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }),
    ).toBe(false);
  });

  it('allows a touchscreen Windows laptop (not a Mac, not a mobile UA)', () => {
    expect(
      isMobilePlatform({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 10,
      }),
    ).toBe(false);
  });

  it('trusts the Chromium userAgentData.mobile hint when present', () => {
    expect(isMobilePlatform({ userAgent: MAC, userAgentData: { mobile: true } })).toBe(true);
  });
});
