// Supabase Edge Function: stripe-webhook
//
// Test-mode Stripe webhook only.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - STRIPE_WEBHOOK_SECRET
//
// Stripe webhook events are the source of truth for payment completion once
// test checkout is enabled. This function verifies the webhook signature,
// applies idempotent status updates, and does not trigger fulfillment.

type StripeWebhookEvent =
  | 'checkout.session.completed'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'checkout.session.expired'
  | string;

type StripeEventPayload = {
  id?: string;
  type?: StripeWebhookEvent;
  livemode?: boolean;
  data?: {
    object?: StripeEventObject;
  };
};

type StripeEventObject = {
  id?: string;
  livemode?: boolean;
  payment_status?: string;
  status?: string;
  payment_intent?: string | { id?: string | null } | null;
  metadata?: Record<string, string | undefined>;
  request?: { id?: string | null } | null;
};

type PaymentTargetType = 'topup_order' | 'data_request';

type TopUpOrderRow = {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  supplier_status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

type DataRequestRow = {
  id: string;
  request_code: string;
  public_status: string;
  internal_status: string;
  payment_status: string;
  fulfillment_status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature',
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
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim();

  if (!baseUrl || !serviceRoleKey || !webhookSecret) {
    return jsonResponse(500, { ok: false, code: 'WEBHOOK_NOT_CONFIGURED' }, corsHeaders);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const verified = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!verified) {
    return jsonResponse(400, { ok: false, code: 'INVALID_SIGNATURE' }, corsHeaders);
  }

  const event = parseStripeEvent(rawBody);
  if (!event?.type || event.livemode) {
    return jsonResponse(400, { ok: false, code: 'LIVE_MODE_NOT_ALLOWED' }, corsHeaders);
  }

  const eventObject = event.data?.object ?? {};
  const metadata = normalizeMetadata(eventObject.metadata);
  const targetType = metadata.target_type as PaymentTargetType | undefined;
  const targetId = metadata.target_id?.trim() || eventObject.id?.trim();

  if (!targetType || !targetId) {
    return jsonResponse(200, { ok: true, code: 'IGNORED', message: 'Missing payment target metadata.' }, corsHeaders);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return await handleCheckoutSessionCompleted(baseUrl, serviceRoleKey, eventObject, metadata, targetType, targetId);
    case 'payment_intent.succeeded':
      return await handlePaymentIntentSucceeded(baseUrl, serviceRoleKey, eventObject, metadata, targetType, targetId);
    case 'payment_intent.payment_failed':
      return await handlePaymentFailed(baseUrl, serviceRoleKey, targetType, targetId, eventObject, metadata);
    case 'checkout.session.expired':
      return await handleCheckoutExpired(baseUrl, serviceRoleKey, targetType, targetId, eventObject, metadata);
    default:
      return jsonResponse(200, { ok: true, code: 'IGNORED', message: 'Event ignored.' }, corsHeaders);
  }
});

async function handleCheckoutSessionCompleted(
  baseUrl: string,
  serviceRoleKey: string,
  eventObject: StripeEventObject,
  metadata: Record<string, string>,
  targetType: PaymentTargetType,
  targetId: string
) {
  if (metadata.environment !== 'test' || eventObject.payment_status !== 'paid') {
    return jsonResponse(200, { ok: true, code: 'IGNORED', message: 'Checkout session is not eligible.' }, corsHeaders);
  }

  const sessionId = eventObject.id?.trim() ?? null;
  const paymentIntentId = normalizePaymentIntentId(eventObject.payment_intent);

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order) {
      return jsonResponse(200, { ok: true, code: 'IGNORED', message: 'Order not found.' }, corsHeaders);
    }

    if (isPaidOrProcessingTopUpOrder(order)) {
      return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
    }

    await updateTopUpOrder(baseUrl, serviceRoleKey, targetId, {
      payment_status: 'paid',
      status: 'processing',
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      payment_provider: 'stripe',
    });

    return jsonResponse(200, { ok: true, code: 'ORDER_UPDATED' }, corsHeaders);
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow) {
    return jsonResponse(200, { ok: true, code: 'IGNORED', message: 'Request not found.' }, corsHeaders);
  }

  if (isPaidOrProcessingDataRequest(requestRow)) {
    return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
  }

  await updateDataRequest(baseUrl, serviceRoleKey, requestRow.id, {
    payment_status: 'paid',
    public_status: 'paid',
    internal_status: 'processing',
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    payment_provider: 'stripe',
  });

  return jsonResponse(200, { ok: true, code: 'REQUEST_UPDATED' }, corsHeaders);
}

