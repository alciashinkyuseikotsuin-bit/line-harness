import { createHmac } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createMockDb } from "./mock-db";

const mocks = vi.hoisted(() => ({
  push: vi.fn(async () => ({ sentMessages: [{ id: "mock-message" }] })),
  broadcast: vi.fn(async () => ({})),
  multicast: vi.fn(async () => ({})),
  enroll: vi.fn(async () => {}),
  award: vi.fn(async () => {}),
  process: vi.fn(async () => ({ sent: true, completed: true })),
  getDb: vi.fn<() => ReturnType<typeof createMockDb>>(),
}));
vi.mock("@line/bot-sdk", () => ({ messagingApi: { MessagingApiClient: class {
  pushMessage = mocks.push;
  broadcast = mocks.broadcast;
  multicast = mocks.multicast;
} } }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: mocks.getDb }));
vi.mock("@/lib/step-enrollment", () => ({ enrollMatchingStepFlows: mocks.enroll, processDueEnrollmentById: mocks.process }));
vi.mock("@/lib/points", () => ({ awardPoints: mocks.award, getPointRules: vi.fn(async () => ({})) }));
vi.mock("@/lib/engagement", () => ({ recalcFriendScore: vi.fn(async () => {}) }));

import { findAutoReply, normalizeForMatch } from "@/lib/engage";
import { GET as broadcastGet, POST as broadcastPost } from "@/app/api/broadcast/process/route";
import { GET as stepGet, POST as stepPost } from "@/app/api/step-flows/process/route";
import { POST as webhook } from "@/app/api/webhook/route";
import { GET as listReplies, POST as createReply } from "@/app/api/auto-replies/route";
import { PUT as updateReply } from "@/app/api/auto-replies/[id]/route";

let db: ReturnType<typeof createMockDb>;
const client = () => db as unknown as SupabaseClient;
const reply = (extra: Record<string, unknown> = {}) => ({
  id: "reply", name: "LINE", keywords: ["line"], match_type: "exact", reply_text: "返信本文",
  add_tags: ["新規タグ"], points: 20, once_per_friend: false, priority: 1, active: true, cascade: false, ...extra,
});
beforeEach(() => {
  db = createMockDb();
  mocks.getDb.mockReturnValue(db);
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("LINE_SEND_MODE", "on");
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "mock-token");
  vi.stubEnv("LINE_CHANNEL_SECRET", "mock-secret");
  db.tables.app_settings = [{ key: "send_feature_toggles", account_id: null,
    value: { keyword_reply: true, scheduled_broadcast: true } }];
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); });

describe("keyword normalization", () => {
  it.each([
    ["　ＬＩＮＥ　", "line"], [" ＬiＮe１２3 ", "line123"],
    ["Ａ　Ｂ", "a b"], ["ライン", "ライン"], ["！＠", "！＠"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeForMatch(input)).toBe(expected);
  });
  it.each(["exact", "partial"])("normalizes both sides for %s", async (match_type) => {
    db.tables.auto_replies = [reply({ match_type })];
    expect((await findAutoReply(client(), "friend", "　ＬiＮＥ　"))?.id).toBe("reply");
    db.tables.auto_replies = [reply({ match_type, keywords: ["　ＬＩＮＥ　"] })];
    expect((await findAutoReply(client(), "friend", "LiNe"))?.id).toBe("reply");
  });
  it.each(["LINE見ました", "online講座", "timeline", "広告費が高い", "ライン", "オンライン"])("exact does not reply to %s", async (input) => {
    db.tables.auto_replies = [reply({ keywords: ["line", "広告"] })];
    expect(await findAutoReply(client(), "friend", input)).toBeNull();
  });
  it("partial still matches normalized substrings and ignores empty keywords", async () => {
    db.tables.auto_replies = [reply({ match_type: "partial", keywords: ["　", "ＬＩＮＥ"] })];
    expect((await findAutoReply(client(), "friend", "このLiＮeで相談"))?.id).toBe("reply");
    expect(await findAutoReply(client(), "friend", "こんにちは")).toBeNull();
  });
  it("keeps active/account filters and once-per-friend skipping", async () => {
    db.tables.auto_replies = [reply({ active: false }), reply({ id: "other", account_id: "other" }),
      reply({ id: "once", account_id: "account", once_per_friend: true }),
      reply({ id: "next", account_id: "account" })];
    db.tables.friend_events = [{ friend_id: "friend", event_type: "keyword_reply", "metadata->>reply_id": "once" }];
    expect((await findAutoReply(client(), "friend", "ＬＩＮＥ", "account"))?.id).toBe("next");
  });
});

