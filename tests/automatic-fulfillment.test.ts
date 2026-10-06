import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTOMATIC_FULFILLMENT_DISABLED_CODE,
  AUTOMATIC_FULFILLMENT_FLAG,
  buildAutomaticFulfillmentPayload,
  checkAutomaticFulfillmentGate,
  hasServiceRoleAuthorization,
  isAutomaticFulfillmentEnabled,
  scheduleAutomaticFulfillmentRequest,
  shouldScheduleAutomaticFulfillment,
} from "../supabase/functions/_shared/automatic-fulfillment.ts";

type Order = {
  id: string;
  paymentStatus: "unpaid" | "paid";
  status: "pending_payment" | "processing" | "completed" | "failed";
  supplierStatus: "not_sent" | "processing" | "pending" | "successful" | "failed";
  supplierReference: string | null;
  productActive: boolean;
  productMapped: boolean;
  requestLinked?: boolean;
  requestFulfillmentStatus?: "not_started" | "processing" | "successful" | "failed";
};

function createHarness(outcome: "successful" | "pending" | "failed" = "successful") {
  const order: Order = {
    id: "future-order",
    paymentStatus: "unpaid",
    status: "pending_payment",
    supplierStatus: "not_sent",
    supplierReference: null,
    productActive: true,
    productMapped: true,
  };
  let sends = 0;
  let scheduled = 0;

  function schedulingView() {
    return {
      payment_status: order.paymentStatus,
      status: order.status,
      supplier_status: order.supplierStatus,
      supplier_reference: order.supplierReference,
    };
  }

  function fulfill() {
    if (order.paymentStatus !== "paid" || order.status !== "processing") return false;
    if (!order.productActive || !order.productMapped) return false;
    // Mock of claim_topup_fulfillment: this is the final atomic send gate.
    if (order.supplierStatus !== "not_sent" || order.supplierReference !== null) return false;
    order.supplierStatus = "processing";
    order.supplierReference = `bt_${order.id}`;
    if (order.requestLinked) order.requestFulfillmentStatus = "processing";
    sends += 1;

    if (outcome === "successful") {
      order.supplierStatus = "successful";
      order.status = "completed";
      if (order.requestLinked) order.requestFulfillmentStatus = "successful";
    } else if (outcome === "pending") {
      order.supplierStatus = "pending";
    } else {
      order.supplierStatus = "failed";
      order.status = "failed";
      if (order.requestLinked) order.requestFulfillmentStatus = "failed";
    }
    return true;
  }

  function paidWebhook(deliverBackgroundCall = true) {
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.status = "processing";
    }

    if (!shouldScheduleAutomaticFulfillment(schedulingView())) return;
    scheduled += 1;
    if (deliverBackgroundCall) fulfill();
  }

  return { order, fulfill, paidWebhook, sends: () => sends, scheduled: () => scheduled };
}

test("paid normal top-up triggers automatic fulfillment and completes on success", () => {
  const h = createHarness();
  h.paidWebhook();
  assert.equal(h.scheduled(), 1);
  assert.equal(h.sends(), 1);
  assert.equal(h.order.status, "completed");
  assert.equal(h.order.supplierStatus, "successful");
});

test("paid request-linked top-up triggers and advances shared request state", () => {
  const h = createHarness();
  h.order.requestLinked = true;
  h.order.requestFulfillmentStatus = "not_started";
  h.paidWebhook();
  assert.equal(h.sends(), 1);
  assert.equal(h.order.requestFulfillmentStatus, "successful");
});

for (const name of [
  "duplicate checkout.session.completed does not double-send",
  "payment_intent.succeeded after checkout.session.completed does not double-send",
  "duplicate payment_intent event does not double-send",
]) {
  test(name, () => {
    const h = createHarness();
    h.paidWebhook();
    h.paidWebhook();
    assert.equal(h.sends(), 1);
  });
}

