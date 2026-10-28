import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import {
  canInstall, detectBrowser, isInAppBrowser, isInstalled, onInstallAvailability, promptInstall,
  type BrowserKind,
} from '../lib/pwaInstall';
import { Alert, Button, Card, PageHeader, Pill, SectionTitle } from '../components/ui';

const APP_URL = 'https://www.booklabbookshop.co.ke';

const STEPS: Record<BrowserKind, { browser: string; steps: string[] }> = {
  'chrome-android': {
    browser: 'Chrome on Android',
    steps: [
      'Tap the menu (three dots) at the top right.',
      'Tap "Install app" (or "Add to Home screen").',
      'Tap "Install" to confirm.',
    ],
  },
  samsung: {
    browser: 'Samsung Internet',
    steps: ['Tap the menu (three lines) at the bottom right.', 'Tap "Add page to".', 'Tap "Home screen", then "Add".'],
  },
  ios: {
    browser: 'Safari on iPhone or iPad',
    steps: [
      'Tap the Share button (square with an arrow) at the bottom.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" at the top right.',
    ],
  },
  firefox: {
    browser: 'Firefox on Android',
    steps: ['Tap the menu (three dots) at the top right.', 'Tap "Install" or "Add to Home screen".'],
  },
  desktop: {
    browser: 'Chrome or Edge on a computer',
    steps: ['Click the install icon (a screen with a down arrow) at the right of the address bar.', 'Click "Install".'],
  },
  other: {
    browser: 'your browser',
    steps: ['Open the browser menu.', 'Look for "Install app", "Add to Home screen" or "Add page to".'],
  },
};

const OTHERS: BrowserKind[] = ['chrome-android', 'samsung', 'ios', 'desktop'];

/** How to put Booklab on a phone's home screen, with one-tap install where the browser allows it. */
export default function InstallAppPage() {
  const [available, setAvailable] = useState(canInstall());
  const [installed, setInstalled] = useState(isInstalled());
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const inApp = isInAppBrowser();
  const kind = detectBrowser();
  const mine = STEPS[kind];

  useEffect(() => onInstallAvailability(setAvailable), []);

  const install = async () => {
    if ((await promptInstall()) === 'accepted') setInstalled(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Install the app"
        subtitle="Put Booklab on your phone's home screen: it opens full screen, like any other app, and keeps working when the network drops."
      />

      <Card className="p-4 space-y-4">
        {installed ? (
          <Alert tone="green">The app is installed on this device. Open it from the Booklab icon on your home screen.</Alert>
        ) : (
          <>
            {inApp && (
              <Alert tone="amber">
                <div className="font-semibold mb-1">You opened this from inside another app</div>
                <p className="mb-2">
                  This is the browser built into WhatsApp or Facebook, and it <b>can never install apps</b> — that is why
                  the option is missing.
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Tap the menu (three dots) in the corner of this screen.</li>
                  <li>Choose <b>Open in browser</b> or <b>Open in Chrome</b>.</li>
                  <li>Sign in there, come back to this page and follow the steps below.</li>
                </ol>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-white/70 px-2 py-1 text-xs">{APP_URL}</code>
                  <Button variant="outline" onClick={copyLink}>
                    {copied ? 'Copied' : 'Copy address'}
                  </Button>
                </div>
              </Alert>
            )}

            {available && (
              <div className="rounded-lg border border-border p-4 flex flex-wrap items-center gap-3">
                <Smartphone className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-[180px]">
                  <div className="text-sm font-medium">One-tap install</div>
                  <div className="text-xs text-muted-foreground">This browser can install Booklab directly.</div>
                </div>
                <Button onClick={install}>
                  <Download className="h-4 w-4" /> Install now
                </Button>
              </div>
            )}

            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">Steps for {mine.browser}</span>
                <Pill tone="blue">This device</Pill>
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm">
                {mine.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                A <b>Booklab</b> icon appears on the home screen. Always open it from there. Administrators and managers
                land on the dashboard; cashiers land on the till.
              </p>
            </div>

            <button onClick={() => setShowAll((v) => !v)} className="text-sm text-primary underline underline-offset-2">
              {showAll ? 'Hide other browsers' : 'Using a different browser?'}
            </button>

            {showAll && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {OTHERS.filter((k) => k !== kind).map((k) => (
                  <div key={k} className="rounded-lg border border-border p-3">
                    <div className="text-sm font-medium mb-2">{STEPS[k].browser}</div>
                    <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
                      {STEPS[k].steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <SectionTitle>Trouble signing in</SectionTitle>
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>Sign in with your <b>username</b> (for example <b>kapsabet.cashier</b>) or your email.</li>
          <li>Usernames have no spaces and no capital letters.</li>
          <li>If you are signed out mid-shift, the session has expired after 12 hours — sign in again.</li>
          <li>Forgotten password? An administrator can reset it under Administration → Users.</li>
        </ul>
      </Card>

      <Card className="p-4 space-y-2">
        <SectionTitle>App not updating</SectionTitle>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm">
          <li>Finish the sale you are on.</li>
          <li>If <b>A new version is ready</b> shows at the top, tap <b>Update now</b>.</li>
          <li>Otherwise close the app completely and open it again.</li>
        </ol>
      </Card>
    </div>
  );
}
