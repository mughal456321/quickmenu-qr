import type { Metadata } from "next";
import type { PublicMenu } from "@quickmenu/shared";
import { CustomerMenu } from "./CustomerMenu";

export const dynamic = "force-dynamic";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const metadata: Metadata = {
  title: "Menu · QuickMenu QR",
};

interface InitialMenu {
  menu: PublicMenu | null;
  warnings: string[];
}

/**
 * Server-render the first menu paint (Phase 08). The client component then
 * hydrates for search, filters, language and live availability.
 */
async function fetchInitialMenu(qrToken: string): Promise<InitialMenu> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/public/menu/${encodeURIComponent(qrToken)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return { menu: null, warnings: [] };
    const body = (await response.json()) as {
      data?: PublicMenu;
      warnings?: string[];
    };
    return { menu: body.data ?? null, warnings: body.warnings ?? [] };
  } catch {
    // The client retries and shows a friendly error.
    return { menu: null, warnings: [] };
  }
}

export default async function CustomerMenuPage({
  params,
}: {
  params: { qrToken: string };
}) {
  const initial = await fetchInitialMenu(params.qrToken);
  return (
    <CustomerMenu
      qrToken={params.qrToken}
      initialMenu={initial.menu}
      initialWarnings={initial.warnings}
    />
  );
}
