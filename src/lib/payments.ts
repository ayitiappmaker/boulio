import { Linking, Platform } from 'react-native';

import { getCurrentSession } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PaymentMethodType, PaymentTargetType } from '@/lib/paymentFlow';

export type PaymentPreparationResult = {
  status: 'not_implemented' | 'checkout_created' | 'error';
  targetType: PaymentTargetType;
  targetId: string;
  paymentMethod: PaymentMethodType;
  message: string;
  code?: string;
  checkoutUrl?: string | null;
  sessionId?: string | null;
};

const PLACEHOLDER_MESSAGE = 'Online payment will be connected soon.';
const PAYMENT_ENDPOINT_PATH = '/functions/v1/create-payment';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export async function createPaymentForTopUpOrder(orderId: string): Promise<PaymentPreparationResult> {
  return requestPaymentPlaceholder('topup_order', orderId);
}

export async function createPaymentForDataRequest(
  requestIdOrCode: string
): Promise<PaymentPreparationResult> {
  return requestPaymentPlaceholder('data_request', requestIdOrCode);
}

async function requestPaymentPlaceholder(
  targetType: PaymentTargetType,
  targetId: string
): Promise<PaymentPreparationResult> {
  const placeholder = buildPlaceholderResult(targetType, targetId);

  if (!isSupabaseConfigured) {
    return placeholder;
  }

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) {
    return placeholder;
  }

  try {
    const session = await getCurrentSession();
    const response = await fetch(`${baseUrl}${PAYMENT_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: buildRequestHeaders(session?.access_token ?? null),
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; code?: string; message?: string; checkout_url?: string; session_id?: string }
      | null;

    if (!response.ok || !payload) {
      return placeholder;
    }

    if (payload.checkout_url) {
      return {
        status: 'checkout_created',
        targetType,
        targetId,
        paymentMethod: 'card',
        message: payload.message ?? PLACEHOLDER_MESSAGE,
        code: payload.code ?? 'CHECKOUT_SESSION_CREATED',
        checkoutUrl: payload.checkout_url,
        sessionId: payload.session_id ?? null,
      };
    }

    return {
      ...placeholder,
      status: 'not_implemented',
      code: payload.code ?? 'PAYMENT_NOT_ENABLED',
      message: payload.message ?? PLACEHOLDER_MESSAGE,
    };
  } catch {
    return placeholder;
  }
}

function buildPlaceholderResult(
  targetType: PaymentTargetType,
  targetId: string
): PaymentPreparationResult {
  return {
    status: 'not_implemented',
    targetType,
    targetId,
    paymentMethod: 'placeholder',
    message: PLACEHOLDER_MESSAGE,
    code: 'PAYMENT_NOT_ENABLED',
    checkoutUrl: null,
    sessionId: null,
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

export async function openCheckoutUrl(checkoutUrl: string) {
  if (!checkoutUrl) {
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(checkoutUrl);
    return;
  }

  await Linking.openURL(checkoutUrl);
}