async function handlePaymentIntentSucceeded(
  baseUrl: string,
  serviceRoleKey: string,
  eventObject: StripeEventObject,
  metadata: Record<string, string>,
  targetType: PaymentTargetType,
  targetId: string
) {
  if (metadata.environment !== 'test') {
    return jsonResponse(200, { ok: true, code: 'IGNORED' }, corsHeaders);
  }

  const paymentIntentId = eventObject.id?.trim() ?? null;
  const sessionId = metadata.checkout_session_id?.trim() ?? null;

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order) {
      return jsonResponse(200, { ok: true, code: 'IGNORED' }, corsHeaders);
    }

    if (isPaidOrProcessingTopUpOrder(order)) {
      return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
    }

    await updateTopUpOrder(baseUrl, serviceRoleKey, targetId, {
      payment_status: 'paid',
      status: 'processing',
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: sessionId ?? order.stripe_checkout_session_id,
      stripe_payment_intent_id: paymentIntentId,
      payment_provider: 'stripe',
    });

    return jsonResponse(200, { ok: true, code: 'ORDER_UPDATED' }, corsHeaders);
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow) {
    return jsonResponse(200, { ok: true, code: 'IGNORED' }, corsHeaders);
  }

  if (isPaidOrProcessingDataRequest(requestRow)) {
    return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
  }

  await updateDataRequest(baseUrl, serviceRoleKey, requestRow.id, {
    payment_status: 'paid',
    public_status: 'paid',
    internal_status: 'processing',
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: sessionId ?? requestRow.stripe_checkout_session_id,
    stripe_payment_intent_id: paymentIntentId,
    payment_provider: 'stripe',
  });

  return jsonResponse(200, { ok: true, code: 'REQUEST_UPDATED' }, corsHeaders);
}

async function handlePaymentFailed(
  baseUrl: string,
  serviceRoleKey: string,
  targetType: PaymentTargetType,
  targetId: string,
  eventObject: StripeEventObject,
  metadata: Record<string, string>
) {
  if (metadata.environment !== 'test') {
    return jsonResponse(200, { ok: true, code: 'IGNORED' }, corsHeaders);
  }

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order || order.payment_status === 'paid') {
      return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
    }

    await updateTopUpOrder(baseUrl, serviceRoleKey, targetId, {
      payment_status: 'failed',
      status: 'failed',
      stripe_payment_intent_id: normalizePaymentIntentId(eventObject.payment_intent) ?? order.stripe_payment_intent_id,
      payment_provider: 'stripe',
    });

    return jsonResponse(200, { ok: true, code: 'ORDER_FAILED' }, corsHeaders);
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow || requestRow.payment_status === 'paid') {
    return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
  }

  await updateDataRequest(baseUrl, serviceRoleKey, requestRow.id, {
    payment_status: 'failed',
    internal_status: 'failed',
    stripe_payment_intent_id: normalizePaymentIntentId(eventObject.payment_intent) ?? requestRow.stripe_payment_intent_id,
    payment_provider: 'stripe',
  });

  return jsonResponse(200, { ok: true, code: 'REQUEST_FAILED' }, corsHeaders);
}

