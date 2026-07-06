// Supabase Edge Function: fulfill-topup
//
// Dry-run fulfillment prep only.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// This function validates a paid top-up order, loads the mapped DT One
// product, normalizes the recipient phone, and returns a safe preview of the
// payload that would be sent later.
//
// It does not call DT One, does not create a transaction, does not update
// supplier_status, and does not mark the order completed.

type FulfillmentTargetType = 'topup_order' | 'data_request';

type FulfillmentMode = 'dry_run';

type FulfillTopupRequest = {
  target_type?: FulfillmentTargetType;
  target_id?: string;
  mode?: FulfillmentMode;
};

type TopUpOrderRow = {
  id: string;
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

type DryRunSuccessResponse = {
  ok: true;
  dry_run: true;
  ready_for_fulfillment: true;
  target_type: 'topup_order';
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
  dtone_payload_preview: {
    product_id: string;
    credit_party_identifier: {
      mobile_number: string;
    };
    external_id: string;
  };
  message: string;
};

type DryRunErrorCode =
  | 'UNAUTHORIZED_NO_AUTH_HEADER'
  | 'INVALID_REQUEST'
  | 'ORDER_NOT_FOUND'
  | 'PRODUCT_NOT_MAPPED'
  | 'INVALID_PRODUCT_MAPPING'
  | 'FULFILLMENT_NOT_READY';

type DryRunErrorResponse = {
  ok: false;
  dry_run: true;
  ready_for_fulfillment: false;
  code: DryRunErrorCode;
  message: string;
  target_type: 'topup_order';
  target_id: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true }, corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, errorResponse('unknown', 'INVALID_REQUEST', 'Method not allowed.'), corsHeaders);
  }

  const baseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return jsonResponse(
      500,
      errorResponse('unknown', 'FULFILLMENT_NOT_READY', 'Fulfillment is not configured yet.'),
      corsHeaders
    );
  }

  const authorization = req.headers.get('authorization');
  if (!authorization?.trim()) {
    return jsonResponse(
      401,
      errorResponse('unknown', 'UNAUTHORIZED_NO_AUTH_HEADER', 'Missing authorization header'),
      corsHeaders
    );
  }

  const body = (await req.json().catch(() => null)) as FulfillTopupRequest | null;
  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();
  const mode = body?.mode;

  if (targetType !== 'topup_order' || mode !== 'dry_run' || !targetId) {
    return jsonResponse(
      400,
      errorResponse(
        targetId ?? 'unknown',
        'INVALID_REQUEST',
        'target_type must be topup_order, mode must be dry_run, and target_id is required.'
      ),
      corsHeaders
    );
  }

  const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
  if (!order) {
    return jsonResponse(404, errorResponse(targetId, 'ORDER_NOT_FOUND', 'Top-up order not found.'), corsHeaders);
  }

  const orderReadiness = validateTopUpOrderReadiness(order);
  if (!orderReadiness.readyForFulfillment) {
    return jsonResponse(
      orderReadiness.httpStatus,
      errorResponse(targetId, orderReadiness.code, orderReadiness.message),
      corsHeaders
    );
  }

  const product = await fetchProductMapping(
    baseUrl,
    serviceRoleKey,
    order.carrier,
    order.product_type,
    order.product_name
  );

  const productValidation = validateProductMapping(product, {
    carrier: order.carrier,
    productType: order.product_type,
    productName: order.product_name,
    amountUsd: Number(order.amount_usd),
  });

  if (!productValidation.readyForFulfillment) {
    return jsonResponse(
      productValidation.httpStatus,
      errorResponse(targetId, productValidation.code, productValidation.message),
      corsHeaders
    );
  }

  const recipientPhone = normalizeRecipientPhoneForDtOne(order.recipient_phone);
  if (!recipientPhone) {
    return jsonResponse(
      409,
      errorResponse(
        targetId,
        'FULFILLMENT_NOT_READY',
        'Recipient phone cannot be normalized for DT One.'
      ),
      corsHeaders
    );
  }

  const payloadPreview = buildDtOnePayloadPreview(order, productValidation.product, recipientPhone);

  // Future phase: send payloadPreview to DT One here using external_id as the
  // idempotency/reference key. Supplier status should only change after a
  // confirmed DT One response, never before.

  const response: DryRunSuccessResponse = {
    ok: true,
    dry_run: true,
    ready_for_fulfillment: true,
    target_type: 'topup_order',
    target_id: targetId,
    order: {
      id: order.id,
      carrier: order.carrier,
      recipient_phone: recipientPhone,
      product_name: order.product_name,
      amount_usd: toMoneyString(order.amount_usd),
      service_fee_usd: toMoneyString(order.service_fee_usd),
      total_usd: toMoneyString(order.total_usd),
    },
    dtone_payload_preview: payloadPreview,
    message: 'Dry run passed. No DT One transaction was sent.',
  };

  console.info('[fulfill-topup] dry run ready', {
    target_type: response.target_type,
    target_id: response.target_id,
    order_id: order.id,
    product_id: product.id,
    external_id: payloadPreview.external_id,
  });

  return jsonResponse(200, response, corsHeaders);
});