const routes = [
  ["broadcast GET", broadcastGet, "GET", "broadcast"],
  ["broadcast POST", broadcastPost, "POST", "broadcast"],
  ["step GET", stepGet, "GET", "step"],
  ["step POST", stepPost, "POST", "step"],
] as const;
function seedDue() {
  db.tables.broadcasts = [{ id: "broadcast", status: "scheduled", scheduled_at: "2000-01-01", target_type: "all",
    message_blocks: [{ id: "text", type: "text", text: "予約本文" }] }];
  db.tables.friends = [{ id: "friend", line_user_id: "U-test", is_blocked: false }];
  db.tables.step_enrollments = [{ id: "enrollment", status: "active", next_send_at: "2000-01-01" }];
}
describe.each(routes)("cron %s", (_name, handler, method, kind) => {
  it.each([undefined, "Bearer wrong", "Basic cron-secret", "bearer cron-secret"])("denies %s before DB or sends", async (authorization) => {
    seedDue(); vi.stubEnv("CRON_SECRET", "cron-secret");
    const before = structuredClone(db.tables);
    const result = await handler(new Request("http://localhost/api/process", { method,
      headers: authorization ? { authorization } : {} }));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
    expect(db.tables).toEqual(before);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(mocks.multicast).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it.each(["configured", "unset"])("executes due work when %s", async (mode) => {
    seedDue();
    vi.stubEnv("CRON_SECRET", mode === "configured" ? "cron-secret" : undefined);
    const result = await handler(new Request("http://localhost/api/process", { method,
      headers: mode === "configured" ? { authorization: "Bearer cron-secret" } : {} }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ processed: 1, sent: 1 });
    if (kind === "broadcast") {
      expect(mocks.broadcast).toHaveBeenCalledTimes(1);
      expect(db.tables.broadcasts[0].status).toBe("sent");
    } else {
      expect(mocks.process).toHaveBeenCalledWith(db, "enrollment", expect.any(Map), "step_flow");
    }
  });
});

async function receiveKeyword() {
  const body = JSON.stringify({ events: [{ type: "message", source: { type: "user", userId: "U-test" },
    message: { type: "text", text: "　ＬＩＮＥ　", id: "incoming" } }] });
  const signature = createHmac("sha256", "mock-secret").update(body).digest("base64");
  return webhook(new NextRequest("http://localhost/api/webhook", { method: "POST", body,
    headers: { "x-line-signature": signature } }));
}
describe("webhook cascade", () => {
  it.each([false, undefined, true])("cascade=%s controls only keyword side effects", async (cascade) => {
    db.tables.auto_replies = [reply({ cascade })];
    db.tables.friends = [{ id: "friend", line_user_id: "U-test", tags: ["既存タグ"], points: 0, pending_input: null }];
    expect((await receiveKeyword()).status).toBe(200);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ to: "U-test", messages: [{ type: "text", text: "返信本文" }] }));
    expect(db.tables.messages.filter((m) => m.direction === "out")).toHaveLength(1);
    expect(db.tables.friend_events.some((e) => e.event_type === "keyword_reply")).toBe(true);
    if (cascade === true) {
      expect(db.tables.friends[0].tags).toEqual(["既存タグ", "新規タグ"]);
      expect(mocks.enroll).toHaveBeenCalledWith(db, "friend", ["既存タグ", "新規タグ"], undefined, "keyword_reply");
      expect(mocks.award).toHaveBeenCalledWith(db, { id: "friend", line_user_id: "U-test" }, 20, "キーワード「LINE」", { reply_id: "reply" });
    } else {
      expect(db.tables.friends[0].tags).toEqual(["既存タグ"]);
      expect(db.tables.friends[0].points).toBe(0);
      expect(mocks.enroll).not.toHaveBeenCalled();
      expect(mocks.award).not.toHaveBeenCalled();
    }
  });
});

describe("auto-reply API cascade persistence", () => {
  it.each([true, false, undefined, "false", "true", 1, null])("normalizes %s on create and update", async (cascade) => {
    const body = { name: "テスト", keywords: ["line"], reply_text: "本文", match_type: "exact", cascade };
    const request = (method: string) => new NextRequest("http://localhost/api/auto-replies", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const created = await createReply(request("POST"));
    expect(created.status).toBe(200);
    expect((await created.json()).reply.cascade).toBe(cascade === true);
    db.tables.auto_replies[0].id = "reply";
    db.tables.auto_replies[0].cascade = true;
    const updated = await updateReply(request("PUT"), { params: Promise.resolve({ id: "reply" }) });
    expect(updated.status).toBe(200);
    expect((await updated.json()).reply.cascade).toBe(cascade === true);
    const listed = await listReplies(new NextRequest("http://localhost/api/auto-replies"));
    expect((await listed.json()).replies[0].cascade).toBe(cascade === true);
  });
});
