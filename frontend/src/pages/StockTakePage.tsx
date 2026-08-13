import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardList, Download, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { fmt, today } from '../lib/format';
import { parseCsv } from '../lib/csv';
import { downloadCsv } from '../lib/reportExport';
import { BranchSelect, useBranches } from '../components/BranchSelect';
import { Alert, Button, Card, FormField, Input, KpiCard, Loading, PageHeader, SectionTitle, Table, Td, Th } from '../components/ui';

interface SheetRow {
  sku: string;
  title: string;
  category: string;
  unit: string;
  systemQty: number;
}

interface CountRow {
  sku: string;
  counted: number;
}

interface TakeResult {
  counted: number;
  adjusted: number;
  unchanged: number;
  unknown: string[];
  /** Skipped because the daily correction limit for that product was reached. */
  blocked: string[];
  netUnits: number;
}

export default function StockTakePage() {
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [note, setNote] = useState(`Stock take ${today()}`);
  const [counts, setCounts] = useState<CountRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TakeResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sheetUrl = branchId ? `/api/stock/take-sheet?branchId=${branchId}` : null;
  const { data: sheet, loading } = useApi<SheetRow[]>(sheetUrl, [sheetUrl]);

  const bySku = useMemo(() => new Map((sheet ?? []).map((r) => [r.sku.toUpperCase(), r])), [sheet]);

  const downloadTemplate = () => {
    if (!sheet) return;
    const branch = branches?.find((b) => b.id === branchId)?.name ?? 'branch';
    downloadCsv(
      `stock-take-${branch.toLowerCase()}-${today()}.csv`,
      ['SKU', 'Product', 'Category', 'Unit', 'System qty', 'Counted qty'],
      sheet.map((r) => [r.sku, r.title, r.category, r.unit, r.systemQty, '']),
    );
  };

  /** Read the counted column back off the sheet the branch filled in. */
  const onFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('empty');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const skuCol = header.findIndex((h) => h.includes('sku'));
      const countCol = header.findIndex((h) => h.includes('counted'));
      if (skuCol < 0 || countCol < 0) {
        setError('The file needs a “SKU” column and a “Counted qty” column. Download the template to get the right layout.');
        return;
      }
      const parsed: CountRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const sku = (rows[i][skuCol] ?? '').trim();
        const raw = (rows[i][countCol] ?? '').trim();
        if (!sku || raw === '') continue;
        const counted = Number(raw.replace(/[^0-9.\-]/g, ''));
        if (!Number.isFinite(counted)) continue;
        parsed.push({ sku, counted: Math.round(counted) });
      }
      if (parsed.length === 0) {
        setError('No counted quantities were found. Fill in the “Counted qty” column before uploading.');
        return;
      }
      setFileName(file.name);
      setCounts(parsed);
    } catch {
      setError('Could not read that file. Upload the CSV template with the counted column filled in.');
    }
  };

  const apply = async () => {
    if (!branchId || !counts) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<TakeResult>('/api/stock/take', { branchId, note: note.trim() || undefined, items: counts });
      setResult(res);
      setCounts(null);
      setFileName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply the stock take.');
    } finally {
      setBusy(false);
    }
  };

  // Only differences matter to the person reviewing before they commit.
  const preview = useMemo(() => {
    if (!counts) return [];
    return counts
      .map((c) => {
        const row = bySku.get(c.sku.toUpperCase());
        return {
          sku: c.sku,
          title: row?.title ?? 'Unknown SKU',
          unit: row?.unit ?? '',
          systemQty: row?.systemQty ?? 0,
          counted: c.counted,
          delta: (row?.systemQty ?? 0) === c.counted ? 0 : c.counted - (row?.systemQty ?? 0),
          known: !!row,
        };
      })
      .filter((r) => r.delta !== 0 || !r.known);
  }, [counts, bySku]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock take"
        subtitle="Download the count sheet, fill in what you counted, then upload it to correct the system."
        right={
          <Button variant="outline" onClick={downloadTemplate} disabled={!sheet?.length}>
            <Download className="h-4 w-4" /> Download count sheet
          </Button>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FormField label="Branch to count *">
            <BranchSelect value={branchId} onChange={setBranchId} />
          </FormField>
          <div className="lg:col-span-2">
            <FormField label="Reference" hint="Appears on every adjustment in the stock history.">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
          </div>
        </div>
      </Card>

      {!branchId ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Choose a branch to begin a stock take.</Card>
      ) : loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="Products to count" value={fmt(sheet?.length ?? 0)} tone="blue" icon={<ClipboardList className="h-4 w-4" />} />
            <KpiCard label="Rows uploaded" value={fmt(counts?.length ?? 0)} tone="purple" />
            <KpiCard label="Differences found" value={fmt(preview.length)} tone={preview.length > 0 ? 'amber' : 'green'} />
          </div>

          <Card className="p-4 space-y-4">
            <SectionTitle>Upload your count</SectionTitle>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>Download the count sheet — it lists every product with the quantity the system currently holds.</li>
              <li>Count the branch and fill in the <b>Counted qty</b> column. Leave a row blank to skip it.</li>
              <li>Upload the file here, review the differences, then apply.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload counted sheet
              </Button>
              {counts && counts.length > 0 && (
                <Button onClick={apply} loading={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Apply {fmt(preview.filter((p) => p.known).length)} adjustments
                </Button>
              )}
            </div>
            {fileName && <p className="text-xs text-muted-foreground">Loaded {fileName}</p>}
          </Card>

          {preview.length > 0 && (
            <Card className="p-4">
              <SectionTitle>Differences to apply</SectionTitle>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>SKU</Th>
                      <Th>Product</Th>
                      <Th num>System</Th>
                      <Th num>Counted</Th>
                      <Th num>Difference</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <Td>
                          <span className="font-mono text-xs">{r.sku}</span>
                        </Td>
                        <Td>
                          {r.title}
                          {!r.known && <span className="ml-2 text-xs text-[#9b2626]">not in catalogue — will be skipped</span>}
                        </Td>
                        <Td num>{r.known ? fmt(r.systemQty) : '—'}</Td>
                        <Td num>{fmt(r.counted)}</Td>
                        <Td num>
                          <span className={r.delta > 0 ? 'text-[#1a7a4a] font-mono font-semibold' : 'text-[#9b2626] font-mono font-semibold'}>
                            {r.delta > 0 ? '+' : ''}
                            {r.known ? fmt(r.delta) : '—'}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {preview.length > 100 && <p className="mt-2 text-xs text-muted-foreground">…and {preview.length - 100} more.</p>}
            </Card>
          )}

          {result && (
            <Alert tone="green">
              Stock take applied — {fmt(result.counted)} products counted, <b>{fmt(result.adjusted)}</b> adjusted,{' '}
              {fmt(result.unchanged)} already correct, net {result.netUnits > 0 ? '+' : ''}
              {fmt(result.netUnits)} units.
              {result.unknown.length > 0 && ` ${result.unknown.length} SKU(s) were not recognised and were skipped.`} Every
              change is recorded in the stock history against your name.
            </Alert>
          )}

          {result && result.blocked?.length > 0 && (
            <Alert tone="amber">
              {fmt(result.blocked.length)} product(s) were left unchanged because you have already corrected them the
              maximum number of times today: {result.blocked.slice(0, 8).join(', ')}
              {result.blocked.length > 8 && ` and ${result.blocked.length - 8} more`}. A manager can apply those.
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
