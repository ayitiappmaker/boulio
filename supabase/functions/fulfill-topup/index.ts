// Supabase Edge Function: fulfill-topup
//
// Dry-run fulfillment prep only plus a locked-down manual live path.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - DTONE_API_BASE_URL
// - DTONE_API_USERNAME
// - DTONE_API_PASSWORD
// - FULFILLMENT_ADMIN_SECRET
//
// This function validates a paid top-up order, loads the exact mapped DT One
// product, normalizes the recipient phone, and either:
// - returns a safe preview of the payload that would be sent later, or
// - when explicitly requested with live_manual and a matching admin secret,
//   sends the real DT One request from the server.
//
// It never exposes DT One credentials to the client. It does not automate
// fulfillment from Stripe and it does not mark orders completed unless DT One
// returns a confirmed success response.

type FulfillmentTargetType = "topup_order" | "data_request";
type FulfillmentMode = "dry_run" | "live_manual" | "check_status";

type FulfillTopupRequest = {
  target_type?: FulfillmentTargetType;
  target_id?: string;
  mode?: FulfillmentMode;
};

type TopUpOrderRow = {
  id: string;
  product_id: string | null;
  carrier: string;
  product_type: string;
  product_name: string;
  recipient_phone: string;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd: number | string;
  status: string;
  payment_status: string;
  supplier_status: string;
  supplier_reference: string | null;
};

type TopUpProductRow = {
  id: string;
  carrier: string;
  product_type: string;
  name: string;
  bundle_label: string | null;
  amount_usd: number | string;
  active: boolean;
  external_provider: string | null;
  external_product_id: string | null;
  external_product_metadata: Record<string, unknown> | null;
};

type PreparedFulfillment = {
  order: TopUpOrderRow;
  product: TopUpProductRow;
  recipientPhone: string;
  dtoneMobileNumber: string;
  externalId: string;
  payloadPreview: {
    product_id: string;
    credit_party_identifier: {
      mobile_number: string;
    };
    external_id: string;
    auto_confirm: true;
  };
};

type DryRunSuccessResponse = {
  ok: true;
  dry_run: true;
  ready_for_fulfillment: true;
  target_type: "topup_order";
  target_id: string;
  order: {
    id: string;
    carrier: string;
    recipient_phone: string;
    product_name: string;
    amount_usd: string;
    service_fee_usd: string;
    total_usd: string;
  };
  dtone_payload_preview: PreparedFulfillment["payloadPreview"];
  message: string;
};

type LiveManualSuccessResponse = {
  ok: true;
  dry_run: false;
  live_manual: true;
  ready_for_fulfillment: true;
  target_type: "topup_order";
  target_id: string;
  order: {
    id: string;
    carrier: string;
    recipient_phone: string;
    product_name: string;
    amount_usd: string;
    service_fee_usd: string;
    total_usd: string;
    status: string;
    supplier_status: string;
    supplier_reference: string | null;
  };
  dtone_payload: PreparedFulfillment["payloadPreview"];
  dtone_response: {
    http_status: number;
    status: string | null;
    reference: string | null;
  };
  message: string;
};

type CheckStatusSuccessResponse = {
  ok: true;
  dry_run: false;
  check_status: true;
  ready_for_fulfillment: true;
  target_type: "topup_order";
  target_id: string;
  order: {
    id: string;
    carrier: string;
    recipient_phone: string;
    product_name: string;
    amount_usd: string;
    service_fee_usd: string;
    total_usd: string;
    status: string;
    supplier_status: string;
    supplier_reference: string | null;
  };
  dtone_status: number;
  dtone_transaction_id: string | null;
  dtone_external_id: string | null;
  dtone_status_summary: string;
  message: string;
};

type DtOneConfigOk = {
  ok: true;
  baseUrl: string;
  username: string;
  password: string;
  transactionsPath: string;
  transactionLookupPath: string;
};

type LiveManualFailureDetails = {
  dtone_status?: number;
  dtone_body_excerpt?: string;
  dtone_response_excerpt?: string;
  dtone_endpoint?: string;
  dtone_transaction_id?: string | null;
  dtone_external_id?: string | null;
  dtone_status_summary?: string | null;
};

type FulfillmentErrorCode =
  | "UNAUTHORIZED_NO_AUTH_HEADER"
  | "UNAUTHORIZED_ADMIN_SECRET_INVALID"
  | "INVALID_REQUEST"
  | "FULFILLMENT_NOT_READY"
  | "ORDER_NOT_FOUND"
  | "PRODUCT_ID_MISSING"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_NOT_MAPPED"
  | "INVALID_PRODUCT_MAPPING"
  | "DTONE_NOT_CONFIGURED"
  | "DTONE_REQUEST_FAILED"
  | "DTONE_HTTP_ERROR"
  | "DTONE_INVALID_RESPONSE"
  | "DTONE_TRANSACTION_NOT_FOUND";

