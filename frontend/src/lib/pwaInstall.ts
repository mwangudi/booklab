// Captures the browser's install offer at startup. Chrome fires it once, often
// while the sign-in page is showing, so it has to be held here rather than inside
// a page or the signed-in layout — those mount too late and miss it.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();
const notify = () => listeners.forEach((l) => l(deferred !== null));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const canInstall = () => deferred !== null;

export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true);

export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') deferred = null;
  notify();
  return outcome;
};

export const onInstallAvailability = (cb: (available: boolean) => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export type BrowserKind = 'samsung' | 'chrome-android' | 'ios' | 'firefox' | 'desktop' | 'other';

/** Links shared through WhatsApp or Facebook open in an embedded browser, which never
 *  offers "install app". Detecting it is the only way to explain the missing option. */
export const isInAppBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|MicroMessenger|; wv\)/i.test(navigator.userAgent);
};

export const detectBrowser = (): BrowserKind => {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) {
    if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
    if (/Chrome|CriOS/i.test(ua)) return 'chrome-android';
    return 'other';
  }
  if (/Chrome|Edg/i.test(ua)) return 'desktop';
  return 'other';
};
