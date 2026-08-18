import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { downscaleImage, dataUrlBytes } from '../lib/imageResize';
import { slideImageUrl, type PromoSlide } from '../lib/promo';
import { Alert, Button, Card, EmptyState, FormField, Input, Loading, PageHeader, Textarea } from '../components/ui';

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export default function LoginScreenPage() {
  const [slides, setSlides] = useState<PromoSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [picked, setPicked] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSlides(await api.get<PromoSlide[]>('/api/promo/manage'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the login screen slides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const say = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setPicked(await downscaleImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be read.');
    }
  };

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/promo', { imageBase64: picked, title: title || null, subtitle: subtitle || null });
      setPicked(null);
      setTitle('');
      setSubtitle('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
      say('Added. It will show on the next visit to the sign-in screen.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that picture.');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: number, body: Record<string, unknown>, msg: string) => {
    setError(null);
    try {
      await api.put(`/api/promo/${id}`, body);
      await load();
      say(msg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That change could not be saved.');
    }
  };

  const remove = async (s: PromoSlide) => {
    if (!window.confirm(`Remove this picture from the sign-in screen?${s.title ? `\n\n"${s.title}"` : ''}`)) return;
    setError(null);
    try {
      await api.delete(`/api/promo/${s.id}`);
      await load();
      say('Removed.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That picture could not be removed.');
    }
  };

  const move = async (index: number, delta: number) => {
    const next = [...slides];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next);
    try {
      await api.post('/api/promo/reorder', { ids: next.map((s) => s.id) });
    } catch {
      await load();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Login screen"
        subtitle="The pictures that rotate beside the sign-in form."
      />

      {error && <Alert tone="red">{error}</Alert>}
      {notice && <Alert tone="green">{notice}</Alert>}

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Add a picture</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Landscape pictures work best. Large photographs are shrunk automatically before they are uploaded, so there is
          no need to resize anything first.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="aspect-video w-full rounded-lg border border-dashed border-input bg-muted/40 overflow-hidden flex items-center justify-center">
              {picked ? (
                <img src={picked} alt="Selected" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">No picture chosen</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <Button variant="outline" className="mt-3 w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose a picture
            </Button>
            {picked && <p className="mt-2 text-center text-[11px] text-muted-foreground">Will upload as {kb(dataUrlBytes(picked))}</p>}
          </div>

          <div className="md:col-span-7 space-y-3">
            <FormField label="Heading" hint="Optional. Shown large over the picture.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="For Quality, For You" />
            </FormField>
            <FormField label="Caption" hint="Optional. A sentence under the heading.">
              <Textarea
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Books, textbooks, stationery and lab equipment — across all our branches."
              />
            </FormField>
            <Button onClick={add} disabled={!picked || busy}>
              {busy ? 'Saving…' : 'Add to the login screen'}
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Loading />
      ) : slides.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" />}
          title="No pictures yet"
          hint="Until one is added, the sign-in screen shows the built-in Booklab picture."
        />
      ) : (
        <div className="space-y-3">
          {slides.map((s, i) => (
            <Card key={s.id} className="p-4 flex gap-4 items-start">
              <img
                src={slideImageUrl(s)}
                alt={s.title ?? ''}
                className={`h-24 w-40 shrink-0 rounded-lg object-cover ${s.active ? '' : 'opacity-40 grayscale'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.title || <span className="text-muted-foreground">No heading</span>}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.subtitle}</p>
                <p className="text-[11px] text-muted-foreground mt-2">{s.active ? 'Showing' : 'Hidden'} · position {i + 1}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="flex gap-1.5">
                  <Button variant="outline" onClick={() => void move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => void move(i, 1)} disabled={i === slides.length - 1} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    onClick={() => void patch(s.id, { active: !s.active }, s.active ? 'Hidden.' : 'Showing.')}
                    aria-label={s.active ? 'Hide' : 'Show'}
                  >
                    {s.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" onClick={() => void remove(s)} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