type FulfillmentErrorResponse = {
  ok: false;
  dry_run: boolean;
  live_manual?: true;
  ready_for_fulfillment: false;
  code: FulfillmentErrorCode;
  message: string;
  target_type: "topup_order";
  target_id: string;
} & LiveManualFailureDetails;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, authorization, x-fulfillment-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse(200, { ok: true }, corsHeaders);
  }

  if (req.method !== "POST") {
    return jsonResponse(
      405,
      errorResponse("unknown", false, "INVALID_REQUEST", "Method not allowed."),
      corsHeaders,
    );
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")?.trim().replace(/\/$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return jsonResponse(
      500,
      errorResponse(
        "unknown",
        false,
        "DTONE_NOT_CONFIGURED",
        "Supabase is not configured for fulfillment.",
      ),
      corsHeaders,
    );
  }

  const authorization = req.headers.get("authorization");
  if (!authorization?.trim()) {
    return jsonResponse(
      401,
      errorResponse(
        "unknown",
        false,
        "UNAUTHORIZED_NO_AUTH_HEADER",
        "Missing authorization header",
      ),
      corsHeaders,
    );
  }

  const body = (await req
    .json()
    .catch(() => null)) as FulfillTopupRequest | null;
  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();
  const mode = body?.mode;

  if (
    targetType !== "topup_order" ||
    !targetId ||
    (mode !== "dry_run" &&
      mode !== "live_manual" &&
      mode !== "check_status")
  ) {
    return jsonResponse(
      400,
      errorResponse(
        targetId ?? "unknown",
        false,
        "INVALID_REQUEST",
        "target_type must be topup_order, mode must be dry_run, live_manual, or check_status, and target_id is required.",
      ),
      corsHeaders,
    );
  }

  if (mode === "live_manual" || mode === "check_status") {
    const adminSecret = Deno.env.get("FULFILLMENT_ADMIN_SECRET")?.trim();
    const requestSecret = req.headers.get("x-fulfillment-admin-secret")?.trim();

    if (!adminSecret) {
      return jsonResponse(
        500,
        errorResponse(
          targetId,
          true,
          "DTONE_NOT_CONFIGURED",
          "Manual fulfillment admin secret is not configured.",
        ),
        corsHeaders,
      );
    }

    if (!requestSecret || requestSecret !== adminSecret) {
      return jsonResponse(
        403,
        errorResponse(
          targetId,
          true,
          "UNAUTHORIZED_ADMIN_SECRET_INVALID",
          "Invalid admin secret for manual fulfillment.",
        ),
        corsHeaders,
      );
    }
  }

  const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
  if (!order) {
    return jsonResponse(
      404,
      errorResponse(
        targetId,
        mode === "dry_run",
        "ORDER_NOT_FOUND",
        "Top-up order not found.",
        mode === "live_manual",
      ),
      corsHeaders,
    );
  }

  const readiness = await prepareFulfillment(
    baseUrl,
    serviceRoleKey,
    order,
    targetId,
  );
  if ("error" in readiness) {
    return jsonResponse(
      readiness.error.httpStatus,
      errorResponse(
        targetId,
        mode === "dry_run",
        readiness.error.code,
        readiness.error.message,
        mode === "live_manual",
      ),
      corsHeaders,
    );
  }

  if (mode === "dry_run") {
    return jsonResponse(
      200,
      buildDryRunResponse(readiness.prepared),
      corsHeaders,
    );
  }

  if (mode === "check_status") {
    const liveResult = await runCheckStatusReconciliation(
      baseUrl,
      serviceRoleKey,
      readiness.prepared,
    );
    if (!liveResult.ok) {
      return jsonResponse(
        liveResult.httpStatus,
        liveResult.response,
        corsHeaders,
      );
    }

    return jsonResponse(200, liveResult.response, corsHeaders);
  }

  const liveResult = await runLiveManualFulfillment(
    baseUrl,
    serviceRoleKey,
    readiness.prepared,
  );
  if (!liveResult.ok) {
    return jsonResponse(
      liveResult.httpStatus,
      liveResult.response,
      corsHeaders,
    );
  }

  return jsonResponse(200, liveResult.response, corsHeaders);
});

function buildDryRunResponse(
  prepared: PreparedFulfillment,
): DryRunSuccessResponse {
  return {
    ok: true,
    dry_run: true,
    ready_for_fulfillment: true,
    target_type: "topup_order",
    target_id: prepared.order.id,
    order: {
      id: prepared.order.id,
      carrier: prepared.order.carrier,
      recipient_phone: prepared.recipientPhone,
      product_name: prepared.order.product_name,
      amount_usd: toMoneyString(prepared.order.amount_usd),
      service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
      total_usd: toMoneyString(prepared.order.total_usd),
    },
    dtone_payload_preview: prepared.payloadPreview,
    message: "Dry run passed. No DT One transaction was sent.",
  };
}

async function prepareFulfillment(
  baseUrl: string,
  serviceRoleKey: string,
  order: TopUpOrderRow,
  targetId: string,
): Promise<
  | { prepared: PreparedFulfillment }
  | {
      error: {
        httpStatus: number;
        code: FulfillmentErrorCode;
        message: string;
      };
    }
