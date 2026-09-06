import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb } from "./mock-db";

const sdk = vi.hoisted(() => ({
  pushMessage: vi.fn(async () => ({ sentMessages: [{ id: "mock-message" }] })),
  multicast: vi.fn(async () => ({})),
  broadcast: vi.fn(async () => ({})),
  construct: vi.fn(),
}));
const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof createMockDb> }));
vi.mock("@line/bot-sdk", () => ({
  messagingApi: {
    MessagingApiClient: class {
      constructor(options: unknown) { sdk.construct(options); }
      pushMessage = sdk.pushMessage;
      multicast = sdk.multicast;
      broadcast = sdk.broadcast;
    },
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => state.db }));

import { broadcastMessage, broadcastMessages, multicastMessage, multicastMessages, pushMessage, pushMessages, sendSurveyMessage } from "@/lib/line";

const textMessages = [{ type: "text" as const, text: "テスト本文" }];
const singles = [
  ["pushMessage", () => pushMessage("U-test", "テスト本文", "manual_chat", "mock-token")],
  ["pushMessages", () => pushMessages("U-test", textMessages, "manual_chat", "mock-token")],
  ["sendSurveyMessage", () => sendSurveyMessage("U-test", "survey", "question", "質問", [{ id: "choice", text: "選択肢" }], "manual_chat", "mock-token")],
] as const;
const multis = [
  ["multicastMessage", () => multicastMessage(["U-test"], "テスト本文", "scheduled_broadcast", "mock-token")],
  ["multicastMessages", () => multicastMessages(["U-test"], textMessages, "scheduled_broadcast", "mock-token")],
  ["broadcastMessage", () => broadcastMessage("テスト本文", "scheduled_broadcast", "mock-token")],
  ["broadcastMessages", () => broadcastMessages(textMessages, "scheduled_broadcast", "mock-token")],
] as const;
function mode(value: unknown) { state.db.tables.app_settings.push({ key: "send_mode", value: { mode: value }, account_id: null }); }
function toggles(value: unknown) { state.db.tables.app_settings.push({ key: "send_feature_toggles", value, account_id: null }); }
function friend(tags: unknown = ["テスト配信"]) { state.db.tables.friends = [{ id: "friend", line_user_id: "U-test", tags }]; }
function expectNoSend() {
  expect(sdk.pushMessage).not.toHaveBeenCalled();
  expect(sdk.multicast).not.toHaveBeenCalled();
  expect(sdk.broadcast).not.toHaveBeenCalled();
  expect(sdk.construct).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}

beforeEach(() => {
  state.db = createMockDb();
  vi.stubEnv("LINE_SEND_MODE", "");
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("off and safe defaults: all seven entrances", () => {
  it.each([...singles, ...multis])("%s skips with no settings or access token", async (_name, send) => {
    expect(await send()).toBeNull();
    expectNoSend();
    expect(state.db.tables.messages).toHaveLength(0);
    expect(state.db.tables.send_gate_log).toHaveLength(1);
    expect(state.db.tables.send_gate_log[0]).toMatchObject({ reason: "send_mode_off", send_mode: "off" });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[SEND_GATE] skipped feature="));
  });
  it("explicit off blocks even when every relevant toggle is on", async () => {
    mode("off"); toggles({ manual_chat: true, scheduled_broadcast: true }); friend();
    for (const [, send] of [...singles, ...multis]) expect(await send()).toBeNull();
    expectNoSend();
  });
  it("a denied push does not need a configured LINE token", async () => {
    expect(await pushMessage("U-test", "hello", "manual_chat")).toBeNull();
    expectNoSend();
  });
  it("invalid DB mode fails closed", async () => {
    mode("yes"); toggles({ manual_chat: true });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("settings read error fails closed", async () => {
    mode("on"); toggles({ manual_chat: true });
    state.db.errors.app_settings = { code: "XX000", message: "database unavailable" };
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("thrown settings failure also fails closed", async () => {
    state.db.throws.add("app_settings");
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("a rejected skip-log insert does not turn a skip into a failure", async () => {
    state.db.throws.add("send_gate_log");
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("a returned skip-log DB error does not allow sending", async () => {
    state.db.errors.send_gate_log = { code: "42P01", message: "migration not applied" };
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("records recipient and truncates the preview", async () => {
    await pushMessage("U-test", "あ".repeat(150), "manual_chat", "mock-token");
    expect(state.db.tables.send_gate_log[0]).toMatchObject({ feature: "manual_chat", recipient_line_user_id: "U-test", recipient_count: 1, preview: "あ".repeat(100) });
  });
});

describe("test_only", () => {
  beforeEach(() => mode("test_only"));
  it.each(singles)("%s allows only the tagged friend, ignoring feature toggles", async (_name, send) => {
    friend(); toggles({ manual_chat: false });
    expect(await send()).not.toBeNull();
    expect(sdk.pushMessage).toHaveBeenCalledTimes(1);
    expect(sdk.pushMessage).toHaveBeenCalledWith(expect.objectContaining({ to: "U-test" }));
    expect(state.db.tables.send_gate_log).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(singles)("%s blocks a friend without the tag", async (_name, send) => {
    friend(["顧客"]); toggles({ manual_chat: true });
    expect(await send()).toBeNull(); expectNoSend();
    expect(state.db.tables.send_gate_log[0].reason).toBe("send_mode_test_only_not_test_friend");
  });
  it.each(multis)("%s is blocked even with one tagged recipient", async (_name, send) => {
    friend(); toggles({ scheduled_broadcast: true });
    expect(await send()).toBeNull(); expectNoSend();
    expect(state.db.tables.send_gate_log[0].reason).toBe("send_mode_test_only_multi_blocked");
  });
  it.each([null, "テスト配信", [], ["テスト配信済み"]].map((tags) => [tags]))("rejects nonmatching or malformed tags (%j)", async (tags) => {
    friend(tags); expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("blocks an unknown friend", async () => {
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("blocks a friend lookup error", async () => {
    friend(); state.db.errors.friends = { code: "XX000", message: "lookup failed" };
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
});

describe("on feature isolation", () => {
  beforeEach(() => mode("on"));
  it.each([...singles, ...multis])("%s requires its feature to be explicitly true", async (_name, send) => {
    expect(await send()).toBeNull(); expectNoSend();
    toggles({ manual_chat: true, scheduled_broadcast: true });
    expect(await send()).not.toBeNull();
    expect(sdk.construct).toHaveBeenCalledTimes(1);
  });
  it.each([false, "true", 1, null])("rejects false/non-boolean toggle %j", async (value) => {
    toggles({ manual_chat: value, points: true });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
    expect(state.db.tables.send_gate_log[0].reason).toBe("feature_disabled:manual_chat");
  });
  it("does not borrow a different feature's enabled toggle", async () => {
    toggles({ points: true });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
});

describe("environment and global settings", () => {
  it("environment off overrides DB on", async () => {
    mode("on"); toggles({ manual_chat: true }); vi.stubEnv("LINE_SEND_MODE", "off");
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("environment on overrides DB off but still requires the feature", async () => {
    mode("off"); toggles({ manual_chat: true }); vi.stubEnv("LINE_SEND_MODE", "on");
    expect(await singles[0][1]()).not.toBeNull(); expect(sdk.pushMessage).toHaveBeenCalledTimes(1);
  });
  it("environment test_only overrides DB on and checks the tag", async () => {
    mode("on"); toggles({ manual_chat: true }); vi.stubEnv("LINE_SEND_MODE", "test_only");
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
    friend(); expect(await singles[0][1]()).not.toBeNull();
  });
  it("invalid environment value falls back to DB", async () => {
    mode("on"); toggles({ manual_chat: true }); vi.stubEnv("LINE_SEND_MODE", "ON");
    expect(await singles[0][1]()).not.toBeNull(); expect(sdk.pushMessage).toHaveBeenCalledTimes(1);
  });
  it("ignores account-scoped rows", async () => {
    state.db.tables.app_settings = [
      { key: "send_mode", value: { mode: "on" }, account_id: "account-a" },
      { key: "send_feature_toggles", value: { manual_chat: true }, account_id: "account-a" },
    ];
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("supports the pre-007 schema without account_id", async () => {
    state.db.setMissingAccountColumn(true);
    state.db.tables.app_settings = [
      { key: "send_mode", value: { mode: "on" } },
      { key: "send_feature_toggles", value: { manual_chat: true } },
    ];
    expect(await singles[0][1]()).not.toBeNull(); expect(sdk.pushMessage).toHaveBeenCalledTimes(1);
  });
});

describe("ambiguous/error configuration cannot broaden sending", () => {
  it("fails closed with duplicate global mode rows", async () => {
    mode("on"); mode("off"); toggles({ manual_chat: true });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("fails closed with duplicate global toggle rows", async () => {
    mode("on"); toggles({ manual_chat: true }); toggles({ manual_chat: false });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it("does not retry an account-scoped query without account_id on generic errors", async () => {
    state.db.errors.app_settings = { code: "XX000", message: "temporary error" };
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
    const queries = state.db.queries.filter((query) => query.table === "app_settings");
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query.filters).toContainEqual(["account_id", null]);
  });
  it("blocks ambiguous friend records in test_only", async () => {
    mode("test_only"); friend();
    state.db.tables.friends.push({ id: "other-account-friend", line_user_id: "U-test", tags: [] });
    expect(await singles[0][1]()).toBeNull(); expectNoSend();
  });
  it.each([multicastMessage, multicastMessages])("empty multicast returns null", async (send) => {
    const result = send === multicastMessage
      ? await multicastMessage([], "text", "scheduled_broadcast", "mock-token")
      : await multicastMessages([], textMessages, "scheduled_broadcast", "mock-token");
    expect(result).toBeNull(); expectNoSend();
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { sendPersonalizedBlocks } from "@/lib/personalize";
import { processDueEnrollmentById } from "@/lib/step-enrollment";
import { POST as sendManual } from "@/app/api/friends/[id]/message/route";

const dbClient = () => state.db as unknown as SupabaseClient;
describe("caller log and count behavior", () => {
  it("personalized broadcast skips out logs and counts for blocked friends", async () => {
    const count = await sendPersonalizedBlocks(dbClient(), [
      { id: "friend", line_user_id: "U-test", display_name: "テスト" },
    ], [{ id: "block", type: "text", text: "{name}さん" }], "broadcast", "scheduled_broadcast", undefined, "mock-token");
    expect(count).toBe(0); expect(state.db.tables.messages).toHaveLength(0); expectNoSend();
    expect(state.db.tables.send_gate_log[0].feature).toBe("scheduled_broadcast");
  });
  it("personalized broadcast logs/counts only tagged recipients in test_only", async () => {
    mode("test_only"); friend();
    const count = await sendPersonalizedBlocks(dbClient(), [
      { id: "friend", line_user_id: "U-test", display_name: "テスト" },
      { id: "non-test", line_user_id: "U-other", display_name: "別の友だち" },
    ], [{ id: "block", type: "text", text: "{name}さん" }], "broadcast", "scheduled_broadcast", undefined, "mock-token");
    expect(count).toBe(1);
    expect(state.db.tables.messages).toHaveLength(1);
    expect(state.db.tables.messages[0]).toMatchObject({ friend_id: "friend", direction: "out" });
    expect(sdk.pushMessage).toHaveBeenCalledTimes(1);
  });
  it("manual chat returns skipped and does not write message/event logs", async () => {
    friend();
    const response = await sendManual(new NextRequest("http://localhost/api/friends/friend/message", {
      method: "POST", body: JSON.stringify({ text: "hello" }), headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({ id: "friend" }) });
    expect(await response.json()).toMatchObject({ skipped: true });
    expect(state.db.tables.messages).toHaveLength(0);
    expect(state.db.tables.friend_events ?? []).toHaveLength(0); expectNoSend();
  });
  it.each([null, [{ id: "block", type: "text", text: "hello" }]].map((blocks) => [blocks]))("blocked step advances without creating a retry backlog (%j)", async (blocks) => {
    state.db.tables.step_enrollments = [{
      id: "enrollment", flow_id: "flow", friend_id: "friend", current_step: 0, status: "active",
      step_flows: { id: "flow", status: "active", account_id: null },
      friends: { id: "friend", line_user_id: "U-test", display_name: "テスト", is_blocked: false },
    }];
    state.db.tables.step_messages = [{ id: "step", flow_id: "flow", message_text: "hello", message_blocks: blocks, sort_order: 0 }];
    const result = await processDueEnrollmentById(dbClient(), "enrollment", undefined, "tag_triggered");
    expect(result).toMatchObject({ sent: false, completed: true });
    expect(state.db.tables.step_enrollments[0]).toMatchObject({ current_step: 1, status: "completed" });
    expect(state.db.tables.messages).toHaveLength(0); expectNoSend();
    expect(state.db.tables.send_gate_log[0].feature).toBe("tag_triggered");
  });
});

import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/send-gate/route";
const settingsRequest = (body: unknown) => new NextRequest("http://localhost/api/settings/send-gate", {
  method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});
describe("settings API", () => {
  it("returns safe defaults, all 11 toggles, and outgoing stats", async () => {
    state.db.tables.messages = [{ direction: "out" }, { direction: "in" }];
    state.db.tables.send_gate_log = [{ feature: "login" }];
    const body = await (await getSettings()).json();
    expect(body).toMatchObject({ mode: "off", dbMode: "off", stats: { sent: 1, skipped: 1 } });
    expect(Object.keys(body.toggles)).toHaveLength(11);
    expect(Object.values(body.toggles).every((value) => value === false)).toBe(true);
    expectNoSend();
  });
  it("returns saved DB mode separately from effective environment mode", async () => {
    mode("off"); vi.stubEnv("LINE_SEND_MODE", "on");
    const body = await (await getSettings()).json();
    expect(body).toMatchObject({ mode: "on", dbMode: "off", environmentMode: "on" });
  });
  it("reports unavailable skip stats instead of zero when migration is missing", async () => {
    state.db.errors.send_gate_log = { code: "42P01", message: "missing table" };
    const body = await (await getSettings()).json();
    expect(body.stats).toEqual({ sent: 0, skipped: null });
  });
  it("saves mode and toggles together using one RPC", async () => {
    vi.stubEnv("LINE_SEND_MODE", "test_only");
    const response = await putSettings(settingsRequest({ mode: "on", toggles: { manual_chat: true } }));
    expect(response.status).toBe(200);
    expect(state.db.rpc).toHaveBeenCalledTimes(1);
    expect(state.db.rpc).toHaveBeenCalledWith("set_global_send_gate_settings", {
      mode_value: { mode: "on" }, toggles_value: expect.objectContaining({ manual_chat: true, points: false }),
    });
    expect(await response.json()).toMatchObject({ mode: "test_only", dbMode: "on", environmentMode: "test_only" });
    expectNoSend();
  });
  it.each([null, {}, { mode: "ON", toggles: {} }, { mode: "on", toggles: [] },
    { mode: "on", toggles: { manual_chat: "true" } }, { mode: "on", toggles: { typo: true } }])("rejects invalid settings (%j)", async (value) => {
    expect((await putSettings(settingsRequest(value))).status).toBe(400);
    expect(state.db.rpc).not.toHaveBeenCalled(); expectNoSend();
  });
  it("returns 400 on malformed JSON", async () => {
    const request = new NextRequest("http://localhost/api/settings/send-gate", { method: "PUT", body: "{" });
    expect((await putSettings(request)).status).toBe(400);
    expect(state.db.rpc).not.toHaveBeenCalled();
  });
  it("does not fall back to unsafe NULL-account upsert when migration is missing", async () => {
    state.db.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "function missing" } });
    const response = await putSettings(settingsRequest({ mode: "on", toggles: {} }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("009_send_gate.sql");
    expect(state.db.tables.app_settings).toHaveLength(0);
    expect(state.db.from).not.toHaveBeenCalled(); expectNoSend();
  });
});

import { GET as processBroadcasts } from "@/app/api/broadcast/process/route";
import { POST as sendBroadcast } from "@/app/api/broadcast/route";
function seedBroadcast() {
  state.db.tables.broadcasts = [{ id: "broadcast", status: "scheduled", target_type: "segment", target_tags: ["顧客"], message_blocks: [{ id: "block", type: "text", text: "hello" }] }];
  state.db.tables.friends = Array.from({ length: 501 }, (_, i) => ({ id: `friend-${i}`, line_user_id: `U-${i}`, display_name: "顧客", tags: ["顧客"], is_blocked: false }));
}
describe("broadcast chunks preserve accurate logs and counts", () => {
  it("scheduled multicast counts successful chunks and writes their logs", async () => {
    seedBroadcast(); mode("on"); toggles({ scheduled_broadcast: true }); vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "mock-token");
    await processBroadcasts();
    expect(sdk.multicast).toHaveBeenCalledTimes(2);
    expect(state.db.tables.messages).toHaveLength(501);
    expect(state.db.tables.broadcasts[0].delivered_count).toBe(501);
  });
  it("scheduled multicast consumes a skipped job with zero out logs", async () => {
    seedBroadcast(); await processBroadcasts();
    expectNoSend(); expect(state.db.tables.messages).toHaveLength(0);
    expect(state.db.tables.broadcasts[0]).toMatchObject({ status: "sent", delivered_count: 0 });
    expect(state.db.tables.send_gate_log).toHaveLength(2);
  });
  it("a mode change between scheduled chunks logs/counts only actual sends", async () => {
    seedBroadcast(); mode("on"); toggles({ scheduled_broadcast: true }); vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "mock-token");
    sdk.multicast.mockImplementationOnce(async () => { vi.stubEnv("LINE_SEND_MODE", "off"); return {}; });
    await processBroadcasts();
    expect(sdk.multicast).toHaveBeenCalledTimes(1);
    expect(state.db.tables.messages).toHaveLength(500);
    expect(state.db.tables.broadcasts[0].delivered_count).toBe(500);
    expect(state.db.tables.send_gate_log).toHaveLength(1);
  });
  it("a mode change between immediate chunks preserves already-sent logs", async () => {
    seedBroadcast(); state.db.tables.broadcasts = [];
    mode("on"); toggles({ scheduled_broadcast: true }); vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "mock-token");
    sdk.multicast.mockImplementationOnce(async () => { vi.stubEnv("LINE_SEND_MODE", "off"); return {}; });
    const response = await sendBroadcast(new NextRequest("http://localhost/api/broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "test", message: "hello", targetType: "segment", targetTags: ["顧客"] }),
    }));
    expect((await response.json()).deliveredCount).toBe(500);
    expect(sdk.multicast).toHaveBeenCalledTimes(1);
    expect(state.db.tables.messages).toHaveLength(500);
  });
});
