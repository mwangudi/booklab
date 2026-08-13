/**
 * Service worker registration.
 *
 * Registered at startup rather than from a component, so the app shell is
 * cached from the very first visit — including the login screen, which is
 * outside the authenticated layout. A till that has never got past login is
 * exactly the one that most needs the shell already on the device.
 */
import { registerSW } from 'virtual:pwa-register';

export const PWA_UPDATE_EVENT = 'booklab:pwa-update';

/** How often an app left open all day checks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export function initPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A till must not reload itself mid-sale, so this only raises a prompt.
      window.dispatchEvent(new Event(PWA_UPDATE_EVENT));
    },
    onRegisteredSW(_url, registration) {
      if (registration) window.setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });
}

/** Activates the waiting version and reloads. */
export function applyPwaUpdate(): Promise<void> {
  return applyUpdate ? applyUpdate(true) : Promise.resolve();
}
