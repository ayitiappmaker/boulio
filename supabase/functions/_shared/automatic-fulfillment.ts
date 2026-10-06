export const AUTOMATIC_FULFILLMENT_MODE = "live_auto" as const;

export type AutomaticFulfillmentOrder = {
  payment_status: string;
  status: string;
  supplier_status: string;
  supplier_reference: string | null;
};

export function shouldScheduleAutomaticFulfillment(
  order: AutomaticFulfillmentOrder,
) {
  return order.payment_status === "paid" &&
    order.supplier_status === "not_sent" &&
    order.supplier_reference === null &&
    order.status !== "completed";
}

export function buildAutomaticFulfillmentPayload(orderId: string) {
  return {
    target_type: "topup_order" as const,
    target_id: orderId,
    mode: AUTOMATIC_FULFILLMENT_MODE,
  };
}

export function hasServiceRoleAuthorization(
  headerValue: string | null,
  serviceRoleKey: string,
) {
  const match = headerValue?.match(/^Bearer\s+(.+)$/i);
  return Boolean(match?.[1] && timingSafeEqual(match[1].trim(), serviceRoleKey));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export const AUTOMATIC_FULFILLMENT_FLAG = "FULFILLMENT_AUTO_SEND" as const;
export const AUTOMATIC_FULFILLMENT_DISABLED_CODE = "AUTO_FULFILLMENT_DISABLED" as const;

// Automatic fulfillment is off unless the flag is exactly the string "true".
// Missing, empty, "false", "TRUE", " true", or anything else keeps it off.
export function isAutomaticFulfillmentEnabled(
  flagValue: string | null | undefined,
) {
  return flagValue === "true";
}

export type AutomaticFulfillmentGate =
  | { allowed: true }
  | {
    allowed: false;
    httpStatus: 403;
    code: typeof AUTOMATIC_FULFILLMENT_DISABLED_CODE;
    message: string;
  };

// Second, independent guard used inside fulfill-topup. Only live_auto is
// gated; dry_run, live_manual, and check_status are always allowed through.
export function checkAutomaticFulfillmentGate(
  mode: string | null | undefined,
  flagValue: string | null | undefined,
): AutomaticFulfillmentGate {
  if (mode !== AUTOMATIC_FULFILLMENT_MODE) return { allowed: true };
  if (isAutomaticFulfillmentEnabled(flagValue)) return { allowed: true };
  return {
    allowed: false,
    httpStatus: 403,
    code: AUTOMATIC_FULFILLMENT_DISABLED_CODE,
    message: "Automatic fulfillment is disabled.",
  };
}

export type ScheduleAutomaticFulfillmentOptions = {
  baseUrl: string;
  serviceRoleKey: string;
  fulfillmentAdminSecret: string | null | undefined;
  orderId: string;
  autoSendFlag: string | null | undefined;
};

export type ScheduleAutomaticFulfillmentDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
  logError: (...args: unknown[]) => void;
};

export type ScheduleAutomaticFulfillmentResult =
  | "disabled"
  | "not_configured"
  | "scheduled";

// First guard, used by stripe-webhook. When the flag is not exactly "true"
// this returns before any request to fulfill-topup is built or scheduled.
export function scheduleAutomaticFulfillmentRequest(
  options: ScheduleAutomaticFulfillmentOptions,
  deps: ScheduleAutomaticFulfillmentDeps,
): ScheduleAutomaticFulfillmentResult {
  if (!isAutomaticFulfillmentEnabled(options.autoSendFlag)) {
    return "disabled";
  }

  if (!options.fulfillmentAdminSecret) {
    deps.logError("AUTO_FULFILLMENT_NOT_CONFIGURED");
    return "not_configured";
  }

  const task = deps.fetch(`${options.baseUrl}/functions/v1/fulfill-topup`, {
    method: "POST",
    headers: {
      apikey: options.serviceRoleKey,
      Authorization: `Bearer ${options.serviceRoleKey}`,
      "Content-Type": "application/json",
      "x-fulfillment-admin-secret": options.fulfillmentAdminSecret,
    },
    body: JSON.stringify(buildAutomaticFulfillmentPayload(options.orderId)),
  }).then((response) => {
    if (!response.ok) {
      deps.logError("AUTO_FULFILLMENT_FAILED", response.status);
    }
  }).catch(() => {
    deps.logError("AUTO_FULFILLMENT_REQUEST_FAILED");
  });

  deps.waitUntil(task);
  return "scheduled";
}