> {
  const orderReadiness = validateTopUpOrderReadiness(order);
  if (!orderReadiness.readyForFulfillment) {
    return { error: orderReadiness };
  }

  if (normalizeText(order.supplier_reference)) {
    return {
      error: {
        httpStatus: 409,
        code: "FULFILLMENT_NOT_READY",
        message:
          "This order already has a supplier reference. Live manual fulfillment can only happen once.",
      },
    };
  }

  if (!order.product_id) {
    return {
      error: {
        httpStatus: 409,
        code: "PRODUCT_ID_MISSING",
        message:
          "This order is missing product_id. Backfill older orders before exact fulfillment.",
      },
    };
  }

  const product = await fetchProductById(
    baseUrl,
    serviceRoleKey,
    order.product_id,
  );
  if (!product) {
    return {
      error: {
        httpStatus: 409,
        code: "PRODUCT_NOT_FOUND",
        message: "Linked product could not be found for this order.",
      },
    };
  }

  const productValidation = validateProductMapping(product, {
    expectedProductId: order.product_id,
    carrier: order.carrier,
    productType: order.product_type,
    productName: order.product_name,
    amountUsd: Number(order.amount_usd),
  });

  if (!productValidation.readyForFulfillment) {
    return { error: productValidation };
  }

  const recipientPhone = normalizeRecipientPhoneForDtOne(order.recipient_phone);
  if (!recipientPhone) {
    return {
      error: {
        httpStatus: 409,
        code: "FULFILLMENT_NOT_READY",
        message: "Recipient phone cannot be normalized for DT One.",
      },
    };
  }

  return {
    prepared: {
      order,
      product,
      recipientPhone,
      dtoneMobileNumber: buildDtOneMobileNumber(recipientPhone),
      externalId: buildExternalId(order.id),
      payloadPreview: buildDtOnePayloadPreview(
        product,
        buildDtOneMobileNumber(recipientPhone),
        buildExternalId(order.id),
      ),
    },
  };
}

async function runLiveManualFulfillment(
  baseUrl: string,
  serviceRoleKey: string,
  prepared: PreparedFulfillment,
): Promise<
  | { ok: true; response: LiveManualSuccessResponse }
  | { ok: false; httpStatus: number; response: FulfillmentErrorResponse }
> {
  const dtoneConfig = getDtoneConfig();
  if (!dtoneConfig.ok) {
    return {
      ok: false,
      httpStatus: 500,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_NOT_CONFIGURED",
        dtoneConfig.message,
        true,
      ),
    };
  }

  let dtoneResponse;
  try {
    dtoneResponse = await callDtOne(prepared.payloadPreview, dtoneConfig);
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_REQUEST_FAILED",
        getSafeErrorMessage(error),
        true,
      ),
    };
  }

  if (!dtoneResponse.ok) {
    return {
      ok: false,
      httpStatus: dtoneResponse.httpStatus,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_HTTP_ERROR",
        "DT One returned an HTTP error response.",
        true,
        {
          dtone_status: dtoneResponse.httpStatus,
          dtone_body_excerpt: truncateSafe(dtoneResponse.rawText, 500),
          dtone_endpoint: dtoneResponse.endpoint,
        },
      ),
    };
  }

  if (!dtoneResponse.body) {
    return {
      ok: false,
      httpStatus: 502,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_INVALID_RESPONSE",
        "DT One returned an invalid JSON response.",
        true,
        {
          dtone_status: dtoneResponse.httpStatus,
          dtone_response_excerpt: truncateSafe(dtoneResponse.rawText, 500),
          dtone_endpoint: dtoneResponse.endpoint,
        },
      ),
    };
  }

  const summary = summarizeDtOneResponse(dtoneResponse);
  const supplierReference = summary.reference ?? prepared.externalId;

  if (summary.outcome === "success") {
    await updateTopUpOrder(baseUrl, serviceRoleKey, prepared.order.id, {
      supplier_status: "successful",
      status: "completed",
      supplier_reference: supplierReference,
    });

    return {
      ok: true,
      response: {
        ok: true,
        dry_run: false,
        live_manual: true,
        ready_for_fulfillment: true,
        target_type: "topup_order",
        target_id: prepared.order.id,
        order: {
          id: prepared.order.id,
          carrier: prepared.order.carrier,
          recipient_phone: prepared.recipientPhone,
          product_name: prepared.order.product_name,
          amount_usd: toMoneyString(prepared.order.amount_usd),
          service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
          total_usd: toMoneyString(prepared.order.total_usd),
          status: "completed",
          supplier_status: "successful",
          supplier_reference: supplierReference,
        },
        dtone_payload: prepared.payloadPreview,
        dtone_response: summary.safeResponse,
        message:
          "DT One returned confirmed success. Order was marked completed.",
      },
    };
  }

  if (summary.outcome === "pending") {
    await updateTopUpOrder(baseUrl, serviceRoleKey, prepared.order.id, {
      supplier_status: "pending",
      status: "processing",
      supplier_reference: supplierReference,
    });

    return {
      ok: true,
      response: {
        ok: true,
        dry_run: false,
        live_manual: true,
        ready_for_fulfillment: true,
        target_type: "topup_order",
        target_id: prepared.order.id,
        order: {
          id: prepared.order.id,
          carrier: prepared.order.carrier,
          recipient_phone: prepared.recipientPhone,
          product_name: prepared.order.product_name,
          amount_usd: toMoneyString(prepared.order.amount_usd),
          service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
          total_usd: toMoneyString(prepared.order.total_usd),
          status: "processing",
          supplier_status: "pending",
          supplier_reference: supplierReference,
        },
        dtone_payload: prepared.payloadPreview,
        dtone_response: summary.safeResponse,
        message:
          "DT One returned a pending response. Order remains processing.",
      },
    };
  }

  await updateTopUpOrder(baseUrl, serviceRoleKey, prepared.order.id, {
    supplier_status: "failed",
    status: "failed",
    supplier_reference: supplierReference,
  });

  return {
    ok: false,
    httpStatus: summary.httpStatus >= 400 ? summary.httpStatus : 502,
    response: errorResponse(
      prepared.order.id,
      false,
      "DTONE_REQUEST_FAILED",
      summary.message ?? "DT One rejected the manual fulfillment request.",
      true,
    ),
  };
}

