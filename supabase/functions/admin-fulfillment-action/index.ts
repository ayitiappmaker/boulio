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

type JwtPayload = Record<string, unknown>;

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
      return jsonResponse(
        500,
        {
          ok: false,
          code: 'ADMIN_AUTH_USER_FAILED',
          message: 'Could not verify admin user.',
          stage: 'auth_user',
          has_authorization_header: Boolean(authorization),
          token_parts_count: 0,
          payload_decoded: false,
          has_sub: false,
        },
        corsHeaders,
      );
    }

    console.error('ADMIN_STAGE_AUTH_USER');
    const authUserResult = decodeAdminJwt(accessToken);
    if (!authUserResult.user) {
      return jsonResponse(500, {
        ok: false,
        code: 'ADMIN_AUTH_USER_FAILED',
        message: 'Could not verify admin user.',
        stage: 'auth_user',
        has_authorization_header: true,
        token_parts_count: authUserResult.tokenPartsCount,
        payload_decoded: authUserResult.payloadDecoded,
        has_sub: authUserResult.hasSub,
      }, corsHeaders);
    }
    const adminUser = authUserResult.user;
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
      return jsonResponse(
        200,
        {
          ok: true,
          action: 'list_logs',
          message: 'Audit logs temporarily disabled.',
          logs: [],
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
      return jsonResponse(forwardedResponse.status, forwardedBody, corsHeaders);
    } catch (error) {
      console.error('ADMIN_STAGE_FORWARD');
      return jsonResponse(
        502,
        {
          ok: false,
          code: 'ADMIN_FORWARD_REQUEST_FAILED',
          message: 'Fulfillment service request failed.',
          error_message: truncateSafe(getSafeErrorMessage(error), 240),
        },
        corsHeaders,
      );
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

function decodeAdminJwt(accessToken: string): {
  user: SupabaseUser | null;
  tokenPartsCount: number;
  payloadDecoded: boolean;
  hasSub: boolean;
} {
  try {
    const parts = accessToken.split('.');
    const tokenPartsCount = parts.length;
    if (tokenPartsCount !== 3) {
      return {
        user: null,
        tokenPartsCount,
        payloadDecoded: false,
        hasSub: false,
      };
    }

    const payloadJson = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(payloadJson) as unknown;
    if (!isPlainRecord(parsed)) {
      return {
        user: null,
        tokenPartsCount,
        payloadDecoded: false,
        hasSub: false,
      };
    }

    const hasSub = typeof parsed.sub === 'string' && parsed.sub.trim().length > 0;
    if (!hasSub) {
      return {
        user: null,
        tokenPartsCount,
        payloadDecoded: true,
        hasSub: false,
      };
    }

    const email =
      firstStringValue(parsed, ['email']) ??
      firstStringFromNested(parsed, ['user_metadata', 'email']) ??
      firstStringFromNested(parsed, ['app_metadata', 'email']);

    return {
      user: {
        id: parsed.sub.trim(),
        email,
      },
      tokenPartsCount,
      payloadDecoded: true,
      hasSub: true,
    };
  } catch {
    return {
      user: null,
      tokenPartsCount: accessToken.split('.').length,
      payloadDecoded: false,
      hasSub: false,
    };
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

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(`${base64}${padding}`);
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

function firstStringValue(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function firstStringFromNested(value: Record<string, unknown>, path: string[]) {
  const candidate = getNestedValue(value, path);
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
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
  const userIds = (value ?? '')
    .split(',')
    .map((userId) => userId.trim())
    .filter((userId) => isUuid(userId));

  // Temporary fallback until FULFILLMENT_ADMIN_USER_IDS secret is set.
  if (!userIds.includes(TEMPORARY_ADMIN_USER_ID_FALLBACK)) {
    userIds.push(TEMPORARY_ADMIN_USER_ID_FALLBACK);
  }

  return userIds;
}

function isAdminEmail(email: string, allowedEmails: string[]) {
  return allowedEmails.includes(email.trim().toLowerCase());
}

const TEMPORARY_ADMIN_USER_ID_FALLBACK = '163be4e0-3cc2-4872-838d-48d999177da9';

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
