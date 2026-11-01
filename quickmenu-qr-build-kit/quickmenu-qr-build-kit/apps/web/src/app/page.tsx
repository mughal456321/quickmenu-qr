import Link from "next/link";

export default function Page() {
  return (
    <main className="customer-shell flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          QuickMenu QR
        </h1>
        <p className="mt-2 text-gray-600">
          Digital menu and ordering for cafes and restaurants.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          Scan the QR code on your table to open the menu.
        </p>
        <Link
          href="/dashboard/orders"
          className="mt-6 inline-block rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white"
        >
          Staff orders
        </Link>
      </div>
    </main>
  );
}
