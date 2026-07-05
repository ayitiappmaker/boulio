// Supabase Edge Function: fulfill-topup
//
// DT One fulfillment prep only.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - DTONE_BASE_URL
// - DTONE_API_KEY or DTONE_CLIENT_ID / DTONE_CLIENT_SECRET
//
// This function only validates readiness and returns a placeholder-safe
// response. It does not call DT One, does not send airtime/data, and does not
// update fulfillment success.

type FulfillmentTargetType = 'topup_order' | 'data_request';

type FulfillTopupRequest = {
  target_type?: FulfillmentTargetType;
  target_id?: string;
};

type TopUpOrderRow = {
  id: string;
  user_id: string;
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

type DataRequestRow = {
  id: string;
  request_code: string;
  carrier: string;
  product_type: string;
  product_name: string;
  bundle_label: string | null;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd: number | string;
  public_status: string;
  internal_status: string;
  payment_status: string;
  fulfillment_status: string;
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

type FulfillmentPlaceholderResponse = {
  ok: false;
  code:
    | 'UNAUTHORIZED_NO_AUTH_HEADER'
    | 'INVALID_REQUEST'
    | 'ORDER_NOT_FOUND'
    | 'REQUEST_NOT_FOUND'
    | 'FULFILLMENT_NOT_READY'
    | 'PRODUCT_NOT_MAPPED'
    | 'INVALID_PRODUCT_MAPPING'
    | 'FULFILLMENT_NOT_ENABLED';
  message: string;
  target_type: FulfillmentTargetType;
  target_id: string;
  ready_for_fulfillment: boolean;
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
    return jsonResponse(405, wrapFailure('topup_order', 'unknown', 'INVALID_REQUEST', 'Method not allowed.'), corsHeaders);
  }

  const baseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return jsonResponse(
      500,
      wrapFailure('topup_order', 'unknown', 'FULFILLMENT_NOT_READY', 'Fulfillment is not configured yet.'),
      corsHeaders
    );
  }

  const authorization = req.headers.get('authorization');
  if (!authorization?.trim()) {
    return jsonResponse(
      401,
      wrapFailure('topup_order', 'unknown', 'UNAUTHORIZED_NO_AUTH_HEADER', 'Missing authorization header'),
      corsHeaders
    );
  }

  const body = (await req.json().catch(() => null)) as FulfillTopupRequest | null;
  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();

  if (!targetType || !targetId) {
    return jsonResponse(
      400,
      wrapFailure(targetType ?? 'topup_order', targetId ?? 'unknown', 'INVALID_REQUEST', 'target_type and target_id are required.'),
      corsHeaders
    );
  }

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order) {
      return jsonResponse(404, wrapFailure(targetType, targetId, 'ORDER_NOT_FOUND', 'Top-up order not found.'), corsHeaders);
    }

    const readiness = evaluateTopUpOrderReadiness(baseUrl, serviceRoleKey, order);
    logReadiness(targetType, targetId, readiness.readyForFulfillment, readiness.code);

    if (!readiness.readyForFulfillment) {
      return jsonResponse(readiness.httpStatus, wrapFailure(targetType, targetId, readiness.code, readiness.message), corsHeaders);
    }

    return jsonResponse(
      200,
      wrapFailure(targetType, targetId, 'FULFILLMENT_NOT_ENABLED', 'Supplier fulfillment is not enabled yet.', true),
      corsHeaders
    );
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow) {
    return jsonResponse(404, wrapFailure(targetType, targetId, 'REQUEST_NOT_FOUND', 'Data request not found.'), corsHeaders);
  }

  const readiness = await evaluateDataRequestReadiness(baseUrl, serviceRoleKey, requestRow);
  logReadiness(targetType, targetId, readiness.readyForFulfillment, readiness.code);

  if (!readiness.readyForFulfillment) {
    return jsonResponse(readiness.httpStatus, wrapFailure(targetType, targetId, readiness.code, readiness.message), corsHeaders);
  }

  return jsonResponse(
    200,
    wrapFailure(targetType, targetId, 'FULFILLMENT_NOT_ENABLED', 'Supplier fulfillment is not enabled yet.', true),
    corsHeaders
  );
});

function wrapFailure(
  targetType: FulfillmentTargetType,
  targetId: string,
  code: FulfillmentPlaceholderResponse['code'],
  message: string,
  readyForFulfillment = false
): FulfillmentPlaceholderResponse {
  return {
    ok: false,
    code,
    message,
    target_type: targetType,
    target_id: targetId,
    ready_for_fulfillment: readyForFulfillment,
  };
}

async function evaluateTopUpOrderReadiness(baseUrl: string, serviceRoleKey: string, order: TopUpOrderRow) {
  if (order.payment_status !== 'paid' || order.status !== 'processing') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Paid processing order required before fulfillment.',
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

  const product = await fetchProductMapping(baseUrl, serviceRoleKey, order.carrier, order.product_type, order.product_name);
  const mappingValidation = validateProductMapping(product, {
    carrier: order.carrier,
    productType: order.product_type,
    productName: order.product_name,
    bundleLabel: null,
    amountUsd: Number(order.amount_usd),
  });

  if (!mappingValidation.readyForFulfillment) {
    return mappingValidation;
  }

  return {
    httpStatus: 200,
    code: 'FULFILLMENT_NOT_ENABLED' as const,
    message: 'Supplier fulfillment is not enabled yet.',
    readyForFulfillment: true,
  };
}