function errorResponse(
  targetId: string,
  code: DryRunErrorCode,
  message: string
): DryRunErrorResponse {
  return {
    ok: false,
    dry_run: true,
    ready_for_fulfillment: false,
    code,
    message,
    target_type: 'topup_order',
    target_id: targetId,
  };
}

function validateTopUpOrderReadiness(order: TopUpOrderRow) {
  if (order.payment_status !== 'paid') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Paid top-up order required before dry run.',
      readyForFulfillment: false,
    };
  }

  if (order.status !== 'processing' && order.status !== 'paid') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Top-up order must be in paid or processing status before dry run.',
      readyForFulfillment: false,
    };
  }

  if (order.supplier_status === 'successful') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Order is already fulfilled.',
      readyForFulfillment: false,
    };
  }

  if (order.supplier_status === 'failed') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Order requires review before fulfillment.',
      readyForFulfillment: false,
    };
  }

  if (!normalizeText(order.recipient_phone)) {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Recipient phone is required before fulfillment.',
      readyForFulfillment: false,
    };
  }

  return {
    httpStatus: 200,
    code: 'FULFILLMENT_NOT_READY' as const,
    message: 'Top-up order is ready for dry run.',
    readyForFulfillment: true,
  };
}

function validateProductMapping(
  product: TopUpProductRow | null,
  expected: {
    carrier: string;
    productType: string;
    productName: string;
    amountUsd: number;
  }
): { httpStatus: number; code: DryRunErrorCode; message: string; readyForFulfillment: false } | {
  httpStatus: number;
  code: 'FULFILLMENT_NOT_READY';
  message: string;
  readyForFulfillment: true;
  product: TopUpProductRow;
} {
  if (!product) {
    return {
      httpStatus: 409,
      code: 'PRODUCT_NOT_MAPPED',
      message: 'Product not mapped.',
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
  const mappingExists = isActive && provider === 'dtone' && Boolean(externalProductId);

  if (!mappingExists) {
    return {
      httpStatus: 409,
      code: 'PRODUCT_NOT_MAPPED',
      message: 'Product not mapped.',
      readyForFulfillment: false,
    };
  }

  const mappingMatches =
    mappedCarrier === expected.carrier &&
    mappedProductType === expected.productType &&
    mappedName === expected.productName &&
    Number.isFinite(mappedAmount) &&
    mappedAmount === expected.amountUsd &&
    (expected.productType !== 'data' || normalizeText(product.bundle_label) !== null);

  if (!mappingMatches) {
    return {
      httpStatus: 409,
      code: 'INVALID_PRODUCT_MAPPING',
      message: 'Product mapping is invalid.',
      readyForFulfillment: false,
    };
  }

  return {
    httpStatus: 200,
    code: 'FULFILLMENT_NOT_READY',
    message: 'Product mapping is valid.',
    readyForFulfillment: true,
    product,
  };
}

async function fetchTopUpOrderById(baseUrl: string, serviceRoleKey: string, orderId: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(
      orderId
    )}&select=id,carrier,product_type,product_name,recipient_phone,amount_usd,service_fee_usd,total_usd,status,payment_status,supplier_status&limit=1`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json().catch(() => [])) as TopUpOrderRow[];
  return rows[0] ?? null;
}

async function fetchProductMapping(
  baseUrl: string,
  serviceRoleKey: string,
  carrier: string,
  productType: string,
  productName: string
) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_products?carrier=eq.${encodeURIComponent(
      carrier
    )}&product_type=eq.${encodeURIComponent(productType)}&name=eq.${encodeURIComponent(
      productName
    )}&select=id,carrier,product_type,name,bundle_label,amount_usd,active,external_provider,external_product_id,external_product_metadata&limit=1`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json().catch(() => [])) as TopUpProductRow[];
  return rows[0] ?? null;
}

function buildDtOnePayloadPreview(order: TopUpOrderRow, product: TopUpProductRow, mobileNumber: string) {
  // Future phase: this preview should become the real DT One request body.
  return {
    product_id: normalizeText(product.external_product_id) ?? '',
    credit_party_identifier: {
      mobile_number: mobileNumber,
    },
    external_id: buildExternalId(order.id),
  };
}

function buildExternalId(orderId: string) {
  return `boulio-topup-order-${orderId}`;
}

function normalizeRecipientPhoneForDtOne(phone: string) {
  const digits = phone.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length === 11 && digits.startsWith('509')) {
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
    'Content-Type': 'application/json',
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      ...JSON_HEADERS,
    },
  });
}
