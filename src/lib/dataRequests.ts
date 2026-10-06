import { getCurrentSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { TopUpCarrier } from '@/lib/types';

export type DataRequestPublicStatus = 'open' | 'paid' | 'completed' | 'expired' | 'cancelled';
export type DataRequestInternalStatus =
  | 'created'
  | 'payment_pending'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type DataRequestPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
export type DataRequestFulfillmentStatus =
  | 'not_started'
  | 'queued'
  | 'processing'
  | 'successful'
  | 'failed';

export type DataRequestRecord = {
  id: string;
  requesterUserId: string | null;
  requesterMode: string;
  recipientPhone: string;
  carrier: TopUpCarrier;
  productId: string | null;
  productType: 'airtime' | 'data';
  productName: string;
  bundleLabel: string | null;
  recipientBenefit: string;
  amountUsd: number;
  serviceFeeUsd: number;
  totalUsd: number;
  requestCode: string;
  publicStatus: DataRequestPublicStatus;
  internalStatus: DataRequestInternalStatus;
  paymentStatus: DataRequestPaymentStatus;
  fulfillmentStatus: DataRequestFulfillmentStatus;
  supporterUserId: string | null;
  supporterEmail: string | null;
  completedOrderId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type PublicDataRequestStatus =
  | 'found'
  | 'not_found'
  | 'expired'
  | 'cancelled'
  | 'completed'
  | 'unavailable';

export type PublicDataRequestLookup = {
  status: PublicDataRequestStatus;
  message: string;
  request: DataRequestRecord | null;
};

export type CreateDataRequestInput = {
  productId: string;
  recipientPhone: string;
};

type DataRequestRow = {
  id: string;
  requester_user_id?: string | null;
  requester_mode?: string;
  recipient_phone: string;
  carrier: TopUpCarrier;
  product_id?: string | null;
  product_type: 'airtime' | 'data';
  product_name: string;
  bundle_label: string | null;
  recipient_benefit?: string | null;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd: number | string;
  request_code: string;
  public_status: DataRequestPublicStatus;
  internal_status?: DataRequestInternalStatus;
  payment_status?: DataRequestPaymentStatus;
  fulfillment_status?: DataRequestFulfillmentStatus;
  supporter_user_id?: string | null;
  supporter_email?: string | null;
  completed_order_id?: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at?: string | null;
};

export async function createDataRequest(input: CreateDataRequestInput): Promise<DataRequestRecord> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.rpc('create_data_request', {
    p_product_id: input.productId,
    p_recipient_phone: input.recipientPhone,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The request could not be created.');
  }

  return mapDataRequestRow(row as DataRequestRow);
}

export async function fetchMyDataRequests(): Promise<DataRequestRecord[]> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return [];
  }

  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('data_requests')
    .select(
      'id, requester_user_id, requester_mode, product_id, recipient_phone, carrier, product_type, product_name, bundle_label, amount_usd, service_fee_usd, total_usd, request_code, public_status, internal_status, payment_status, fulfillment_status, supporter_user_id, supporter_email, completed_order_id, expires_at, created_at, updated_at'
    )
    .eq('requester_user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapDataRequestRow(row as DataRequestRow));
}

export async function fetchPublicDataRequestByCode(
  requestCode: string
): Promise<PublicDataRequestLookup> {
  const normalizedCode = requestCode.trim();
  if (!normalizedCode) {
    return {
      status: 'not_found',
      message: 'Request link not found.',
      request: null,
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      status: 'unavailable',
      message: 'Request review is unavailable right now.',
      request: null,
    };
  }

  const openRow = await fetchOpenDataRequestByCode(normalizedCode);
  if (openRow) {
    if (isExpired(openRow)) {
      return {
        status: 'expired',
        message: 'This request has expired.',
        request: openRow,
      };
    }

    return {
      status: 'found',
      message: 'Request loaded successfully.',
      request: openRow,
    };
  }

  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return {
      status: 'unavailable',
      message: 'This request is not available or has already been completed.',
      request: null,
    };
  }

  const { data, error } = await supabase
    .from('data_requests')
    .select(
      'id, requester_user_id, requester_mode, recipient_phone, carrier, product_type, product_name, bundle_label, amount_usd, service_fee_usd, total_usd, request_code, public_status, internal_status, payment_status, fulfillment_status, supporter_user_id, supporter_email, completed_order_id, expires_at, created_at, updated_at'
    )
    .eq('request_code', normalizedCode)
    .eq('requester_user_id', session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      status: 'not_found',
      message: 'Request link not found.',
      request: null,
    };
  }

  const row = mapDataRequestRow(data as DataRequestRow);
  if (row.publicStatus === 'expired' || isExpired(row)) {
    return {
      status: 'expired',
      message: 'This request has expired.',
      request: row,
    };
  }

  if (row.publicStatus === 'cancelled' || row.internalStatus === 'cancelled') {
    return {
      status: 'cancelled',
      message: 'This request has been cancelled.',
      request: row,
    };
  }

  if (row.publicStatus === 'completed' || row.internalStatus === 'completed') {
    return {
      status: 'completed',
      message: 'This request has already been completed.',
      request: row,
    };
  }

  return {
    status: 'unavailable',
    message: 'This request is not available right now.',
    request: row,
  };
}

function mapDataRequestRow(row: DataRequestRow): DataRequestRecord {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id ?? null,
    requesterMode: row.requester_mode ?? 'haiti_user',
    productId: row.product_id ?? null,
    recipientPhone: row.recipient_phone,
    carrier: row.carrier,
    productType: row.product_type,
    productName: row.product_name,
    bundleLabel: row.bundle_label,
    recipientBenefit: row.recipient_benefit ?? row.bundle_label ?? row.product_name,
    amountUsd: Number(row.amount_usd),
    serviceFeeUsd: Number(row.service_fee_usd),
    totalUsd: Number(row.total_usd),
    requestCode: row.request_code,
    publicStatus: row.public_status,
    internalStatus: row.internal_status ?? 'created',
    paymentStatus: row.payment_status ?? 'unpaid',
    fulfillmentStatus: row.fulfillment_status ?? 'not_started',
    supporterUserId: row.supporter_user_id ?? null,
    supporterEmail: row.supporter_email ?? null,
    completedOrderId: row.completed_order_id ?? null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

async function fetchOpenDataRequestByCode(requestCode: string) {
  const client = supabase;
  if (!client) {
    return null;
  }

  const { data, error } = await client.rpc('get_open_data_request', { p_request_code: requestCode });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapDataRequestRow({
    ...(row as DataRequestRow),
    requester_user_id: null,
    requester_mode: 'haiti_user',
    internal_status: 'created',
    payment_status: 'unpaid',
    fulfillment_status: 'not_started',
    supporter_user_id: null,
    supporter_email: null,
    completed_order_id: null,
    updated_at: null,
  });
}

function isExpired(row: DataRequestRecord) {
  if (!row.expiresAt) {
    return false;
  }

  const expiresAt = new Date(row.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() <= Date.now();
}
