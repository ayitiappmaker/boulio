// Supabase Edge Function: admin-fulfillment-action
//
// Internal admin-only wrapper for top-up fulfillment operations.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - FULFILLMENT_ADMIN_SECRET
// - FULFILLMENT_ADMIN_EMAILS
//
// This function verifies the signed-in Supabase user, checks their email
// against the admin allowlist, and then either:
// - lists recent top-up orders for the admin screen, or
// - forwards a manual fulfillment action to fulfill-topup with the server-side
//   admin secret attached.
//
// The browser never receives DT One credentials or the fulfillment secret.

type AdminAction = 'list' | 'dry_run' | 'live_manual' | 'check_status';

type AdminFulfillmentRequest = {
  action?: AdminAction;
  target_type?: 'topup_order';
  target_id?: string;
};

type SupabaseUser = {
  id: string;
  email?: string | null;
};

type TopUpOrderRow = {
  id: string;
  created_at: string;
  carrier: string;
  product_name: string;
  recipient_phone: string;
  total_usd: number | string;
  payment_status: string;
  status: string;
  supplier_status: string | null;
  supplier_reference: string | null;
  product_id: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const ADMIN_ACCESS_DENIED = {
  ok: false,
  code: 'ADMIN_ACCESS_DENIED',
  message: 'You do not have access to this page.',
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true }, corsHeaders);
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, ADMIN_ACCESS_DENIED, corsHeaders);
  }

  const baseUrl = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const fulfillmentAdminSecret = Deno.env.get('FULFILLMENT_ADMIN_SECRET')?.trim();
  const adminEmails = parseAdminEmails(Deno.env.get('FULFILLMENT_ADMIN_EMAILS'));

  if (!baseUrl || !serviceRoleKey || !fulfillmentAdminSecret || adminEmails.length === 0) {
    return jsonResponse(
      500,
      {
        ok: false,
        code: 'ADMIN_FULFILLMENT_NOT_CONFIGURED',
        message: 'Admin fulfillment is not configured.',
      },
      corsHeaders,
    );
  }

  const authorization = req.headers.get('authorization');
  const accessToken = getBearerToken(authorization);
  if (!accessToken) {
    return jsonResponse(403, ADMIN_ACCESS_DENIED, corsHeaders);
  }

  const adminUser = await fetchAuthenticatedUser(baseUrl, serviceRoleKey, accessToken);
  if (!adminUser?.email || !isAdminEmail(adminUser.email, adminEmails)) {
    return jsonResponse(403, ADMIN_ACCESS_DENIED, corsHeaders);
  }

  const body = (await req.json().catch(() => null)) as AdminFulfillmentRequest | null;
  const action = body?.action;

  if (!action) {
    return jsonResponse(
      400,
      {
        ok: false,
        code: 'INVALID_REQUEST',
        message: 'Action is required.',
      },
      corsHeaders,
    );
  }

  if (action === 'list') {
    const orders = await fetchRecentTopUpOrders(baseUrl, serviceRoleKey);
    return jsonResponse(
      200,
      {
        ok: true,
        action: 'list',
        message: 'Recent top-up orders loaded.',
        orders,
      },
      corsHeaders,
    );
  }

  if (body?.target_type !== 'topup_order' || !body?.target_id?.trim()) {
    return jsonResponse(
      400,
      {
        ok: false,
        code: 'INVALID_REQUEST',
        message: 'target_type must be topup_order and target_id is required.',
      },
      corsHeaders,
    );
  }

  const forwardedResponse = await fetch(`${baseUrl}/functions/v1/fulfill-topup`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-fulfillment-admin-secret': fulfillmentAdminSecret,
    },
    body: JSON.stringify(body),
  });

  const forwardedBody = await forwardedResponse.json().catch(() => null);
  if (!forwardedBody) {
    return jsonResponse(
      502,
      {
        ok: false,
        code: 'ADMIN_FORWARD_FAILED',
        message: 'Fulfillment service returned an invalid response.',
      },
      corsHeaders,
    );
  }

  return jsonResponse(forwardedResponse.status, forwardedBody, corsHeaders);
});

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

async function fetchRecentTopUpOrders(baseUrl: string, serviceRoleKey: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?select=id,created_at,carrier,product_name,recipient_phone,total_usd,payment_status,status,supplier_status,supplier_reference,product_id&order=created_at.desc&limit=50`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    },
  );

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json().catch(() => [])) as TopUpOrderRow[];
  return rows.map(mapTopUpOrderRow);
}

function mapTopUpOrderRow(row: TopUpOrderRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    carrier: row.carrier,
    productName: row.product_name,
    recipientPhone: row.recipient_phone,
    totalUsd: Number(row.total_usd),
    paymentStatus: row.payment_status,
    status: row.status,
    supplierStatus: row.supplier_status,
    supplierReference: row.supplier_reference,
    productId: row.product_id,
  };
}

function parseAdminEmails(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string, allowedEmails: string[]) {
  return allowedEmails.includes(email.trim().toLowerCase());
}

function getBearerToken(headerValue: string | null) {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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
