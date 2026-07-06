import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { topUpOrders as mockTopUpOrders } from '@/lib/mockData';
import { getCurrentSession } from '@/lib/auth';
import { assertProfileCompleteForService } from '@/lib/profile';
import type { TopUpCarrier } from '@/lib/types';

export type TopUpOrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type TopUpPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
export type TopUpSupplierStatus = 'not_sent' | 'pending' | 'successful' | 'failed';

export type TopUpOrderRecord = {
  id: string;
  productId: string | null;
  carrier: TopUpCarrier;
  productType: 'airtime' | 'data';
  productName: string;
  recipientPhone: string;
  recipientName: string | null;
  amountUsd: number;
  serviceFeeUsd: number;
  totalUsd: number;
  status: TopUpOrderStatus;
  paymentStatus: TopUpPaymentStatus;
  supplierStatus: TopUpSupplierStatus;
  supplierReference: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type CreatePendingTopUpOrderInput = {
  productId: string;
  carrier: TopUpCarrier;
  productType: 'airtime' | 'data';
  productName: string;
  recipientPhone: string;
  recipientName?: string | null;
  amountUsd: number;
  serviceFeeUsd: number;
};

type TopUpOrderRow = {
  id: string;
  product_id: string | null;
  carrier: TopUpCarrier;
  product_type: 'airtime' | 'data';
  product_name: string;
  recipient_phone: string;
  recipient_name: string | null;
  amount_usd: number | string;
  service_fee_usd: number | string;
  total_usd: number | string;
  status: TopUpOrderStatus;
  payment_status: TopUpPaymentStatus;
  supplier_status: TopUpSupplierStatus;
  supplier_reference: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function createPendingTopUpOrder(
  input: CreatePendingTopUpOrderInput
): Promise<TopUpOrderRecord> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required before placing a top-up order.');
  }

  await assertProfileCompleteForService();

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const totalUsd = Number((input.amountUsd + input.serviceFeeUsd).toFixed(2));

  const { data, error } = await supabase
    .from('topup_orders')
    .insert({
      user_id: session.user.id,
      product_id: input.productId,
      carrier: input.carrier,
      product_type: input.productType,
      product_name: input.productName,
      recipient_phone: input.recipientPhone,
      recipient_name: input.recipientName?.trim() || '',
      amount_usd: input.amountUsd,
      service_fee_usd: input.serviceFeeUsd,
      total_usd: totalUsd,
      status: 'pending_payment',
      payment_status: 'unpaid',
      supplier_status: 'not_sent',
    })
    .select(
      'id, product_id, carrier, product_type, product_name, recipient_phone, recipient_name, amount_usd, service_fee_usd, total_usd, status, payment_status, supplier_status, supplier_reference, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapTopUpOrderRow(data as TopUpOrderRow);
}

export async function fetchMyTopUpOrders(): Promise<TopUpOrderRecord[]> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required to view top-up orders.');
  }

  if (!isSupabaseConfigured || !supabase) {
    return mockTopUpOrders.map(mapMockTopUpOrder);
  }

  const { data, error } = await supabase
    .from('topup_orders')
    .select(
      'id, product_id, carrier, product_type, product_name, recipient_phone, recipient_name, amount_usd, service_fee_usd, total_usd, status, payment_status, supplier_status, supplier_reference, created_at, updated_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapTopUpOrderRow(row as TopUpOrderRow));
}

function mapTopUpOrderRow(row: TopUpOrderRow): TopUpOrderRecord {
  return {
    id: row.id,
    productId: row.product_id,
    carrier: row.carrier,
    productType: row.product_type,
    productName: row.product_name,
    recipientPhone: row.recipient_phone,
    recipientName: row.recipient_name,
    amountUsd: Number(row.amount_usd),
    serviceFeeUsd: Number(row.service_fee_usd),
    totalUsd: Number(row.total_usd),
    status: row.status,
    paymentStatus: row.payment_status,
    supplierStatus: row.supplier_status,
    supplierReference: row.supplier_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMockTopUpOrder(order: (typeof mockTopUpOrders)[number]): TopUpOrderRecord {
  return {
    id: order.id,
    productId: null,
    carrier: order.carrier,
    productType: order.productType,
    productName: order.productLabel,
    recipientPhone: order.phoneNumber,
    recipientName: null,
    amountUsd: order.price,
    serviceFeeUsd: order.serviceFee,
    totalUsd: order.total,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    supplierStatus: 'not_sent',
    supplierReference: null,
    createdAt: order.createdAt,
    updatedAt: null,
  };
}
