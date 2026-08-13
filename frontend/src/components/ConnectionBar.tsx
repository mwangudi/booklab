import { useEffect, useState } from 'react';
import { CloudOff, Download, RefreshCw, UploadCloud, WifiOff } from 'lucide-react';
import { useOffline } from '../lib/useOffline';
import { formatRemaining } from '../lib/offlineBudget';
import { applyPwaUpdate, PWA_UPDATE_EVENT } from '../lib/pwa';
import { cn } from '../lib/utils';

/**
 * The strip that tells a till what it can and cannot do right now: whether it is
 * connected, how long it may keep trading without a connection, what is still
 * waiting to be sent, and whether a new version is ready to install.
 */
export function ConnectionBar() {
  const { online, expired, warning, remainingMs, pending, flush } = useOffline();
  const [sending, setSending] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    const onUpdate = () => setNeedRefresh(true);
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onUpdate);
  }, []);

  const [installer, setInstaller] = useState<Event | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstaller(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const send = async () => {
    setSending(true);
    try {
      await flush();
    } finally {
      setSending(false);
    }
  };

  const install = async () => {
    const evt = installer as (Event & { prompt?: () => Promise<void> }) | null;
    if (!evt?.prompt) return;
    await evt.prompt();
    setInstaller(null);
  };

  if (online && pending === 0 && !needRefresh && !installer) return null;

  return (
    <div className="space-y-2 mb-4">
      {!online && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
            expired ? 'bg-[#fdf0f0] text-[#9b2626]' : warning ? 'bg-[#fdf3e0] text-[#8a5a00]' : 'bg-[#eaf0f8] text-[#1a4a7a]',
          )}
        >
          {expired ? <CloudOff className="h-4 w-4 mt-0.5 shrink-0" /> : <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />}
          <div className="min-w-0">
            {expired ? (
              <>
                <b>Offline too long.</b> Selling is paused until this device reaches the shop again. Find a connection and
                everything recorded here will be sent.
              </>
            ) : (
              <>
                <b>Working offline.</b> You can keep selling for another {formatRemaining(remainingMs)}, then this device
                has to reconnect.
              </>
            )}
          </div>
        </div>
      )}

      {pending > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[#fdf3e0] px-3 py-2 text-sm text-[#8a5a00]">
          <span className="flex items-center gap-2 min-w-0">
            <UploadCloud className="h-4 w-4 shrink-0" />
            {pending} sale{pending === 1 ? '' : 's'} recorded here and not yet sent to the shop.
          </span>
          {online && (
            <button
              onClick={send}
              disabled={sending}
              className="shrink-0 rounded-md border border-[#8a5a00]/30 px-2 py-1 text-xs font-medium hover:bg-[#8a5a00]/10 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send now'}
            </button>
          )}
        </div>
      )}

      {needRefresh && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[#e8f5ee] px-3 py-2 text-sm text-[#1a7a4a]">
          <span className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-4 w-4 shrink-0" />
            A new version is ready.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setNeedRefresh(false)} className="text-xs hover:underline">
              Later
            </button>
            <button
              onClick={() => void applyPwaUpdate()}
              className="rounded-md border border-[#1a7a4a]/30 px-2 py-1 text-xs font-medium hover:bg-[#1a7a4a]/10"
            >
              Update now
            </button>
          </div>
        </div>
      )}

      {installer && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          <span className="flex items-center gap-2 min-w-0">
            <Download className="h-4 w-4 shrink-0" />
            Install Booklab on this phone for offline selling.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setInstaller(null)} className="text-xs text-muted-foreground hover:underline">
              Not now
            </button>
            <button onClick={install} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
              Install
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