async function runCheckStatusReconciliation(
  baseUrl: string,
  serviceRoleKey: string,
  prepared: PreparedFulfillment,
): Promise<
  | { ok: true; response: CheckStatusSuccessResponse }
  | { ok: false; httpStatus: number; response: FulfillmentErrorResponse }
> {
  const dtoneConfig = getDtoneConfig();
  if (!dtoneConfig.ok) {
    return {
      ok: false,
      httpStatus: 500,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_NOT_CONFIGURED",
        dtoneConfig.message,
        true,
      ),
    };
  }

  if (
    prepared.order.supplier_status !== "pending" &&
    prepared.order.supplier_status !== "processing"
  ) {
    return {
      ok: false,
      httpStatus: 409,
      response: errorResponse(
        prepared.order.id,
        false,
        "FULFILLMENT_NOT_READY",
        "Status check requires supplier_status to be pending or processing.",
        true,
      ),
    };
  }

  const lookupReference =
    normalizeText(prepared.order.supplier_reference) ?? prepared.externalId;

  let dtoneResponse;
  try {
    dtoneResponse = await callDtOneStatusLookup(lookupReference, dtoneConfig);
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_REQUEST_FAILED",
        getSafeErrorMessage(error),
        true,
      ),
    };
  }

  if (!dtoneResponse.ok) {
    return {
      ok: false,
      httpStatus: dtoneResponse.httpStatus,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_HTTP_ERROR",
        "DT One returned an HTTP error response while checking status.",
        true,
        {
          dtone_status: dtoneResponse.httpStatus,
          dtone_body_excerpt: truncateSafe(dtoneResponse.rawText, 500),
          dtone_endpoint: dtoneResponse.endpoint,
        },
      ),
    };
  }

  const lookupSummary = summarizeDtOneTransactionLookup(
    dtoneResponse.httpStatus,
    dtoneResponse.body,
    lookupReference,
  );

  if (lookupSummary.kind === "not_found") {
    return {
      ok: false,
      httpStatus: 404,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_TRANSACTION_NOT_FOUND",
        "DT One transaction was not found for the supplied external id.",
        true,
        {
          dtone_status: dtoneResponse.httpStatus,
          dtone_endpoint: dtoneResponse.endpoint,
          dtone_external_id: lookupReference,
          dtone_status_summary: lookupSummary.statusSummary,
        },
      ),
    };
  }

  if (lookupSummary.kind === "invalid") {
    return {
      ok: false,
      httpStatus: 502,
      response: errorResponse(
        prepared.order.id,
        false,
        "DTONE_INVALID_RESPONSE",
        "DT One returned an invalid JSON response while checking status.",
        true,
        {
          dtone_status: dtoneResponse.httpStatus,
          dtone_response_excerpt: truncateSafe(dtoneResponse.rawText, 500),
          dtone_endpoint: dtoneResponse.endpoint,
          dtone_status_summary: lookupSummary.statusSummary,
        },
      ),
    };
  }

  const supplierReference =
    lookupSummary.externalId ?? lookupReference;

  if (lookupSummary.outcome === "success") {
    await updateTopUpOrder(baseUrl, serviceRoleKey, prepared.order.id, {
      supplier_status: "successful",
      status: "completed",
      supplier_reference: supplierReference,
    });

    return {
      ok: true,
      response: {
        ok: true,
        dry_run: false,
        check_status: true,
        ready_for_fulfillment: true,
        target_type: "topup_order",
        target_id: prepared.order.id,
        order: {
          id: prepared.order.id,
          carrier: prepared.order.carrier,
          recipient_phone: prepared.recipientPhone,
          product_name: prepared.order.product_name,
          amount_usd: toMoneyString(prepared.order.amount_usd),
          service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
          total_usd: toMoneyString(prepared.order.total_usd),
          status: "completed",
          supplier_status: "successful",
          supplier_reference: supplierReference,
        },
        dtone_status: lookupSummary.dtoneStatus,
        dtone_transaction_id: lookupSummary.transactionId,
        dtone_external_id: lookupSummary.externalId,
        dtone_status_summary: lookupSummary.statusSummary,
        message:
          "DT One transaction is successful. Order was marked completed.",
      },
    };
  }

  if (lookupSummary.outcome === "pending") {
    return {
      ok: true,
      response: {
        ok: true,
        dry_run: false,
        check_status: true,
        ready_for_fulfillment: true,
        target_type: "topup_order",
        target_id: prepared.order.id,
        order: {
          id: prepared.order.id,
          carrier: prepared.order.carrier,
          recipient_phone: prepared.recipientPhone,
          product_name: prepared.order.product_name,
          amount_usd: toMoneyString(prepared.order.amount_usd),
          service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
          total_usd: toMoneyString(prepared.order.total_usd),
          status: prepared.order.status,
          supplier_status: prepared.order.supplier_status,
          supplier_reference: supplierReference,
        },
        dtone_status: lookupSummary.dtoneStatus,
        dtone_transaction_id: lookupSummary.transactionId,
        dtone_external_id: lookupSummary.externalId,
        dtone_status_summary: lookupSummary.statusSummary,
        message: "DT One transaction is still pending or processing.",
      },
    };
  }

  await updateTopUpOrder(baseUrl, serviceRoleKey, prepared.order.id, {
    supplier_status: "failed",
    status: "failed",
    supplier_reference: supplierReference,
  });

  return {
    ok: true,
    response: {
      ok: true,
      dry_run: false,
      check_status: true,
      ready_for_fulfillment: true,
      target_type: "topup_order",
      target_id: prepared.order.id,
      order: {
        id: prepared.order.id,
        carrier: prepared.order.carrier,
        recipient_phone: prepared.recipientPhone,
        product_name: prepared.order.product_name,
        amount_usd: toMoneyString(prepared.order.amount_usd),
        service_fee_usd: toMoneyString(prepared.order.service_fee_usd),
        total_usd: toMoneyString(prepared.order.total_usd),
        status: "failed",
        supplier_status: "failed",
        supplier_reference: supplierReference,
      },
      dtone_status: lookupSummary.dtoneStatus,
      dtone_transaction_id: lookupSummary.transactionId,
      dtone_external_id: lookupSummary.externalId,
      dtone_status_summary: lookupSummary.statusSummary,
      message: "DT One transaction failed. Order was marked failed.",
    },
  };
}

