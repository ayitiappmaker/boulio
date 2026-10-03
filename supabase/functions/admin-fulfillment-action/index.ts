// Supabase Edge Function: admin-fulfillment-action
//
// Internal admin-only wrapper for top-up fulfillment operations.
// Required environment variables:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - FULFILLMENT_ADMIN_SECRET
// - FULFILLMENT_ADMIN_EMAILS
// - FULFILLMENT_ADMIN_USER_IDS
//
// This function verifies the signed-in Supabase user, checks their email
// against the admin allowlist, and then either:
// - lists recent top-up orders for the admin screen,
// - lists recent fulfillment audit rows, or
// - forwards a manual fulfillment action to fulfill-topup with the server-side
//   admin secret attached and records a server-side audit row.
//
// The browser never receives DT One credentials or the fulfillment secret.

type AdminAction = 'list' | 'list_logs' | 'dry_run' | 'live_manual' | 'check_status';

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

type FulfillmentActionLogRow = {
  id: string;
  created_at: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  order_status_before: string | null;
  supplier_status_before: string | null;
  order_status_after: string | null;
  supplier_status_after: string | null;
  ok: boolean | null;
  response_code: string | null;
  response_message: string | null;
  supplier_reference: string | null;
  dtone_transaction_id: string | null;
  safe_response: Record<string, unknown> | null;
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
  try {
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
    const adminUserIds = parseAdminUserIds(Deno.env.get('FULFILLMENT_ADMIN_USER_IDS'));

    if (!baseUrl || !serviceRoleKey || !fulfillmentAdminSecret || (adminEmails.length === 0 && adminUserIds.length === 0)) {
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
      return jsonResponse(401, ADMIN_ACCESS_DENIED, corsHeaders);
    }

    console.error('ADMIN_STAGE_AUTH_USER');
    const adminUser = await fetchVerifiedAdminUser(baseUrl, serviceRoleKey, accessToken);
    if (!adminUser) {
      return jsonResponse(401, ADMIN_ACCESS_DENIED, corsHeaders);
    }

    if (!isAdminAllowed(adminUser, adminEmails, adminUserIds)) {
      return jsonResponse(403, ADMIN_ACCESS_DENIED, corsHeaders);
    }

    console.error('ADMIN_STAGE_PARSE_BODY');
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

    if (action === 'list_logs') {
      const logs = await fetchRecentFulfillmentLogs(baseUrl, serviceRoleKey);
      return jsonResponse(
        200,
        {
          ok: true,
          action: 'list_logs',
          message: 'Recent fulfillment audit rows loaded.',
          logs,
        },
        corsHeaders,
      );
    }

    if (!isManualFulfillmentAction(action)) {
      return jsonResponse(
        400,
        {
          ok: false,
          code: 'INVALID_REQUEST',
          message: 'Action must be dry_run, live_manual, or check_status.',
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

    const forwardPayload = {
      target_type: 'topup_order' as const,
      target_id: body.target_id,
      mode: action,
    };

    const targetId = body.target_id;
    const orderBefore = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);

    console.error('ADMIN_STAGE_FORWARD');
    try {
      const forwardedResponse = await fetch(`${baseUrl}/functions/v1/fulfill-topup`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-fulfillment-admin-secret': fulfillmentAdminSecret,
        },
        body: JSON.stringify(forwardPayload),
      });

      console.error('ADMIN_STAGE_PARSE_FORWARD');
      const rawText = await forwardedResponse.text();
      const forwardedBody = parseJsonRecord(rawText);
      if (!forwardedBody) {
        await insertFulfillmentActionLog(baseUrl, serviceRoleKey, {
          adminUserId: adminUser.id,
          adminEmail: adminUser.email,
          action,
          targetType: 'topup_order',
          targetId,
          orderBefore,
          orderAfter: orderBefore,
          response: {
            ok: false,
            code: 'ADMIN_FORWARD_INVALID_RESPONSE',
            message: 'Fulfillment service returned an invalid response.',
          },
        });

        return jsonResponse(
          502,
          {
            ok: false,
            code: 'ADMIN_FORWARD_INVALID_RESPONSE',
            message: 'Fulfillment service returned an invalid response.',
          },
          corsHeaders,
        );
      }

      const orderAfter = await fetchTopUpOrderById(baseUrl, serviceRoleKey, targetId);
      await insertFulfillmentActionLog(baseUrl, serviceRoleKey, {
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        action,
        targetType: 'topup_order',
        targetId,
        orderBefore,
        orderAfter,
        response: forwardedBody,
      });

      return jsonResponse(forwardedResponse.status, forwardedBody, corsHeaders);
    } catch (error) {
      const failureResponse = {
        ok: false,
        code: 'ADMIN_FORWARD_REQUEST_FAILED',
        message: 'Fulfillment service request failed.',
        error_message: truncateSafe(getSafeErrorMessage(error), 240),
      };

      await insertFulfillmentActionLog(baseUrl, serviceRoleKey, {
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        action,
        targetType: 'topup_order',
        targetId,
        orderBefore,
        orderAfter: orderBefore,
        response: failureResponse,
      });

      console.error('ADMIN_STAGE_FORWARD');
      return jsonResponse(502, failureResponse, corsHeaders);
    }
  } catch (error) {
    console.error('ADMIN_STAGE_FORWARD');
    return jsonResponse(
      500,
      {
        ok: false,
        code: 'ADMIN_INTERNAL_ERROR',
        message: 'Admin fulfillment action failed.',
        error_message: truncateSafe(getSafeErrorMessage(error), 240),
      },
      corsHeaders,
    );
  }
});

