import { getCurrentSession } from '@/lib/auth';
import { fetchMyProfile } from '@/lib/profile';
import { assertProfileCompleteForService } from '@/lib/profile';
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
  productType: 'data';
  productName: string;
  bundleLabel: string | null;
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
  recipientPhone: string;
  carrier: TopUpCarrier;
  productName: string;
  bundleLabel?: string | null;
  amountUsd: number;
  serviceFeeUsd: number;
};

type DataRequestRow = {
  id: string;
  requester_user_id: string | null;
  requester_mode: string;
  recipient_phone: string;
  carrier: TopUpCarrier;
  product_type: 'data';
  product_name: string;
  bundle_label: string | null;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd: number | string;
  request_code: string;
  public_status: DataRequestPublicStatus;
  internal_status: DataRequestInternalStatus;
  payment_status: DataRequestPaymentStatus;
  fulfillment_status: DataRequestFulfillmentStatus;
  supporter_user_id: string | null;
  supporter_email: string | null;
  completed_order_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function createDataRequest(input: CreateDataRequestInput): Promise<DataRequestRecord> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required before requesting data.');
  }

  await assertProfileCompleteForService();

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const profile = await fetchMyProfile();

  const { data, error } = await supabase
    .from('data_requests')
    .insert({
      requester_user_id: session.user.id,
      requester_mode: profile?.userMode ?? 'haiti_user',
      recipient_phone: input.recipientPhone,
      carrier: normalizeCarrier(input.carrier),
      product_type: 'data',
      product_name: input.productName,
      bundle_label: input.bundleLabel ?? null,
      amount_usd: input.amountUsd,
      service_fee_usd: input.serviceFeeUsd,
    })
    .select(
      'id, requester_user_id, requester_mode, recipient_phone, carrier, product_type, product_name, bundle_label, amount_usd, service_fee_usd, total_usd, request_code, public_status, internal_status, payment_status, fulfillment_status, supporter_user_id, supporter_email, completed_order_id, expires_at, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDataRequestRow(data as DataRequestRow);
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
      'id, requester_user_id, requester_mode, recipient_phone, carrier, product_type, product_name, bundle_label, amount_usd, service_fee_usd, total_usd, request_code, public_status, internal_status, payment_status, fulfillment_status, supporter_user_id, supporter_email, completed_order_id, expires_at, created_at, updated_at'
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
    requesterUserId: row.requester_user_id,
    requesterMode: row.requester_mode,
    recipientPhone: row.recipient_phone,
    carrier: row.carrier,
    productType: row.product_type,
    productName: row.product_name,
    bundleLabel: row.bundle_label,
    amountUsd: Number(row.amount_usd),
    serviceFeeUsd: Number(row.service_fee_usd),
    totalUsd: Number(row.total_usd),
    requestCode: row.request_code,
    publicStatus: row.public_status,
    internalStatus: row.internal_status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    supporterUserId: row.supporter_user_id,
    supporterEmail: row.supporter_email,
    completedOrderId: row.completed_order_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCarrier(carrier: TopUpCarrier): 'digicel' | 'natcom' {
  return carrier === 'Digicel' ? 'digicel' : 'natcom';
}

async function fetchOpenDataRequestByCode(requestCode: string) {
  const client = supabase;
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from('data_requests')
    .select(
      'id, requester_user_id, requester_mode, recipient_phone, carrier, product_type, product_name, bundle_label, amount_usd, service_fee_usd, total_usd, request_code, public_status, internal_status, payment_status, fulfillment_status, supporter_user_id, supporter_email, completed_order_id, expires_at, created_at, updated_at'
    )
    .eq('request_code', requestCode)
    .eq('public_status', 'open')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapDataRequestRow(data as DataRequestRow);
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
