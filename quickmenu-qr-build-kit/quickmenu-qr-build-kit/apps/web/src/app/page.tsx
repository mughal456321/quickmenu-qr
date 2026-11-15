import Link from "next/link";
import { ArrowRightIcon, QrIcon, ChefHatIcon, UtensilsIcon } from "../components/icons";
import { eyebrowClass } from "../components/ui";

const PREVIEW = [
  { src: "/demo/chicken-biryani.jpg", label: "Chicken Biryani", price: "PKR 700" },
  { src: "/demo/margherita-pizza.jpg", label: "Margherita Pizza", price: "PKR 900" },
  { src: "/demo/cappuccino.jpg", label: "Cappuccino", price: "PKR 400" },
  { src: "/demo/chocolate-brownie.jpg", label: "Chocolate Brownie", price: "PKR 350" },
];

const SECTIONS = [
  {
    href: "/login",
    title: "Owner sign in",
    description: "Build the menu, print table QR codes and manage staff.",
    icon: UtensilsIcon,
    action: "Open dashboard",
  },
  {
    href: "/register",
    title: "Create a restaurant",
    description: "Start a new menu in about two minutes.",
    icon: QrIcon,
    action: "Start free",
  },
  {
    href: "/kitchen",
    title: "Kitchen board",
    description: "Live order tickets for a tablet or wall monitor.",
    icon: ChefHatIcon,
    action: "Open board",
  },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-canvas">
            Q
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            QuickMenu
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-[13px] font-medium text-ink2 transition hover:bg-ink/[0.05]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-canvas transition hover:bg-ink2"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-4 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-10">
        <div>
          <p className={eyebrowClass}>Digital menu &amp; table ordering</p>
          <h1 className="display mt-4 text-[44px] leading-[0.98] tracking-tight text-ink sm:text-[58px] lg:text-[64px]">
            The menu your
            <br />
            room deserves.
          </h1>
          <p className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-ink2">
            Guests scan the code on the table, browse a translated menu with real
            photography, and send the order straight to the pass. No app, no
            waiting for a waiter.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13.5px] font-semibold text-canvas transition hover:bg-ink2"
            >
              Create your menu
              <ArrowRightIcon size={15} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-[13.5px] font-medium text-ink transition hover:border-line-strong"
            >
              Sign in to the dashboard
            </Link>
          </div>

          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-5">
            {[
              ["1", "QR per table"],
              ["60 s", "Menu to live"],
              ["Live", "Kitchen tickets"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="display text-[22px] leading-none text-ink">{value}</dt>
                <dd className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mb-12">
          <div className="rounded-[26px] border border-line bg-surface p-3 shadow-lift">
            <div className="flex items-center justify-between px-2 pb-3 pt-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Table 5 · Dine in
                </p>
                <p className="display text-[20px] leading-tight text-ink">Cafe Aroma</p>
              </div>
              <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium text-muted">
                PKR
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {PREVIEW.map((dish) => (
                <figure
                  key={dish.label}
                  className="overflow-hidden rounded-[16px] border border-line bg-canvas"
                >
                  <img
                    src={dish.src}
                    alt={dish.label}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="flex items-baseline justify-between gap-2 px-2.5 py-2">
                    <span className="truncate text-[11.5px] font-medium text-ink">
                      {dish.label}
                    </span>
                    <span className="tabular text-[10.5px] text-muted">{dish.price}</span>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2.5 rounded-full bg-ink px-3 py-2.5 text-canvas">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas/10 text-[10px] font-semibold tabular">
                2
              </span>
              <span className="flex-1 text-[11.5px] font-medium">View cart</span>
              <span className="tabular text-[11.5px] font-semibold">PKR 1,100</span>
              <ArrowRightIcon size={13} className="opacity-70" />
            </div>
          </div>

          <div className="absolute -bottom-14 left-6 hidden rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-lift sm:block">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">New ticket</p>
            <p className="text-[12.5px] font-medium text-ink">#128 · Table 5</p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-[#F5F0E7]">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
          <p className={eyebrowClass}>Where do you want to go?</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/25 hover:shadow-lift"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-ink2">
                  <section.icon size={17} />
                </span>
                <span className="mt-3 block text-[14px] font-semibold text-ink">
                  {section.title}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                  {section.description}
                </span>
                <span className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-accent">
                  {section.action}
                  <ArrowRightIcon
                    size={13}
                    className="transition group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-5 text-[12px] leading-relaxed text-muted">
            Ordering starts from a table QR code. Ask the owner for the printed code or
            open{" "}
            <code className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink2">
              /m/&lt;qrToken&gt;
            </code>
            . Demo accounts live in the README.
          </p>
        </div>
      </section>
    </main>
  );
}