test("duplicate checkout event reschedules paid and not-sent fulfillment after delivery failure", () => {
  const h = createHarness();
  h.paidWebhook(false);
  h.paidWebhook(false);
  assert.equal(h.scheduled(), 2);
  assert.equal(h.sends(), 0);
});

test("duplicate payment-intent event reschedules paid and not-sent fulfillment after delivery failure", () => {
  const h = createHarness();
  h.paidWebhook(false);
  h.paidWebhook(false);
  assert.equal(h.scheduled(), 2);
});

for (const supplierStatus of ["processing", "pending", "successful", "failed"] as const) {
  test(`replay does not schedule when supplier status is ${supplierStatus}`, () => {
    const h = createHarness();
    h.order.paymentStatus = "paid";
    h.order.status = "processing";
    h.order.supplierStatus = supplierStatus;
    h.paidWebhook(false);
    assert.equal(h.scheduled(), 0);
  });
}

test("replay does not schedule when supplier reference is non-null", () => {
  const h = createHarness();
  h.order.paymentStatus = "paid";
  h.order.status = "processing";
  h.order.supplierReference = "bt_existing";
  h.paidWebhook(false);
  assert.equal(h.scheduled(), 0);
});

test("completed orders do not schedule even if supplier fields are stale", () => {
  assert.equal(shouldScheduleAutomaticFulfillment({
    payment_status: "paid",
    status: "completed",
    supplier_status: "not_sent",
    supplier_reference: null,
  }), false);
});

test("concurrent scheduled calls still permit only one atomic claim and send", () => {
  const h = createHarness();
  h.paidWebhook(false);
  h.paidWebhook(false);
  assert.equal(h.scheduled(), 2);
  h.fulfill();
  h.fulfill();
  assert.equal(h.sends(), 1);
});

test("request-linked paid and not-sent replay recovers", () => {
  const h = createHarness();
  h.order.requestLinked = true;
  h.order.requestFulfillmentStatus = "not_started";
  h.paidWebhook(false);
  h.paidWebhook(true);
  assert.equal(h.scheduled(), 2);
  assert.equal(h.sends(), 1);
  assert.equal(h.order.requestFulfillmentStatus, "successful");
});

test("unpaid orders cannot fulfill", () => {
  const h = createHarness();
  assert.equal(h.fulfill(), false);
  assert.equal(h.sends(), 0);
});

test("inactive or unmapped products cannot fulfill", () => {
  for (const field of ["productActive", "productMapped"] as const) {
    const h = createHarness();
    h.order.paymentStatus = "paid";
    h.order.status = "processing";
    h.order[field] = false;
    assert.equal(h.fulfill(), false);
    assert.equal(h.sends(), 0);
  }
});

test("fulfillment failure does not revert Stripe payment state", () => {
  const h = createHarness("failed");
  h.paidWebhook();
  assert.equal(h.order.paymentStatus, "paid");
  assert.equal(h.order.supplierStatus, "failed");
});

test("pending DT One result preserves pending state", () => {
  const h = createHarness("pending");
  h.paidWebhook();
  assert.equal(h.order.paymentStatus, "paid");
  assert.equal(h.order.status, "processing");
  assert.equal(h.order.supplierStatus, "pending");
});

test("automatic mode cannot bypass the atomic claim", () => {
  const h = createHarness();
  h.order.paymentStatus = "paid";
  h.order.status = "processing";
  h.order.supplierReference = "bt_existing";
  assert.equal(h.fulfill(), false);
  assert.equal(h.sends(), 0);
});

test("client or untrusted caller cannot invoke automatic fulfillment", () => {
  assert.equal(hasServiceRoleAuthorization("Bearer anon-key", "service-role-key"), false);
  assert.equal(hasServiceRoleAuthorization("Bearer service-role-key", "service-role-key"), true);
  assert.deepEqual(buildAutomaticFulfillmentPayload("order-1"), {
    target_type: "topup_order",
    target_id: "order-1",
    mode: "live_auto",
  });
});

