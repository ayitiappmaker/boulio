import { getCurrentSession } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

export type SupplierFulfillmentTargetType = 'topup_order' | 'data_request';

export type SupplierFulfillmentPlaceholderResponse = {
  ok: false;
  code: 'FULFILLMENT_NOT_ENABLED';
  message: string;
};

export type SupplierFulfillmentDryRunSuccessResponse = {
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

export type SupplierFulfillmentDryRunErrorResponse = {
  ok: false;
  dry_run: true;
  ready_for_fulfillment: false;
  code: string;
  message: string;
  target_type: 'topup_order';
  target_id: string;
};

export type SupplierFulfillmentDryRunResponse =
  | SupplierFulfillmentDryRunSuccessResponse
  | SupplierFulfillmentDryRunErrorResponse;

const FULFILLMENT_ENDPOINT_PATH = '/functions/v1/fulfill-topup';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export function requestFulfillmentPlaceholder(): SupplierFulfillmentPlaceholderResponse {
  return {
    ok: false,
    code: 'FULFILLMENT_NOT_ENABLED',
    message: 'Supplier fulfillment is not enabled yet.',
  };
}

export async function requestFulfillmentDryRun(
  targetId: string
): Promise<SupplierFulfillmentDryRunResponse> {
  const placeholder = buildDryRunPlaceholder(targetId);

  if (!isSupabaseConfigured) {
    return placeholder;
  }

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) {
    return placeholder;
  }

  try {
    const session = await getCurrentSession();
    const response = await fetch(`${baseUrl}${FULFILLMENT_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: buildRequestHeaders(session?.access_token ?? null),
      body: JSON.stringify({
        target_type: 'topup_order',
        target_id: targetId,
        mode: 'dry_run',
      }),
    });

    const payload = (await response.json().catch(() => null)) as SupplierFulfillmentDryRunResponse | null;

    if (!payload) {
      return placeholder;
    }

    return payload;
  } catch {
    return placeholder;
  }
}

function buildDryRunPlaceholder(targetId: string): SupplierFulfillmentDryRunErrorResponse {
  return {
    ok: false,
    dry_run: true,
    ready_for_fulfillment: false,
    code: 'FULFILLMENT_NOT_ENABLED',
    message: 'Supplier fulfillment dry run is not enabled yet.',
    target_type: 'topup_order',
    target_id: targetId,
  };
}

function buildRequestHeaders(accessToken: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export function getSupplierFulfillmentStatusLabel(params: {
  targetType: SupplierFulfillmentTargetType;
  mapped: boolean;
  ready: boolean;
}) {
  if (!params.mapped) {
    return 'Needs product mapping';
  }

  if (!params.ready) {
    return 'Cannot fulfill automatically';
  }

  return 'Ready for supplier fulfillment';
}
