import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, BookOpen, CheckCircle2, Download, FileUp, Pencil, Plus, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { fmt, money, num, pct } from '../lib/format';
import { PRODUCT_CATEGORIES } from '../lib/categories';
import { csvToItems, type ImportItem } from '../lib/csv';
import { downloadCsv } from '../lib/reportExport';
import type { Book } from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { Alert, Button, Card, KpiCard, Loading, Modal, PageHeader, Pill, Td, Th } from '../components/ui';
import { Select2 } from '../components/Select2';

export default function ProductsPage() {
  const { canManage } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data: books, loading, refresh } = useApi<Book[]>(`/api/books${showArchived ? '?archived=only' : ''}`, [showArchived]);
  const [category, setCategory] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Book | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [parsed, setParsed] = useState<{ items: ImportItem[]; unmapped: string[] } | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; error: string }[]; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openImport = () => {    setParsed(null);
    setResult(null);
    setImportError(null);
    setFileName('');
    setImportOpen(true);
  };

  const onFile = async (file: File) => {
    setImportError(null);
    setResult(null);
    try {
      const { items, unmapped } = csvToItems(await file.text());
      setFileName(file.name);
      setParsed({ items, unmapped });
      if (items.length === 0) setImportError('No product rows found. The file needs a header row with at least an “Item name” column.');
    } catch {
      setImportError('Could not read that file.');
    }
  };

  const doImport = async () => {
    if (!parsed || parsed.items.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await api.post<{ created: number; updated: number; errors: { row: number; error: string }[]; total: number }>('/api/books/import', {
        items: parsed.items,
      });
      setResult(res);
      setParsed(null);
      setFileName('');
      refresh();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await api.delete(`/api/books/${archiveTarget.id}`);
      setArchiveTarget(null);
      refresh();
    } catch (err) {
      setArchiveError(err instanceof ApiError ? err.message : 'Could not archive this product.');
    } finally {
      setArchiving(false);
    }
  };

  const restore = async (b: Book) => {
    setArchiveError(null);
    try {
      await api.post(`/api/books/${b.id}/restore`);
      refresh();
    } catch (err) {
      setArchiveError(err instanceof ApiError ? err.message : 'Could not restore this product.');
    }
  };

  const downloadTemplate = () =>
    downloadCsv(
      'booklab-catalogue-template.csv',
      ['Item name', 'Category', 'Cost', 'Retail', 'Wholesale', 'School', 'SKU'],
      [
        ['Bic Ballpoint Pen Blue', 'Stationery', 12, 25, '', '', 'SN-0001'],
        ['A4 Exercise Book 200pg', 'Exercise Book', 75, 120, 100, 90, ''],
        ['Oxford English Dictionary', 'Reference', 1700, 2500, '', 2300, ''],
      ],
    );

  const all = books ?? [];
  const rows = useMemo(() => (category ? all.filter((b) => b.category === category) : all), [all, category]);

  const catalogueValue = all.reduce((s, b) => s + num(b.unitPrice), 0);
  const categoriesUsed = new Set(all.map((b) => b.category).filter(Boolean)).size;

  const columns: Column<Book>[] = [
    {
      key: 'title',
      header: 'Title',
      accessor: (b) => b.title,
      sortable: true,
      render: (b) => (
        <div>
          <div className="font-medium text-foreground">{b.title}</div>
          {b.author && <div className="text-[11px] text-muted-foreground">{b.author}</div>}
        </div>
      ),
    },    { key: 'sku', header: 'SKU', accessor: (b) => b.sku, sortable: true, render: (b) => <span className="font-mono text-xs">{b.sku}</span> },
    {
      key: 'category',
      header: 'Category',
      accessor: (b) => b.category ?? '',
      render: (b) => (b.category ? <Pill tone="blue">{b.category}</Pill> : <span className="text-muted-foreground">—</span>),
    },
    { key: 'isbn', header: 'ISBN', render: (b) => <span className="font-mono text-xs text-muted-foreground">{b.isbn ?? '—'}</span> },
    { key: 'cost', header: 'Cost', align: 'right', accessor: (b) => num(b.costPrice), sortable: true, render: (b) => <span className="font-mono">{money(b.costPrice)}</span> },
    { key: 'price', header: 'Price', align: 'right', accessor: (b) => num(b.unitPrice), sortable: true, render: (b) => <span className="font-mono">{money(b.unitPrice)}</span> },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      accessor: (b) => (num(b.unitPrice) > 0 ? (num(b.unitPrice) - num(b.costPrice)) / num(b.unitPrice) : 0),
      sortable: true,
      render: (b) => {
        const up = num(b.unitPrice);
        const ratio = up > 0 ? (up - num(b.costPrice)) / up : 0;
        return <Pill tone={ratio >= 0.3 ? 'green' : ratio > 0 ? 'amber' : 'red'}>{pct(ratio)}</Pill>;
      },
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) => (
        <div className="flex items-center justify-end gap-3">
          {b.deletedAt ? (
            <button onClick={() => restore(b)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </button>
          ) : (
            <>
              <Link to={`/products/${b.id}/edit`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
              <button
                onClick={() => {
                  setArchiveTarget(b);
                  setArchiveError(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-[#9b2626] hover:underline"
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            </>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={showArchived ? 'Archived products' : 'Products'}
        subtitle={
          showArchived
            ? 'Products removed from sale. Their sales history is kept intact.'
            : 'Books, textbooks, exercise books, story books and stationery.'
        }
        right={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? <BookOpen className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {showArchived ? 'Live catalogue' : 'Archived'}
              </Button>
              <Button variant="outline" onClick={openImport}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Link to="/products/new">
                <Button>
                  <Plus className="h-4 w-4" /> New product
                </Button>
              </Link>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Products" value={fmt(all.length)} tone="blue" icon={<BookOpen className="h-4 w-4" />} />
        <KpiCard label="Categories in use" value={fmt(categoriesUsed)} tone="purple" />
        <KpiCard label="Avg. retail price" value={money(all.length ? catalogueValue / all.length : 0)} tone="green" />
      </div>

      <Card className="p-4">
        {loading ? (
          <Loading />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchable={(b) => `${b.title} ${b.author ?? ''} ${b.sku} ${b.isbn ?? ''} ${b.category ?? ''}`}
            searchPlaceholder="Search title, author, SKU, ISBN…"
            initialSort={{ key: 'title', dir: 'asc' }}
            emptyText="No products yet. Add your first product to get started."
            pageSize={12}
            rowKey={(b) => b.id}
            rightSlot={
              <Select2
                className="sm:w-48"
                value={category}
                onChange={setCategory}
                options={[{ value: '', label: 'All categories' }, ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))]}
              />
            }
          />
        )}
      </Card>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import catalogue from CSV"
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Close
            </Button>
            {parsed && parsed.items.length > 0 && !result && (
              <Button onClick={doImport} loading={importing}>
                <FileUp className="h-4 w-4" /> Import {parsed.items.length} products
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV with a header row. Recognised columns: <b>Item name</b>, Category, Cost, Retail, Wholesale, School, SKU,
            Author, ISBN. Existing products are matched by SKU (or name) and updated; new ones are added. Missing prices default to 0.
          </p>

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
              <Upload className="h-4 w-4" /> Choose CSV file
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Download template
            </Button>
          </div>

          {importError && <Alert tone="red">{importError}</Alert>}

          {parsed && parsed.items.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-foreground">
                <b>{parsed.items.length}</b> products found in <span className="font-mono">{fileName}</span>.
              </div>
              {parsed.unmapped.length > 0 && <Alert tone="amber">Ignored unrecognised columns: {parsed.unmapped.join(', ')}.</Alert>}
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <Th>Item</Th>
                      <Th>Category</Th>
                      <Th num>Cost</Th>
                      <Th num>Retail</Th>
                      <Th num>Wholesale</Th>
                      <Th num>School</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.slice(0, 6).map((it, i) => (
                      <tr key={i} className="border-t border-border">
                        <Td>{it.title}</Td>
                        <Td>{it.category ?? '—'}</Td>
                        <Td num>{it.costPrice ?? '—'}</Td>
                        <Td num>{it.unitPrice ?? '—'}</Td>
                        <Td num>{it.priceWholesale ?? '—'}</Td>
                        <Td num>{it.priceSchool ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.items.length > 6 && <div className="text-xs text-muted-foreground">…and {parsed.items.length - 6} more.</div>}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-[#1a7a4a]/20 bg-[#e8f5ee] px-4 py-3 text-sm text-[#1a7a4a]">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Import complete
              </div>
              <div className="mt-1">
                {result.created} added · {result.updated} updated{result.errors.length ? ` · ${result.errors.length} skipped` : ''} (of {result.total}).
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1 text-xs text-[#8a5a00] list-disc pl-5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive product"
        footer={
          <>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={archive} loading={archiving}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          </>
        }
      >
        {archiveTarget && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">{archiveTarget.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{archiveTarget.sku}</div>
            </div>
            <Alert tone="amber">
              The product is removed from the till, stock lists and reports, but nothing is deleted — past sales keep
              their detail and you can restore it at any time from the Archived view.
            </Alert>
            {archiveError && <Alert tone="red">{archiveError}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