test("webhook uses waitUntil and fulfillment still uses the atomic claim before DT One", () => {
  const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
  const fulfillment = readFileSync("supabase/functions/fulfill-topup/index.ts", "utf8");
  assert.match(webhook, /EdgeRuntime\.waitUntil\(task\)/);
  assert.equal((webhook.match(/shouldScheduleAutomaticFulfillment\(order\)/g) ?? []).length, 2);
  assert.match(webhook, /supplier_status,supplier_reference/);
  assert.ok(fulfillment.indexOf("claimTopUpFulfillment(") < fulfillment.indexOf("callDtOne("));
});

test("DT One creation and lookup use their distinct default URL paths", () => {
  const fulfillment = readFileSync("supabase/functions/fulfill-topup/index.ts", "utf8");
  const baseUrl = "https://example.invalid/v1";
  const creationPath = fulfillment.match(
    /Deno\.env\.get\("DTONE_TRANSACTIONS_PATH"\),\s*"([^"]+)"/,
  )?.[1];
  const lookupPath = fulfillment.match(
    /Deno\.env\.get\("DTONE_TRANSACTION_LOOKUP_PATH"\),\s*"([^"]+)"/,
  )?.[1];

  assert.equal(creationPath, "/sync/transactions");
  assert.equal(lookupPath, "/transactions");
  assert.equal(`${baseUrl}${creationPath}`, "https://example.invalid/v1/sync/transactions");
  assert.equal(`${baseUrl}${lookupPath}`, "https://example.invalid/v1/transactions");
});

// ---------------------------------------------------------------------------
// FULFILLMENT_AUTO_SEND gate. These exercise the real exported production
// functions used by stripe-webhook (scheduleAutomaticFulfillmentRequest) and
// fulfill-topup (checkAutomaticFulfillmentGate), with fetch/waitUntil injected.
// ---------------------------------------------------------------------------