// Verifies the bearer token server-side against Supabase Auth (does not
// trust any client- or self-decoded JWT payload). Returns the verified user
// only when Supabase confirms the token is a currently valid session.
async function fetchVerifiedAdminUser(
  baseUrl: string,
  serviceRoleKey: string,
  accessToken: string,
): Promise<SupabaseUser | null> {
  try {
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
    if (!data || typeof data.id !== 'string' || !data.id.trim()) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function isAdminAllowed(adminUser: SupabaseUser, allowedEmails: string[], allowedUserIds: string[]) {
  const email = normalizeText(adminUser.email);
  if (email && isAdminEmail(email, allowedEmails)) {
    return true;
  }

  if (allowedUserIds.includes(adminUser.id)) {
    return true;
  }

  return false;
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

async function fetchTopUpOrderById(baseUrl: string, serviceRoleKey: string, orderId: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/topup_orders?id=eq.${encodeURIComponent(orderId)}&select=id,created_at,carrier,product_name,recipient_phone,total_usd,payment_status,status,supplier_status,supplier_reference,product_id&limit=1`,
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

async function fetchRecentFulfillmentLogs(baseUrl: string, serviceRoleKey: string) {
  const response = await fetch(
    `${baseUrl}/rest/v1/fulfillment_action_logs?select=id,created_at,admin_user_id,admin_email,action,target_type,target_id,order_status_before,supplier_status_before,order_status_after,supplier_status_after,ok,response_code,response_message,supplier_reference,dtone_transaction_id,safe_response&order=created_at.desc&limit=20`,
    {
      headers: buildServiceHeaders(serviceRoleKey),
    },
  );

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json().catch(() => [])) as FulfillmentActionLogRow[];
  return rows.map(mapFulfillmentActionLogRow);
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

function mapFulfillmentActionLogRow(row: FulfillmentActionLogRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    adminUserId: row.admin_user_id,
    adminEmail: row.admin_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    orderStatusBefore: row.order_status_before,
    supplierStatusBefore: row.supplier_status_before,
    orderStatusAfter: row.order_status_after,
    supplierStatusAfter: row.supplier_status_after,
    ok: row.ok,
    responseCode: row.response_code,
    responseMessage: row.response_message,
    supplierReference: row.supplier_reference,
    dtoneTransactionId: row.dtone_transaction_id,
    safeResponse: row.safe_response,
  };
}

function isManualFulfillmentAction(action: AdminAction): action is 'dry_run' | 'live_manual' | 'check_status' {
  return action === 'dry_run' || action === 'live_manual' || action === 'check_status';
}

async function insertFulfillmentActionLog(
  baseUrl: string,
  serviceRoleKey: string,
  input: {
    adminUserId: string;
    adminEmail: string | null | undefined;
    action: string;
    targetType: string;
    targetId: string;
    orderBefore: TopUpOrderRow | null;
    orderAfter: TopUpOrderRow | null;
    response: Record<string, unknown>;
  },
) {
  const safeResponse = sanitizeForAudit(input.response);
  const responseCode = extractText(input.response, ['code']);
  const responseMessage = extractText(input.response, ['message']);
  const ok = typeof input.response.ok === 'boolean' ? input.response.ok : null;
  const dtoneTransactionId = extractText(input.response, [
    'dtone_transaction_id',
    'dtone_response.reference',
    'dtone_status.reference',
  ]);

  const payload = {
    admin_user_id: input.adminUserId,
    admin_email: normalizeText(input.adminEmail) ?? null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    order_status_before: input.orderBefore?.status ?? null,
    supplier_status_before: input.orderBefore?.supplier_status ?? null,
    order_status_after: input.orderAfter?.status ?? null,
    supplier_status_after: input.orderAfter?.supplier_status ?? null,
    ok,
    response_code: responseCode,
    response_message: responseMessage,
    supplier_reference: input.orderAfter?.supplier_reference ?? input.orderBefore?.supplier_reference ?? null,
    dtone_transaction_id: dtoneTransactionId,
    safe_response: safeResponse,
  };

  try {
    const response = await fetch(`${baseUrl}/rest/v1/fulfillment_action_logs`, {
      method: 'POST',
      headers: {
        ...buildServiceHeaders(serviceRoleKey),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { ok: true as const };
    }
  } catch {
    // Non-fatal. The fulfillment response still returns to the admin client.
  }

  return {
    ok: false as const,
    warning: 'Audit log write failed.',
  };
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'Unknown error';
}

function truncateSafe(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, Math.max(0, maxLength));
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return truncateSafe(value, 500);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (depth >= 3) {
      return '[truncated]';
    }

    return value.slice(0, 10).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (!isPlainRecord(value)) {
    return null;
  }

  if (depth >= 3) {
    return '[truncated]';
  }

  const entries = Object.entries(value).slice(0, 40);
  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    if (isSensitiveKey(key)) {
      continue;
    }

    result[key] = sanitizeForAudit(entryValue, depth + 1);
  }

  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('authorization') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key')
  );
}

function extractText(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const path = key.split('.');
    const candidate = getNestedValue(value, path);
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;

  for (const key of path) {
    if (!isPlainRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return current;
}

function parseAdminEmails(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function parseAdminUserIds(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((userId) => userId.trim())
    .filter((userId) => isUuid(userId));
}

function isAdminEmail(email: string, allowedEmails: string[]) {
  return allowedEmails.includes(email.trim().toLowerCase());
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
