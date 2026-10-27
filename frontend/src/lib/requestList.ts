import { useEffect, useState } from 'react';

/**
 * The website visitor's request list ("basket"), kept in this browser until sent.
 * It survives a reload; nothing is sent to the shop until the visitor submits it.
 */
export interface RequestLine {
  bookId: number;
  title: string;
  sku: string;
  unit: string;
  quantity: number;
}

const KEY = 'booklab_request_list';
const EVENT = 'booklab:request-list';

function read(): RequestLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RequestLine[]) : [];
  } catch {
    return [];
  }
}

function write(lines: RequestLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* private mode: the list still works for this page view */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useRequestList() {
  const [lines, setLines] = useState<RequestLine[]>(read);
  useEffect(() => {
    const refresh = () => setLines(read());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const set = (next: RequestLine[]) => {
    setLines(next);
    write(next);
  };
  return {
    lines,
    count: lines.length,
    add: (l: Omit<RequestLine, 'quantity'>, quantity = 1) => {
      const cur = read();
      const hit = cur.find((x) => x.bookId === l.bookId);
      set(hit ? cur.map((x) => (x.bookId === l.bookId ? { ...x, quantity: x.quantity + quantity } : x)) : [...cur, { ...l, quantity }]);
    },
    setQuantity: (bookId: number, quantity: number) =>
      set(read().map((x) => (x.bookId === bookId ? { ...x, quantity: Math.max(1, Math.min(100000, Math.round(quantity) || 1)) } : x))),
    remove: (bookId: number) => set(read().filter((x) => x.bookId !== bookId)),
    clear: () => set([]),
  };
}
