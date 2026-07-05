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
    return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED' }, corsHeaders);
  }

  const baseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, code: 'FULFILLMENT_NOT_CONFIGURED' }, corsHeaders);
  }

  const authorization = req.headers.get('authorization');
  if (!authorization?.trim()) {
    return jsonResponse(
      401,
      { ok: false, code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' },
      corsHeaders
    );
  }

  const body = (await req.json().catch(() => null)) as FulfillTopupRequest | null;
  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();

  if (!targetType || !targetId) {
    return jsonResponse(
      400,
      { ok: false, code: 'INVALID_REQUEST', message: 'target_type and target_id are required.' },
      corsHeaders
    );
  }

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order) {
      return jsonResponse(404, { ok: false, code: 'ORDER_NOT_FOUND' }, corsHeaders);
    }

    if (order.payment_status !== 'paid' || order.status !== 'processing') {
      return jsonResponse(
        409,
        {
          ok: false,
          code: 'FULFILLMENT_NOT_READY',
          message: 'Paid processing order required before fulfillment.',
        },
        corsHeaders
      );
    }

    const mapping = await fetchProductMapping(baseUrl, serviceRoleKey, order.carrier, order.product_type, order.product_name);
    if (!mapping || !mapping.external_product_id || !mapping.external_provider) {
      return jsonResponse(
        409,
        {
          ok: false,
          code: 'PRODUCT_NOT_MAPPED',
          message: 'Product not mapped.',
        },
        corsHeaders
      );
    }

    return placeholderResponse(corsHeaders);
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow) {
    return jsonResponse(404, { ok: false, code: 'REQUEST_NOT_FOUND' }, corsHeaders);
  }

  if (requestRow.payment_status !== 'paid' || requestRow.internal_status !== 'processing') {
    return jsonResponse(
      409,
      {
        ok: false,
        code: 'FULFILLMENT_NOT_READY',
        message: 'Paid processing request required before fulfillment.',
      },
      corsHeaders
    );
  }

  const mapping = await fetchProductMapping(
    baseUrl,
    serviceRoleKey,
    requestRow.carrier,
    requestRow.product_type,
    requestRow.product_name
  );
  if (!mapping || !mapping.external_product_id || !mapping.external_provider) {
    return jsonResponse(
      409,
      {
        ok: false,
        code: 'PRODUCT_NOT_MAPPED',
        message: 'Product not mapped.',
      },
      corsHeaders
    );
  }

  return placeholderResponse(corsHeaders);
});

function placeholderResponse(headers: Record<string, string>) {
  return jsonResponse(
    200,
    {
      ok: false,
      code: 'FULFILLMENT_NOT_ENABLED',
      message: 'Supplier fulfillment is not enabled yet.',
    },
    headers
  );
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