async function evaluateDataRequestReadiness(baseUrl: string, serviceRoleKey: string, requestRow: DataRequestRow) {
  if (requestRow.payment_status !== 'paid') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Paid request required before fulfillment.',
      readyForFulfillment: false,
    };
  }

  if (requestRow.internal_status !== 'processing' && requestRow.internal_status !== 'paid') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Processing request required before fulfillment.',
      readyForFulfillment: false,
    };
  }

  if (requestRow.fulfillment_status === 'successful') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Request is already fulfilled.',
      readyForFulfillment: false,
    };
  }

  if (requestRow.fulfillment_status === 'failed') {
    return {
      httpStatus: 409,
      code: 'FULFILLMENT_NOT_READY' as const,
      message: 'Request requires review before fulfillment.',
      readyForFulfillment: false,
    };
  }

  const product = await fetchProductMapping(
    baseUrl,
    serviceRoleKey,
    requestRow.carrier,
    requestRow.product_type,
    requestRow.product_name
  );
  const mappingValidation = validateProductMapping(product, {
    carrier: requestRow.carrier,
    productType: requestRow.product_type,
    productName: requestRow.product_name,
    bundleLabel: requestRow.bundle_label,
    amountUsd: Number(requestRow.amount_usd),
  });

  if (!mappingValidation.readyForFulfillment) {
    return mappingValidation;
  }

  return {
    httpStatus: 200,
    code: 'FULFILLMENT_NOT_ENABLED' as const,
    message: 'Supplier fulfillment is not enabled yet.',
    readyForFulfillment: true,
  };
}

function validateProductMapping(
  product: TopUpProductRow | null,
  expected: {
    carrier: string;
    productType: string;
    productName: string;
    bundleLabel: string | null;
    amountUsd: number;
  }
) {
  if (!product) {
    return {
      httpStatus: 409,
      code: 'PRODUCT_NOT_MAPPED' as const,
      message: 'Product not mapped.',
      readyForFulfillment: false,
    };
  }

  const provider = normalizeText(product.external_provider);
  const externalProductId = normalizeText(product.external_product_id);
  const externalProductMetadata = normalizeRecord(product.external_product_metadata);
  const active = product.active === true;
  const mappedCarrier = normalizeText(product.carrier);
  const mappedProductType = normalizeText(product.product_type);
  const mappedName = normalizeText(product.name);
  const mappedBundleLabel = normalizeText(product.bundle_label);
  const mappedAmount = Number(product.amount_usd);
  const mappingLooksValid =
    active &&
    provider === 'dtone' &&
    Boolean(externalProductId) &&
    mappedCarrier &&
    mappedProductType &&
    (mappedProductType === 'airtime' || mappedProductType === 'data') &&
    mappedName &&
    mappedCarrier === expected.carrier &&
    mappedProductType === expected.productType &&
    mappedName === expected.productName &&
    Number.isFinite(mappedAmount) &&
    mappedAmount === expected.amountUsd &&
    (expected.productType !== 'data' || normalizeText(expected.bundleLabel) === mappedBundleLabel) &&
    (expected.productType !== 'airtime' || mappedBundleLabel === null) &&
    externalProductMetadata !== undefined;

  if (!mappingLooksValid) {
    return {
      httpStatus: 409,
      code: 'INVALID_PRODUCT_MAPPING' as const,
      message: 'Product mapping is invalid.',
      readyForFulfillment: false,
    };
  }

  return {
    httpStatus: 200,
    code: 'FULFILLMENT_NOT_ENABLED' as const,
    message: 'Supplier fulfillment is not enabled yet.',
    readyForFulfillment: true,
  };
}

async function fetchTopUpOrderById(baseUrl: string, serviceRoleKey: string, orderId: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}&select=id,user_id,carrier,product_type,product_name,recipient_phone,amount_usd,service_fee_usd,total_usd,status,payment_status,supplier_status&limit=1`,
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

async function fetchDataRequestByIdOrCode(baseUrl: string, serviceRoleKey: string, targetId: string) {
  const byId = await fetchDataRequest(baseUrl, serviceRoleKey, `id=eq.${encodeURIComponent(targetId)}`);
  if (byId) {
    return byId;
  }

  return fetchDataRequest(baseUrl, serviceRoleKey, `request_code=eq.${encodeURIComponent(targetId)}`);
}

async function fetchDataRequest(baseUrl: string, serviceRoleKey: string, filter: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/data_requests?${filter}&select=id,request_code,carrier,product_type,product_name,bundle_label,amount_usd,service_fee_usd,total_usd,public_status,internal_status,payment_status,fulfillment_status&limit=1`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json().catch(() => [])) as DataRequestRow[];
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
    `${baseUrl}/rest/v1/topup_products?carrier=eq.${encodeURIComponent(carrier)}&product_type=eq.${encodeURIComponent(productType)}&name=eq.${encodeURIComponent(productName)}&select=id,carrier,product_type,name,bundle_label,amount_usd,active,external_provider,external_product_id,external_product_metadata&limit=1`,
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

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRecord(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
}

function logReadiness(
  targetType: FulfillmentTargetType,
  targetId: string,
  readyForFulfillment: boolean,
  code: string
) {
  console.info('[fulfill-topup]', {
    target_type: targetType,
    target_id: targetId,
    ready_for_fulfillment: readyForFulfillment,
    code,
  });
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