function validateTopUpOrderReadiness(order: TopUpOrderRow) {
  if (order.payment_status !== "paid") {
    return {
      httpStatus: 409,
      code: "FULFILLMENT_NOT_READY" as const,
      message: "Paid top-up order required before fulfillment.",
      readyForFulfillment: false,
    };
  }

  if (order.status !== "processing" && order.status !== "paid") {
    return {
      httpStatus: 409,
      code: "FULFILLMENT_NOT_READY" as const,
      message:
        "Top-up order must be in paid or processing status before fulfillment.",
      readyForFulfillment: false,
    };
  }

  if (order.status === "completed" || order.supplier_status === "successful") {
    return {
      httpStatus: 409,
      code: "FULFILLMENT_NOT_READY" as const,
      message: "Order is already completed.",
      readyForFulfillment: false,
    };
  }

  if (order.supplier_status === "failed") {
    return {
      httpStatus: 409,
      code: "FULFILLMENT_NOT_READY" as const,
      message: "Order requires review before fulfillment.",
      readyForFulfillment: false,
    };
  }

  if (!normalizeText(order.recipient_phone)) {
    return {
      httpStatus: 409,
      code: "FULFILLMENT_NOT_READY" as const,
      message: "Recipient phone is required before fulfillment.",
      readyForFulfillment: false,
    };
  }

  return {
    httpStatus: 200,
    code: "FULFILLMENT_NOT_READY" as const,
    message: "Top-up order is ready for fulfillment.",
    readyForFulfillment: true,
  };
}