function createSchedulerSpy() {
  const fetchCalls: Array<{ input: string; init: RequestInit }> = [];
  const waited: Array<Promise<unknown>> = [];
  const errors: unknown[][] = [];
  return {
    fetchCalls,
    waited,
    errors,
    deps: {
      fetch: (input: string, init: RequestInit) => {
        fetchCalls.push({ input, init });
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
      waitUntil: (promise: Promise<unknown>) => {
        waited.push(promise);
      },
      logError: (...args: unknown[]) => {
        errors.push(args);
      },
    },
  };
}

function scheduleWithFlag(
  autoSendFlag: string | undefined,
  spy: ReturnType<typeof createSchedulerSpy>,
  fulfillmentAdminSecret: string | null = "admin-secret",
) {
  return scheduleAutomaticFulfillmentRequest(
    {
      baseUrl: "https://project.example.invalid",
      serviceRoleKey: "service-role-key",
      fulfillmentAdminSecret,
      orderId: "order-1",
      autoSendFlag,
    },
    spy.deps,
  );
}

test("flag name is FULFILLMENT_AUTO_SEND", () => {
  assert.equal(AUTOMATIC_FULFILLMENT_FLAG, "FULFILLMENT_AUTO_SEND");
});

test("flag missing: automatic fulfillment does not run", () => {
  const spy = createSchedulerSpy();
  assert.equal(scheduleWithFlag(undefined, spy), "disabled");
  assert.equal(spy.fetchCalls.length, 0);
  assert.equal(spy.waited.length, 0);
});

test("flag false: automatic fulfillment does not run", () => {
  const spy = createSchedulerSpy();
  assert.equal(scheduleWithFlag("false", spy), "disabled");
  assert.equal(spy.fetchCalls.length, 0);
  assert.equal(spy.waited.length, 0);
});

test("only the exact string true enables automatic fulfillment", () => {
  for (const value of [undefined, "", "false", "0", "1", "yes", "TRUE", "True", " true", "true "]) {
    assert.equal(isAutomaticFulfillmentEnabled(value), false, `value ${JSON.stringify(value)}`);
    const spy = createSchedulerSpy();
    assert.equal(scheduleWithFlag(value, spy), "disabled");
    assert.equal(spy.fetchCalls.length, 0);
  }
  assert.equal(isAutomaticFulfillmentEnabled("true"), true);
});

test("flag true: scheduling is allowed and sends one server-only live_auto request", async () => {
  const spy = createSchedulerSpy();
  assert.equal(scheduleWithFlag("true", spy), "scheduled");
  assert.equal(spy.fetchCalls.length, 1);
  assert.equal(spy.waited.length, 1);
  await Promise.all(spy.waited);
  const call = spy.fetchCalls[0];
  assert.equal(call.input, "https://project.example.invalid/functions/v1/fulfill-topup");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer service-role-key");
  assert.equal(headers["x-fulfillment-admin-secret"], "admin-secret");
  assert.deepEqual(JSON.parse(String(call.init.body)), {
    target_type: "topup_order",
    target_id: "order-1",
    mode: "live_auto",
  });
  assert.equal(spy.errors.length, 0);
});

test("flag true without admin secret still does not call fulfill-topup", () => {
  const spy = createSchedulerSpy();
  assert.equal(scheduleWithFlag("true", spy, null), "not_configured");
  assert.equal(spy.fetchCalls.length, 0);
  assert.deepEqual(spy.errors, [["AUTO_FULFILLMENT_NOT_CONFIGURED"]]);
});

test("direct live_auto while disabled is rejected by the fulfill-topup gate", () => {
  for (const flag of [undefined, "false", "TRUE"]) {
    const gate = checkAutomaticFulfillmentGate("live_auto", flag);
    assert.equal(gate.allowed, false);
    if (!gate.allowed) {
      assert.equal(gate.code, AUTOMATIC_FULFILLMENT_DISABLED_CODE);
      assert.equal(gate.httpStatus, 403);
    }
  }
  assert.deepEqual(checkAutomaticFulfillmentGate("live_auto", "true"), { allowed: true });
});

test("live_manual, dry_run, and check_status remain allowed when automatic fulfillment is disabled", () => {
  for (const mode of ["live_manual", "dry_run", "check_status"]) {
    for (const flag of [undefined, "false", "true"]) {
      assert.deepEqual(checkAutomaticFulfillmentGate(mode, flag), { allowed: true }, `${mode} / ${flag}`);
    }
  }
});

test("fulfill-topup applies the gate before order lookup, readiness, claim, and DT One", () => {
  // The Deno.serve handler cannot be imported under Node, so this pins the
  // call order in the real source alongside the behavioural tests above.
  const source = readFileSync("supabase/functions/fulfill-topup/index.ts", "utf8");
  const gate = source.indexOf("checkAutomaticFulfillmentGate(\n");
  const gateCrlf = source.indexOf("checkAutomaticFulfillmentGate(\r\n");
  const gateIndex = gate >= 0 ? gate : gateCrlf;
  assert.ok(gateIndex > 0, "gate call present in handler");
  assert.match(source, /checkAutomaticFulfillmentGate\(\s*mode,\s*Deno\.env\.get\(AUTOMATIC_FULFILLMENT_FLAG\),?\s*\)/);
  assert.match(source, /if \(!automaticGate\.allowed\) \{\s*return jsonResponse\(/);
  for (const later of [
    "hasServiceRoleAuthorization(authorization",
    "fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId)",
    "prepareFulfillment(",
    "runLiveManualFulfillment(",
    "claimTopUpFulfillment(",
    "callDtOne(",
  ]) {
    const index = source.indexOf(later);
    assert.ok(index > gateIndex, `${later} must come after the gate`);
  }
});

test("stripe-webhook schedules only through the gated shared scheduler", () => {
  const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
  assert.match(webhook, /scheduleAutomaticFulfillmentRequest\(/);
  assert.match(webhook, /autoSendFlag: Deno\.env\.get\(AUTOMATIC_FULFILLMENT_FLAG\)/);
  assert.equal(webhook.includes("/functions/v1/fulfill-topup"), false, "no ungated direct call");
});