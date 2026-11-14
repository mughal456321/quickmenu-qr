import Link from "next/link";

const LINKS = [
  {
    href: "/login",
    title: "Owner sign in",
    description: "Build the menu, print table QR codes and manage staff.",
  },
  {
    href: "/register",
    title: "Create a restaurant",
    description: "Start a new menu in about two minutes.",
  },
  {
    href: "/kitchen",
    title: "Kitchen board",
    description: "Live order tickets for a tablet or wall monitor.",
  },
  {
    href: "/dashboard/orders",
    title: "Staff orders (legacy)",
    description: "The original single-screen staff order list.",
  },
] as const;

export default function Page() {
  return (
    <main className="customer-shell flex min-h-screen flex-col justify-center p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          QuickMenu QR
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
          Digital menu and ordering for cafes
        </h1>
        <p className="mt-2 text-gray-600">
          Customers scan the QR code on their table to browse a translated menu
          and order. Tickets appear on the kitchen screen instantly.
        </p>

        <div className="mt-6 grid gap-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow"
            >
              <span className="block font-semibold text-gray-900">
                {link.title}
              </span>
              <span className="mt-0.5 block text-sm text-gray-500">
                {link.description}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-5 text-sm text-gray-500">
          Ordering starts from a table QR code. Ask the owner for the printed
          code or open <code className="rounded bg-gray-100 px-1">/m/&lt;qrToken&gt;</code>.
        </p>
      </div>
    </main>
  );
}
