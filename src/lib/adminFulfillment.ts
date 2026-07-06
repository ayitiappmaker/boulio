import { getCurrentSession } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

const ADMIN_FULFILLMENT_FUNCTION_PATH = '/functions/v1/admin-fulfillment-action';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export type AdminFulfillmentAction = 'dry_run' | 'live_manual' | 'check_status';

export type AdminFulfillmentOrderRecord = {
  id: string;
  createdAt: string;
  carrier: string;
  productName: string;
  recipientPhone: string;
  totalUsd: number;
  paymentStatus: string;
  status: string;
  supplierStatus: string | null;
  supplierReference: string | null;
  productId: string | null;
};

export type AdminFulfillmentListResult =
  | {
      ok: true;
      action: 'list';
      message: string;
      orders: AdminFulfillmentOrderRecord[];
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type AdminFulfillmentActionResult =
  | Record<string, unknown>
  | {
      ok: false;
      code: string;
      message: string;
    };

export async function fetchAdminFulfillmentOrders(): Promise<AdminFulfillmentListResult> {
  return (await sendAdminFulfillmentRequest({ action: 'list' })) as AdminFulfillmentListResult;
}

export async function runAdminFulfillmentAction(
  action: AdminFulfillmentAction,
  targetId: string,
): Promise<AdminFulfillmentActionResult> {
  return (await sendAdminFulfillmentRequest({
    action,
    target_type: 'topup_order',
    target_id: targetId,
  })) as AdminFulfillmentActionResult;
}

async function sendAdminFulfillmentRequest(
  body: Record<string, unknown>,
): Promise<AdminFulfillmentListResult | AdminFulfillmentActionResult> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false as const,
      code: 'ADMIN_FULFILLMENT_NOT_CONFIGURED',
      message: 'Admin fulfillment is not configured.',
    };
  }

  const session = await getCurrentSession();
  if (!session?.access_token) {
    return {
      ok: false as const,
      code: 'ADMIN_ACCESS_DENIED',
      message: 'You do not have access to this page.',
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}${ADMIN_FULFILLMENT_FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return {
        ok: false as const,
        code: 'ADMIN_FULFILLMENT_INVALID_RESPONSE',
        message: 'Admin fulfillment returned an invalid response.',
      };
    }

    return payload;
  } catch {
    return {
      ok: false as const,
      code: 'ADMIN_FULFILLMENT_REQUEST_FAILED',
      message: 'Admin fulfillment request failed.',
    };
  }
}
