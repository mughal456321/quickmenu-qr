"use client";

import { useCallback, useEffect, useState } from "react";
import type { TableWithLinks } from "@quickmenu/shared";
import { ApiRequestError, apiBlob, apiRequest, apiVoid } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/Toast";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../components/ui";

function QrPreview({ tableId, label }: { tableId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = await apiBlob(`/tables/${tableId}/qr?format=png`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tableId]);

  if (failed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-gray-50 text-xs text-gray-500">
        Preview unavailable
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-gray-50 text-xs text-gray-500">
        Loading QR…
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`QR code for ${label}`}
      className="mx-auto h-40 w-40 rounded-xl border border-gray-200 bg-white p-2"
    />
  );
}

export default function TablesPage() {
  const { refresh } = useAuth();
  const toast = useToast();

  const [tables, setTables] = useState<TableWithLinks[] | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TableWithLinks | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAuthError = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (error instanceof ApiRequestError && error.status === 401) {
        const token = await refresh();
        if (!token) toast.push("Your session expired. Please log in again.", "error");
        return true;
      }
      return false;
    },
    [refresh, toast]
  );

  const load = useCallback(async () => {
    try {
      setTables(await apiRequest<TableWithLinks[]>("/tables"));
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not load tables.",
        "error"
      );
    }
  }, [handleAuthError, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tableNumber = newNumber.trim();
    if (!tableNumber) return;
    setBusy(true);
    try {
      await apiRequest<TableWithLinks>("/tables", {
        method: "POST",
        body: JSON.stringify({ tableNumber }),
      });
      setNewNumber("");
      toast.push(`Table ${tableNumber} added.`, "success");
      await load();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not add the table.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(table: TableWithLinks) {
    setPendingId(table.id);
    try {
      await apiRequest(`/tables/${table.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !table.isActive }),
      });
      await load();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not update the table.",
        "error"
      );
    } finally {
      setPendingId(null);
    }
  }

  async function download(table: TableWithLinks, format: "png" | "pdf") {
    setPendingId(table.id);
    try {
      const blob = await apiBlob(`/tables/${table.id}/qr?format=${format}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `table-${table.tableNumber}-qr.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push("Could not download the QR code.", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function removeTable() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await apiVoid(`/tables/${deleteTarget.id}`, { method: "DELETE" });
      toast.push("Table deleted.", "success");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      if (await handleAuthError(error)) return;
      if (error instanceof ApiRequestError && error.code === "CONFLICT") {
        toast.push(
          "This table has order history. Deactivate it instead of deleting it.",
          "error"
        );
      } else {
        toast.push(
          error instanceof ApiRequestError ? error.message : "Could not delete the table.",
          "error"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Tables &amp; QR codes
        </h1>
        <p className="text-sm text-gray-500">
          Print one code per table. Scanning opens that table&apos;s menu.
        </p>
      </div>

      <form onSubmit={(event) => void addTable(event)} className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <label className={`${labelClass} min-w-[180px] flex-1`}>
          Table number or name
          <input
            value={newNumber}
            onChange={(event) => setNewNumber(event.target.value)}
            placeholder="e.g. 6 or Terrace 2"
            className={inputClass}
            maxLength={20}
          />
        </label>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Adding…" : "Add table"}
        </button>
      </form>

      {tables === null && (
        <p className="text-gray-500" role="status">
          Loading tables…
        </p>
      )}

      {tables && tables.length === 0 && (
        <p className={`${cardClass} text-center text-gray-500`}>
          No tables yet. Add your first table to generate a QR code.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables?.map((table) => (
          <article key={table.id} className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Table {table.tableNumber}
                </h2>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    table.isActive
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {table.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={table.isActive}
                disabled={pendingId === table.id}
                onClick={() => void toggleActive(table)}
                className={secondaryButton}
              >
                {table.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>

            <div className="mt-3">
              <QrPreview tableId={table.id} label={`table ${table.tableNumber}`} />
            </div>

            <p className="mt-2 break-all rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
              {table.menuUrl}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingId === table.id}
                onClick={() => void download(table, "png")}
                className={secondaryButton}
              >
                Download PNG
              </button>
              <button
                type="button"
                disabled={pendingId === table.id}
                onClick={() => void download(table, "pdf")}
                className={secondaryButton}
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(table)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete table?"
          message={`Table ${deleteTarget.tableNumber} and its QR code will be removed. Tables with order history cannot be deleted — deactivate them instead.`}
          confirmLabel="Delete table"
          danger
          busy={busy}
          onConfirm={() => void removeTable()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
