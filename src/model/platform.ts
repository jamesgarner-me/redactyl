// Redactyl loads a 770 MB NER model fully into memory to build its inference
// session. That's a desktop-class workload: every iOS browser is WebKit with a
// hard per-tab memory cap the model blows past the instant it instantiates
// (the tab gets jetsam-killed and Safari silently reloads — a crash-and-
// re-download loop the user can never escape), and mobile RAM is too tight in
// general. So we gate phones and tablets out at the door, before any bytes are
// fetched, rather than letting them burn a 770 MB download into a guaranteed
// crash. Pure predicate over the platform signals so it's unit-testable.

interface PlatformNav {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

export function isMobilePlatform(nav: PlatformNav = navigator): boolean {
  // Chromium's structured client hint, when present, is the authoritative signal.
  if (nav.userAgentData?.mobile) return true;
  const ua = nav.userAgent ?? '';
  // iPhone/iPod, Android phones and tablets, and older iPads.
  if (/iPhone|iPod|iPad|Android/i.test(ua)) return true;
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel"); a real Mac (even a
  // trackpad one) reports maxTouchPoints 0, so touch points betray the iPad.
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return true;
  return false;
}
