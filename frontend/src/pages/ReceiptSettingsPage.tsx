import { useEffect, useMemo, useState } from 'react';
import { Printer, Save } from 'lucide-react';
import { receiptPreviewHtml } from '../lib/printReceipt';
import { printReceipt } from '../lib/printReceipt';
import {
  DEFAULT_RECEIPT_SETTINGS,
  getReceiptSettings,
  saveReceiptSettings,
  type PaperWidth,
  type ReceiptSettings,
} from '../lib/receiptSettings';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import type { ReceiptData } from '../lib/printReceipt';
import { Alert, Button, Card, FormField, Input, PageHeader, SectionTitle } from '../components/ui';
import { Select2 } from '../components/Select2';

const SAMPLE = (cashier?: string, branch?: string | null): ReceiptData => ({
  receiptNo: 1042,
  dateTime: dateTime(new Date().toISOString()),
  branchName: branch ?? 'Luanda',
  branchLocation: 'Near Equity Bank',
  cashier: cashier ?? 'Sample Cashier',
  paymentMethod: 'CASH',
  items: [
    { title: 'KLB Top Scholar English Grade 6', qty: 1, unitPrice: 780 },
    { title: 'A4 Exercise Book 200pg', qty: 4, unitPrice: 120 },
    { title: 'Bic Ballpoint Pen Blue', qty: 2, unitPrice: 25 },
  ],
  total: 1310,
  cashGiven: 1500,
  change: 190,
});

export default function ReceiptSettingsPage() {
  const { user } = useAuth();
  const [s, setS] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => setS(getReceiptSettings()), []);

  const save = () => {
    saveReceiptSettings(s);
    setSaved(true);
    setTick((t) => t + 1);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const sample = useMemo(() => SAMPLE(user?.name, user?.branchName), [user]);

  // The preview reads the *saved* settings, so it always shows what will print.
  const previewSrc = useMemo(() => receiptPreviewHtml(sample), [sample, tick]);
  const dupSrc = useMemo(() => receiptPreviewHtml({ ...sample, copy: 1, reprintedBy: user?.name }), [sample, tick, user]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receipt & printer"
        subtitle="Settings for the printer attached to this till."
        right={
          <>
            <Button variant="outline" onClick={() => printReceipt(sample)}>
              <Printer className="h-4 w-4" /> Test print
            </Button>
            <Button onClick={save}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </>
        }
      />

      {saved && <Alert tone="green">Saved. This till will use the new settings from the next receipt.</Alert>}
      <Alert tone="blue">
        These settings are stored on <b>this device only</b>, because each till can have a different printer. Set them once
        on every EPOS terminal.
      </Alert>

      <div className="space-y-5">
        <Card className="p-4 space-y-4">
          <SectionTitle>Printer</SectionTitle>
          <FormField label="Paper width" hint="80mm suits most desktop EPOS printers; 58mm is the compact/mobile roll.">
            <Select2
              className="sm:w-72"
              value={String(s.paperWidth)}
              onChange={(v) => setS((p) => ({ ...p, paperWidth: Number(v) as PaperWidth }))}
              options={[
                { value: '80', label: '80 mm (standard EPOS)' },
                { value: '58', label: '58 mm (compact / mobile)' },
              ]}
              searchable={false}
            />
          </FormField>

          <FormField label="Extra footer line" hint="Optional — e.g. a returns policy or your KRA PIN.">
            <Input
              value={s.footerNote}
              onChange={(e) => setS((p) => ({ ...p, footerNote: e.target.value }))}
              placeholder="Goods once sold are not returnable"
              maxLength={80}
            />
          </FormField>

          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={s.autoPrint}
              onChange={(e) => setS((p) => ({ ...p, autoPrint: e.target.checked }))}
              className="h-4 w-4 mt-0.5 rounded border-border"
            />
            <span>
              Print automatically when a sale completes
              <span className="block text-xs text-muted-foreground">
                Turn this off if you only print on request — you can still print from the sale confirmation.
              </span>
            </span>
          </label>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Setting up an EPOS printer</p>
            <p>1. Install the printer&apos;s driver on this machine (USB, Bluetooth or network).</p>
            <p>2. Press <b>Test print</b> above and choose that printer in the dialog.</p>
            <p>3. In the dialog set margins to <b>None</b> and turn <b>off</b> headers &amp; footers, then tick &ldquo;remember&rdquo; if your browser offers it.</p>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <SectionTitle>Preview</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Exactly what will print on a {s.paperWidth}mm roll. Save to refresh.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Original</div>
              <iframe
                title="Receipt preview"
                srcDoc={previewSrc}
                className="w-full h-[460px] rounded-lg border border-border bg-white"
              />
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Reprint (duplicate copy)</div>
              <iframe
                title="Duplicate receipt preview"
                srcDoc={dupSrc}
                className="w-full h-[460px] rounded-lg border border-border bg-white"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
