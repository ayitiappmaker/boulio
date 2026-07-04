// Supabase Edge Function: create-payment
//
// Test-mode Stripe Checkout only.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - STRIPE_SECRET_KEY
// - CHECKOUT_SUCCESS_URL
// - CHECKOUT_CANCEL_URL
//
// The function reads the stored order/request amount from Supabase and creates
// a Stripe Checkout Session in test mode. It never trusts client-submitted
// amounts and never marks anything paid.

type PaymentTargetType = 'topup_order' | 'data_request';

type CreatePaymentRequest = {
  target_type?: PaymentTargetType;
  target_id?: string;
};

type SupabaseUser = {
  id: string;
  email?: string | null;
};

type TopUpOrderRow = {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  total_usd: number | string;
  carrier: string;
  product_name: string;
  recipient_phone: string;
  recipient_name: string | null;
};

type DataRequestRow = {
  id: string;
  request_code: string;
  requester_user_id: string | null;
  public_status: string;
  internal_status: string;
  payment_status: string;
  fulfillment_status: string;
  total_usd: number | string;
  carrier: string;
  product_name: string;
  bundle_label: string | null;
  recipient_phone: string;
};

const PLACEHOLDER_RESPONSE = {
  ok: false,
  code: 'PAYMENT_NOT_ENABLED',
  message: 'Online payment will be connected soon.',
} as const;

const SUCCESS_FALLBACK_URL = 'http://localhost:8087/';
const CANCEL_FALLBACK_URL = 'http://localhost:8087/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true }, corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  const baseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
  const successUrl = Deno.env.get('CHECKOUT_SUCCESS_URL')?.trim() || SUCCESS_FALLBACK_URL;
  const cancelUrl = Deno.env.get('CHECKOUT_CANCEL_URL')?.trim() || CANCEL_FALLBACK_URL;

  if (!baseUrl || !serviceRoleKey || !stripeSecretKey || !stripeSecretKey.startsWith('sk_test_')) {
    return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  const body = (await req.json().catch(() => null)) as CreatePaymentRequest | null;
  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();

  if (!targetType || !targetId) {
    return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  const accessToken = getBearerToken(req.headers.get('authorization'));
  const authUser = accessToken ? await fetchAuthenticatedUser(baseUrl, serviceRoleKey, accessToken) : null;

  if (targetType === 'topup_order') {
    if (!authUser) {
      return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
    }

    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order || order.user_id !== authUser.id || !isEligibleTopUpOrder(order)) {
      return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
    }

    const totalUsd = parseMoney(order.total_usd);
    if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
      return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
    }

    const stripeSession = await createStripeCheckoutSession({
      stripeSecretKey,
      successUrl,
      cancelUrl,
      amountUsd: totalUsd,
      productName: order.product_name,
      targetType,
      targetId: order.id,
      metadata: {
        target_type: targetType,
        target_id: order.id,
        user_id: authUser.id,
        environment: 'test',
      },
      customerEmail: authUser.email ?? undefined,
    });

    if (!stripeSession) {
      return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
    }

    return jsonResponse(
      200,
      {
        ok: true,
        code: 'CHECKOUT_SESSION_CREATED',
        message: 'Test checkout session created.',
        checkout_url: stripeSession.url,
        session_id: stripeSession.id,
      },
      corsHeaders
    );
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow || !isEligibleDataRequest(requestRow)) {
    return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  const totalUsd = parseMoney(requestRow.total_usd);
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
    return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  const stripeSession = await createStripeCheckoutSession({
    stripeSecretKey,
    successUrl,
    cancelUrl,
    amountUsd: totalUsd,
    productName: requestRow.bundle_label ?? requestRow.product_name,
    targetType,
    targetId,
    metadata: {
      target_type: targetType,
      target_id: targetId,
      request_code: requestRow.request_code,
      environment: 'test',
    },
  });

  if (!stripeSession) {
    return jsonResponse(200, PLACEHOLDER_RESPONSE, corsHeaders);
  }

  return jsonResponse(
    200,
    {
      ok: true,
      code: 'CHECKOUT_SESSION_CREATED',
      message: 'Test checkout session created.',
      checkout_url: stripeSession.url,
      session_id: stripeSession.id,
    },
    corsHeaders
  );
});

function getBearerToken(headerValue: string | null) {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function fetchAuthenticatedUser(baseUrl: string, serviceRoleKey: string, accessToken: string) {
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as SupabaseUser | null;
  return data?.id ? data : null;
}

async function fetchTopUpOrderById(baseUrl: string, serviceRoleKey: string, orderId: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}&select=id,user_id,status,payment_status,total_usd,carrier,product_name,recipient_phone,recipient_name&limit=1`,
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
    `${baseUrl}/rest/v1/data_requests?${filter}&select=id,request_code,requester_user_id,public_status,internal_status,payment_status,fulfillment_status,total_usd,carrier,product_name,bundle_label,recipient_phone&limit=1`,
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

function isEligibleTopUpOrder(order: TopUpOrderRow) {
  return (
    (order.status === 'pending_payment' || order.status === 'draft') &&
    (order.payment_status === 'unpaid' || order.payment_status === 'pending')
  );
}

function isEligibleDataRequest(requestRow: DataRequestRow) {
  return (
    (requestRow.public_status === 'open' || requestRow.internal_status === 'payment_pending') &&
    requestRow.payment_status !== 'paid' &&
    requestRow.public_status !== 'expired' &&
    requestRow.public_status !== 'cancelled' &&
    requestRow.internal_status !== 'completed'
  );
}

async function createStripeCheckoutSession({
  stripeSecretKey,
  successUrl,
  cancelUrl,
  amountUsd,
  productName,
  targetType,
  targetId,
  metadata,
  customerEmail,
}: {
  stripeSecretKey: string;
  successUrl: string;
  cancelUrl: string;
  amountUsd: number;
  productName: string;
  targetType: PaymentTargetType;
  targetId: string;
  metadata: Record<string, string>;
  customerEmail?: string;
}) {
  const amountCents = Math.round(amountUsd * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', targetId);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(amountCents));
  params.set('line_items[0][price_data][product_data][name]', buildProductName(targetType, productName));

  if (customerEmail) {
    params.set('customer_email', customerEmail);
  }

  Object.entries(metadata).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    return null;
  }

  const session = (await response.json().catch(() => null)) as { id?: string; url?: string } | null;
  if (!session?.id || !session.url) {
    return null;
  }

  return session;
}

function buildProductName(targetType: PaymentTargetType, productName: string) {
  return targetType === 'topup_order' ? `Boulio top-up: ${productName}` : `Boulio data request: ${productName}`;
}

function parseMoney(value: number | string) {
  return typeof value === 'number' ? value : Number(value);
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
      'Content-Type': 'application/json',
    },
  });
}
