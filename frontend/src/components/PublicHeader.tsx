import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { useRequestList } from '../lib/requestList';

/** The website's top bar, shared by the home page and the catalogue. */
export function PublicHeader({ home = false }: { home?: boolean }) {
  const { count } = useRequestList();
  return (
    <header className="sticky top-0 z-30 bg-card/85 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-9 rounded-md" />
          <span className="font-bold text-[15px] hidden sm:block">Booklab Bookshop</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/catalogue" className="hover:text-foreground">Catalogue</Link>
          {home ? (
            <>
              <a href="#offer" className="hover:text-foreground">What we offer</a>
              <a href="#branches" className="hover:text-foreground">Branches</a>
              <a href="#contact" className="hover:text-foreground">Contact</a>
            </>
          ) : (
            <Link to="/#contact" className="hover:text-foreground">Contact</Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/catalogue/request"
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label={`Your request: ${count} item${count === 1 ? '' : 's'}`}
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Your request</span>
            {count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Staff Login <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
