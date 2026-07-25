import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  GraduationCap,
  Laptop,
  Mail,
  MapPin,
  NotebookPen,
  PencilRuler,
  Phone,
  ShoppingBag,
} from 'lucide-react';

const OFFERINGS = [
  { icon: GraduationCap, title: 'Textbooks', desc: 'Curriculum textbooks for primary & secondary — CBC and 8-4-4.' },
  { icon: BookOpen, title: 'Story & Set Books', desc: 'Readers, novels, children’s books and school set books.' },
  { icon: NotebookPen, title: 'Exercise Books', desc: 'Kasuku & KB exercise books, graph and manuscript books.' },
  { icon: PencilRuler, title: 'Stationery', desc: 'Pens, pencils, rulers, geometry sets and everyday supplies.' },
  { icon: FlaskConical, title: 'Lab Equipment', desc: 'School science apparatus, glassware and consumables.' },
  { icon: Laptop, title: 'Computers & IT', desc: 'Computer accessories, printing paper and office supplies.' },
];

const BRANCHES = [
  { name: 'Luanda', where: 'Near Equity Bank' },
  { name: 'Kapsabet', where: 'Next to Bata' },
  { name: 'Mumias', where: 'Opposite Muslim Primary' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/85 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-9 rounded-md" />
            <span className="font-bold text-[15px] hidden sm:block">Booklab Bookshop</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#offer" className="hover:text-foreground">What we offer</a>
            <a href="#branches" className="hover:text-foreground">Branches</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Staff Login <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#7a2e12] via-[#b4530a] to-[#f7941d]" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 text-white">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <ShoppingBag className="h-3.5 w-3.5" /> Luanda · Kapsabet · Mumias
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold leading-tight">
              Booklab Bookshop
            </h1>
            <p className="mt-3 text-xl font-semibold text-white/90">For Quality, For You</p>
            <p className="mt-4 text-white/85 text-lg max-w-xl">
              Your one-stop shop for textbooks, story books, exercise books, stationery, lab equipment and
              computer supplies — quality products at fair prices across our branches.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#branches"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#b4530a] hover:bg-white/90"
              >
                <MapPin className="h-4 w-4" /> Find a branch
              </a>
              <a
                href="#offer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                What we offer
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Offerings */}
      <section id="offer" className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold">Everything for school, office & home</h2>
          <p className="mt-3 text-muted-foreground">From the first pencil to the final exam — and beyond.</p>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {OFFERINGS.map((o) => (
            <div key={o.title} className="rounded-xl border border-border bg-card p-6 hover:shadow-sm hover:border-primary/40 transition-all">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                <o.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">{o.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{o.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Branches */}
      <section id="branches" className="bg-muted/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold">Visit us at our branches</h2>
            <p className="mt-3 text-muted-foreground">Serving Western Kenya and the Rift Valley.</p>
          </div>
          <div className="mt-10 grid sm:grid-cols-3 gap-5">
            {BRANCHES.map((b) => (
              <div key={b.name} className="rounded-xl border border-border bg-card p-6 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{b.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.where}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Promo */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
          <img src="/promo/madaraka-day.jpeg" alt="Booklab Bookshop offers" className="w-full object-cover" />
        </div>
      </section>

      {/* Contact / footer */}
      <footer id="contact" className="bg-[#1c1207] text-white/80">
        <div className="max-w-6xl mx-auto px-4 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="sm:col-span-2">
            <img src="/logo.jpeg" alt="Booklab Bookshop" className="h-12 rounded-md" />
            <p className="mt-4 max-w-sm text-sm text-white/70">
              Booklab Bookshop — For Quality, For You. Textbooks, stationery, lab equipment and more across Luanda,
              Kapsabet and Mumias.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">Branches</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {BRANCHES.map((b) => (
                <li key={b.name} className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[#f7941d]" />
                  <span>
                    <b className="text-white">{b.name}</b> — {b.where}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">Get in touch</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#f7941d]" /> 07XX XXX XXX
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#f7941d]" /> info@booklabbookshop.co.ke
              </li>
              <li>
                <Link to="/login" className="inline-flex items-center gap-1.5 mt-2 text-[#f7941d] hover:underline">
                  Staff portal <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-5 text-xs text-white/50 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} Booklab Bookshop. All rights reserved.</span>
            <span>booklabbookshop.co.ke</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