async function handleCheckoutExpired(
  baseUrl: string,
  serviceRoleKey: string,
  targetType: PaymentTargetType,
  targetId: string,
  eventObject: StripeEventObject,
  metadata: Record<string, string>
) {
  if (metadata.environment !== 'test') {
    return jsonResponse(200, { ok: true, code: 'IGNORED' }, corsHeaders);
  }

  if (targetType === 'topup_order') {
    const order = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
    if (!order || order.payment_status === 'paid') {
      return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
    }

    // Top-up orders do not have an expired status yet, so we keep them
    // pending/unpaid until the payment flow or schema changes later.
    return jsonResponse(200, { ok: true, code: 'ORDER_EXPIRED_IGNORED' }, corsHeaders);
  }

  const requestRow = await fetchDataRequestByIdOrCode(baseUrl, serviceRoleKey, targetId);
  if (!requestRow || requestRow.payment_status === 'paid') {
    return jsonResponse(200, { ok: true, code: 'ALREADY_PROCESSED' }, corsHeaders);
  }

  await updateDataRequest(baseUrl, serviceRoleKey, requestRow.id, {
    public_status: 'expired',
    internal_status: 'cancelled',
    payment_status: 'unpaid',
    fulfillment_status: 'not_started',
    stripe_checkout_session_id: normalizeCheckoutSessionId(eventObject) ?? requestRow.stripe_checkout_session_id,
    payment_provider: 'stripe',
  });

  return jsonResponse(200, { ok: true, code: 'REQUEST_EXPIRED' }, corsHeaders);
}

function parseStripeEvent(rawBody: string): StripeEventPayload | null {
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as StripeEventPayload;
  } catch {
    return null;
  }
}

async function verifyStripeSignature(
  rawBody: string,
  headerValue: string | null,
  webhookSecret: string
) {
  if (!headerValue) {
    return false;
  }

  const parts = Object.fromEntries(
    headerValue
      .split(',')
      .map((part) => part.trim().split('=', 2))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, value])
  ) as Record<string, string>;

  const timestamp = parts.t;
  const signatures = headerValue
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = await computeHmacHex(payload, webhookSecret);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

async function computeHmacHex(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function fetchTopUpOrderById(baseUrl: string, serviceRoleKey: string, orderId: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}&select=id,user_id,status,payment_status,supplier_status,stripe_checkout_session_id,stripe_payment_intent_id&limit=1`,
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
    `${baseUrl}/rest/v1/data_requests?${filter}&select=id,request_code,public_status,internal_status,payment_status,fulfillment_status,stripe_checkout_session_id,stripe_payment_intent_id&limit=1`,
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

async function updateTopUpOrder(
  baseUrl: string,
  serviceRoleKey: string,
  orderId: string,
  patch: Record<string, string | null>
) {
  await fetch(`${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: buildServiceHeaders(serviceRoleKey),
    body: JSON.stringify(patch),
  });
}

async function updateDataRequest(
  baseUrl: string,
  serviceRoleKey: string,
  requestId: string,
  patch: Record<string, string | null>
) {
  await fetch(`${baseUrl}/rest/v1/data_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: buildServiceHeaders(serviceRoleKey),
    body: JSON.stringify(patch),
  });
}

function normalizeMetadata(metadata?: Record<string, string | undefined> | null) {
  const next: Record<string, string> = {};
  Object.entries(metadata ?? {}).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    }
  });

  return next;
}

function normalizePaymentIntentId(paymentIntent: string | { id?: string | null } | null | undefined) {
  if (!paymentIntent) {
    return null;
  }

  if (typeof paymentIntent === 'string') {
    return paymentIntent.trim() || null;
  }

  return paymentIntent.id?.trim() || null;
}

function normalizeCheckoutSessionId(eventObject: StripeEventObject) {
  return eventObject.id?.trim() || null;
}

function isPaidOrProcessingTopUpOrder(order: TopUpOrderRow) {
  return order.payment_status === 'paid' || order.status === 'processing' || order.status === 'completed';
}

function isPaidOrProcessingDataRequest(row: DataRequestRow) {
  return (
    row.payment_status === 'paid' ||
    row.public_status === 'paid' ||
    row.internal_status === 'processing' ||
    row.internal_status === 'completed'
  );
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