function validateProductMapping(
  product: TopUpProductRow | null,
  expected: {
    expectedProductId: string;
    carrier: string;
    productType: string;
    productName: string;
    amountUsd: number;
  },
):
  | {
      httpStatus: number;
      code: FulfillmentErrorCode;
      message: string;
      readyForFulfillment: false;
    }
  | {
      httpStatus: number;
      code: "FULFILLMENT_NOT_READY";
      message: string;
      readyForFulfillment: true;
      product: TopUpProductRow;
    } {
  if (!product) {
    return {
      httpStatus: 409,
      code: "PRODUCT_NOT_MAPPED",
      message: "Product not mapped.",
      readyForFulfillment: false,
    };
  }

  const provider = normalizeText(product.external_provider);
  const externalProductId = normalizeText(product.external_product_id);
  const mappedCarrier = normalizeText(product.carrier);
  const mappedProductType = normalizeText(product.product_type);
  const mappedName = normalizeText(product.name);
  const mappedAmount = Number(product.amount_usd);
  const isActive = product.active === true;
  const mappingExists =
    isActive && provider === "dtone" && Boolean(externalProductId);

  if (!mappingExists) {
    return {
      httpStatus: 409,
      code: "PRODUCT_NOT_MAPPED",
      message: "Product not mapped.",
      readyForFulfillment: false,
    };
  }

  const mappingMatches =
    product.id === expected.expectedProductId &&
    mappedCarrier === expected.carrier &&
    mappedProductType === expected.productType &&
    mappedName === expected.productName &&
    Number.isFinite(mappedAmount) &&
    mappedAmount === expected.amountUsd &&
    (expected.productType !== "data" ||
      normalizeText(product.bundle_label) !== null);

  if (!mappingMatches) {
    return {
      httpStatus: 409,
      code: "INVALID_PRODUCT_MAPPING",
      message: "Product mapping is invalid.",
      readyForFulfillment: false,
    };
  }

  return {
    httpStatus: 200,
    code: "FULFILLMENT_NOT_READY",
    message: "Product mapping is valid.",
    readyForFulfillment: true,
    product,
  };
}

async function fetchTopUpOrderById(
  baseUrl: string,
  serviceRoleKey: string,
  orderId: string,
) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(
      orderId,
    )}&select=id,product_id,carrier,product_type,product_name,recipient_phone,amount_usd,service_fee_usd,total_usd,status,payment_status,supplier_status,supplier_reference&limit=1`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json().catch(() => [])) as TopUpOrderRow[];
  return rows[0] ?? null;
}

async function fetchProductById(
  baseUrl: string,
  serviceRoleKey: string,
  productId: string,
) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_products?id=eq.${encodeURIComponent(
      productId,
    )}&select=id,carrier,product_type,name,bundle_label,amount_usd,active,external_provider,external_product_id,external_product_metadata&limit=1`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json().catch(() => [])) as TopUpProductRow[];
  return rows[0] ?? null;
}

function buildDtOnePayloadPreview(
  product: TopUpProductRow,
  recipientPhone: string,
  externalId: string,
) {
  // Future phase: this preview should remain the single source of truth for
  // the live DT One request body.
  return {
    product_id: normalizeText(product.external_product_id) ?? "",
    credit_party_identifier: {
      mobile_number: recipientPhone,
    },
    external_id: externalId,
    auto_confirm: true as const,
  };
}

function buildExternalId(orderId: string) {
  return `bt_${orderId.replace(/-/g, "")}`;
}

function buildDtOneMobileNumber(recipientPhone: string) {
  return `+${recipientPhone}`;
}

function normalizeRecipientPhoneForDtOne(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 11 && digits.startsWith("509")) {
    return digits;
  }

  if (digits.length === 8) {
    return `509${digits}`;
  }

  return null;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMoneyString(value: number | string) {
  return Number(value).toFixed(2);
}

function buildServiceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      ...JSON_HEADERS,
    },
  });
}

function errorResponse(
  targetId: string,
  dryRun: boolean,
  code: FulfillmentErrorCode,
  message: string,
  liveManual = false,
  details: LiveManualFailureDetails = {},
): FulfillmentErrorResponse {
  return {
    ok: false,
    dry_run: dryRun,
    ...(liveManual ? { live_manual: true as const } : {}),
    ready_for_fulfillment: false,
    code,
    message,
    target_type: "topup_order",
    target_id: targetId,
    ...details,
  };
}

function getDtoneConfig() {
  const baseUrl = normalizeUrlBase(Deno.env.get("DTONE_API_BASE_URL"));
  const username = Deno.env.get("DTONE_API_USERNAME")?.trim();
  const password = Deno.env.get("DTONE_API_PASSWORD")?.trim();
  const transactionsPath = normalizeUrlPath(
    Deno.env.get("DTONE_TRANSACTIONS_PATH"),
    "/transactions",
  );
  const transactionLookupPath = normalizeUrlPath(
    Deno.env.get("DTONE_TRANSACTION_LOOKUP_PATH"),
    "/transactions",
  );

  if (!baseUrl || !username || !password) {
    return {
      ok: false as const,
      message: "DT One live fulfillment is not configured.",
    };
  }

  return {
    ok: true as const,
    baseUrl,
    username,
    password,
    transactionsPath,
    transactionLookupPath,
  };
}

