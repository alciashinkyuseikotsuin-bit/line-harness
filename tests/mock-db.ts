import { vi } from "vitest";

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };
export function createMockDb() {
  const tables: Record<string, Row[]> = { app_settings: [], friends: [], send_gate_log: [], messages: [] };
  const errors: Record<string, DbError | undefined> = {};
  const throws = new Set<string>();
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  let missingAccountColumn = false;
  const from = vi.fn((table: string) => {
    const filters: [string, unknown][] = [];
    queries.push({ table, filters });
    let singleton = false;
    let countOnly = false;
    let operation = "select";
    let payload: Row[] = [];
    const builder = {
      select: vi.fn((_columns?: string, options?: { head?: boolean }) => { countOnly = options?.head ?? false; return builder; }),
      eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return builder; }),
      is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return builder; }),
      in: vi.fn((key: string, values: unknown[]) => { filters.push([key, values]); return builder; }),
      gt: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      overlaps: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(() => { singleton = true; return builder; }),
      single: vi.fn(() => { singleton = true; return builder; }),
      insert: vi.fn((rows: Row | Row[]) => { operation = "insert"; payload = Array.isArray(rows) ? rows : [rows]; return builder; }),
      upsert: vi.fn((rows: Row | Row[]) => { operation = "upsert"; payload = Array.isArray(rows) ? rows : [rows]; return builder; }),
      update: vi.fn((row: Row) => { operation = "update"; payload = [row]; return builder; }),
      then: <TResult1 = unknown, TResult2 = never>(
        fulfilled?: ((value: { data: Row | Row[] | null; error: DbError | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
        rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> => {
        if (throws.has(table)) return Promise.reject(new Error(`mock ${table} unavailable`)).then(fulfilled, rejected);
        const missingColumn = table === "app_settings" && missingAccountColumn && filters.some(([key]) => key === "account_id");
        const error = missingColumn ? { code: "42703", message: "column app_settings.account_id does not exist" } : errors[table] ?? null;
        const rows = tables[table] ?? [];
        const matches = (row: Row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : (row[key] ?? null) === value);
        let found = rows.filter(matches);
        if (!error) {
          if (operation === "insert") { tables[table] = [...rows, ...payload]; found = payload; }
          if (operation === "upsert") {
            for (const item of payload) {
              const existing = rows.find((row) => row.key === item.key && (row.account_id ?? null) === (item.account_id ?? null));
              if (existing) Object.assign(existing, item); else rows.push(item);
            }
            tables[table] = rows; found = payload;
          }
          if (operation === "update") found.forEach((row) => Object.assign(row, payload[0]));
        }
        const duplicate = singleton && found.length > 1 ? { code: "PGRST116", message: "multiple rows" } : null;
        return Promise.resolve({ data: error || duplicate || countOnly ? null : singleton ? found[0] ?? null : found, error: error || duplicate, count: countOnly ? found.length : null }).then(fulfilled, rejected);
      },
    };
    return builder;
  });
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: null; error: DbError | null }>>(async () => ({ data: null, error: null }));
  return { from, rpc, tables, errors, throws, queries, setMissingAccountColumn: (value: boolean) => { missingAccountColumn = value; } };
}