async function callDtOne(
  payload: PreparedFulfillment["payloadPreview"],
  config: DtOneConfigOk,
) {
  const controller = new AbortController();
  const endpoint = buildUrl(config.baseUrl, config.transactionsPath);
  const timeoutId = setTimeout(
    () => controller.abort("DT One request timed out after 20 seconds."),
    20_000,
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: buildBasicAuthHeader(config.username, config.password),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => "");
    const parsedBody = parseJsonRecord(rawText);

    return {
      httpStatus: response.status,
      ok: response.ok,
      body: parsedBody,
      rawText,
      endpoint,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callDtOneStatusLookup(
  lookupReference: string,
  config: DtOneConfigOk,
) {
  const controller = new AbortController();
  const endpoint = buildUrlWithQuery(
    config.baseUrl,
    config.transactionLookupPath,
    `external_id=${encodeURIComponent(lookupReference)}`,
  );
  const timeoutId = setTimeout(
    () => controller.abort("DT One request timed out after 20 seconds."),
    20_000,
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: buildBasicAuthHeader(config.username, config.password),
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => "");
    const parsedBody = parseJsonValue(rawText);

    return {
      httpStatus: response.status,
      ok: response.ok,
      body: parsedBody,
      rawText,
      endpoint,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildBasicAuthHeader(username: string, password: string) {
  const encoded = btoa(`${username}:${password}`);
  return `Basic ${encoded}`;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseJsonValue(value: string): unknown | null {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeUrlBase(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function normalizeUrlPath(
  value: string | undefined | null,
  fallback: string,
) {
  const trimmed = value?.trim() || fallback;
  const withoutLeading = trimmed.replace(/^\/+/, "");
  const withoutTrailing = withoutLeading.replace(/\/+$/, "");
  return `/${withoutTrailing}`;
}

function buildUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path}`;
}

function buildUrlWithQuery(baseUrl: string, path: string, query: string) {
  return `${baseUrl}${path}?${query}`;
}

function summarizeDtOneResponse(result: {
  httpStatus: number;
  ok: boolean;
  body: Record<string, unknown> | null;
}) {
  const status = firstString(result.body, [
    "status",
    "state",
    "transaction_status",
    "fulfillment_status",
  ]);
  const reference = firstString(result.body, [
    "id",
    "reference",
    "transaction_id",
    "external_id",
  ]);
  const message = firstString(result.body, [
    "message",
    "detail",
    "error",
    "description",
  ]);
  const successHint =
    firstBoolean(result.body, ["success", "ok"]) === true ||
    normalizeText(status)?.toLowerCase() === "successful" ||
    normalizeText(status)?.toLowerCase() === "success" ||
    normalizeText(status)?.toLowerCase() === "completed";
  const pendingHint =
    normalizeText(status)?.toLowerCase() === "pending" ||
    normalizeText(status)?.toLowerCase() === "processing" ||
    normalizeText(status)?.toLowerCase() === "queued";
  const failureHint =
    !result.ok ||
    normalizeText(status)?.toLowerCase() === "failed" ||
    normalizeText(status)?.toLowerCase() === "error" ||
    normalizeText(status)?.toLowerCase() === "rejected" ||
    normalizeText(status)?.toLowerCase() === "declined";

  let outcome: "success" | "pending" | "failed";
  if (successHint) {
    outcome = "success";
  } else if (pendingHint) {
    outcome = "pending";
  } else if (failureHint) {
    outcome = "failed";
  } else if (result.httpStatus >= 200 && result.httpStatus < 300) {
    outcome = "pending";
  } else {
    outcome = "failed";
  }

  return {
    outcome,
    httpStatus: result.httpStatus,
    reference,
    message:
      message ??
      (result.ok
        ? "DT One returned an unclassified response."
        : "DT One request failed."),
    safeResponse: {
      http_status: result.httpStatus,
      status: status ?? null,
      reference,
    },
  };
}

type DtOneTransactionLookupSummary =
  | {
      kind: "not_found";
      dtoneStatus: number;
      statusSummary: string;
    }
  | {
      kind: "invalid";
      dtoneStatus: number;
      statusSummary: string;
    }
  | {
      kind: "ok";
      dtoneStatus: number;
      transactionId: string | null;
      externalId: string | null;
      statusSummary: string;
      outcome: "success" | "pending" | "failed";
    };

function summarizeDtOneTransactionLookup(
  httpStatus: number,
  body: unknown,
  lookupReference: string,
): DtOneTransactionLookupSummary {
  const transaction = extractDtOneTransactionRecord(body);
  if (transaction.kind === "not_found") {
    return {
      kind: "not_found",
      dtoneStatus: httpStatus,
      statusSummary: "DT One returned an empty transaction list.",
    };
  }

  if (transaction.kind === "invalid") {
    return {
      kind: "invalid",
      dtoneStatus: httpStatus,
      statusSummary:
        "DT One lookup response was not a valid transaction object or array.",
    };
  }

  const transactionRecord = transaction.transaction;
  const transactionId = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["id"]),
    getTextAtPath(transactionRecord, ["transaction_id"]),
    getTextAtPath(transactionRecord, ["reference"]),
  ]);
  const externalId = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["external_id"]),
  ]) ?? lookupReference;
  const topLevelStatus = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["transaction_status"]),
    getTextAtPath(transactionRecord, ["status"]),
  ]);
  const statusClassMessage = getTextAtPath(transactionRecord, [
    "status",
    "class",
    "message",
  ]);
  const statusMessage = getTextAtPath(transactionRecord, ["status", "message"]);
  const statusCode = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["status", "code"]),
  ]);
  const confirmationDate = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["confirmation_date"]),
  ]);
  const confirmationExpirationDate = firstNonEmptyString([
    getTextAtPath(transactionRecord, ["confirmation_expiration_date"]),
  ]);

  const statusSummary = buildDtOneStatusSummary({
    transactionStatus: topLevelStatus,
    statusClassMessage,
    statusMessage,
    statusCode,
    confirmationDate,
    confirmationExpirationDate,
  });

  const outcome = classifyDtOneTransactionStatus({
    transactionStatus: topLevelStatus,
    statusClassMessage,
    statusMessage,
    statusCode,
    confirmationDate,
    confirmationExpirationDate,
  });

  return {
    kind: "ok",
    dtoneStatus: httpStatus,
    transactionId,
    externalId,
    statusSummary,
    outcome,
  };
}

function extractDtOneTransactionRecord(
  body: unknown,
):
  | { kind: "ok"; transaction: Record<string, unknown> }
  | { kind: "not_found" }
  | { kind: "invalid" } {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { kind: "not_found" };
    }

    const firstItem = body[0];
    if (!isPlainRecord(firstItem)) {
      return { kind: "invalid" };
    }

    return { kind: "ok", transaction: firstItem };
  }

  if (isPlainRecord(body)) {
    return { kind: "ok", transaction: body };
  }

  return { kind: "invalid" };
}

function buildDtOneStatusSummary(fields: {
  transactionStatus: string | null;
  statusClassMessage: string | null;
  statusMessage: string | null;
  statusCode: string | null;
  confirmationDate: string | null;
  confirmationExpirationDate: string | null;
}) {
  const parts = [
    fields.transactionStatus
      ? `transaction_status=${fields.transactionStatus}`
      : null,
    fields.statusClassMessage
      ? `status.class.message=${fields.statusClassMessage}`
      : null,
    fields.statusMessage ? `status.message=${fields.statusMessage}` : null,
    fields.statusCode ? `status.code=${fields.statusCode}` : null,
    fields.confirmationDate
      ? `confirmation_date=${fields.confirmationDate}`
      : null,
    fields.confirmationExpirationDate
      ? `confirmation_expiration_date=${fields.confirmationExpirationDate}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0
    ? truncateSafe(parts.join("; "), 240) ??
        "DT One transaction status returned."
    : "DT One transaction status returned without a recognized status field.";
}

function classifyDtOneTransactionStatus(fields: {
  transactionStatus: string | null;
  statusClassMessage: string | null;
  statusMessage: string | null;
  statusCode: string | null;
  confirmationDate: string | null;
  confirmationExpirationDate: string | null;
}): "success" | "pending" | "failed" {
  const values = [
    fields.transactionStatus,
    fields.statusClassMessage,
    fields.statusMessage,
    fields.statusCode,
    fields.confirmationDate ? "confirmed" : null,
    fields.confirmationExpirationDate ? "expires" : null,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const hasFailure = values.some((value) =>
    [
      "failed",
      "failure",
      "rejected",
      "reject",
      "cancelled",
      "canceled",
      "declined",
      "error",
      "void",
    ].some((needle) => value.includes(needle)),
  );
  if (hasFailure) {
    return "failed";
  }

  const hasSuccess = values.some((value) =>
    [
      "successful",
      "success",
      "confirmed",
      "completed",
      "complete",
      "approved",
      "succeeded",
    ].some((needle) => value.includes(needle)),
  );
  if (hasSuccess) {
    return "success";
  }

  return "pending";
}

function getTextAtPath(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!isPlainRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return toTextValue(current);
}

function firstNonEmptyString(values: Array<string | null>) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }

  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTextValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function truncateSafe(value: string | null | undefined, maxLength: number) {
  const text = value?.trim() ?? "";
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return truncateSafe(error.message, 200) ?? "DT One request failed.";
  }

  if (typeof error === "string" && error.trim()) {
    return truncateSafe(error, 200) ?? "DT One request failed.";
  }

  return "DT One request failed.";
}

function firstString(value: Record<string, unknown> | null, keys: string[]) {
  if (!value) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function firstBoolean(value: Record<string, unknown> | null, keys: string[]) {
  if (!value) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return null;
}

async function updateTopUpOrder(
  baseUrl: string,
  serviceRoleKey: string,
  orderId: string,
  patch: {
    supplier_status: "pending" | "successful" | "failed";
    status: "processing" | "completed" | "failed";
    supplier_reference: string | null;
  },
) {
  await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      headers: {
        ...buildServiceHeaders(serviceRoleKey),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
}
