import type { DataRequestPaymentStatus } from '@/lib/dataRequests';
import type { TopUpPaymentStatus } from '@/lib/topupOrders';

export type PaymentTargetType = 'topup_order' | 'data_request';
export type PaymentMethodType = 'card' | 'placeholder';

export function formatServiceTotal(value: number) {
  return `$${value.toFixed(2)}`;
}

export function getPaymentTargetLabel(targetType: PaymentTargetType) {
  return targetType === 'topup_order' ? 'Top-Up Order' : 'Data Request';
}

export function getPaymentStatusLabel(
  status: TopUpPaymentStatus | DataRequestPaymentStatus | 'pending_payment'
) {
  switch (status) {
    case 'pending_payment':
      return 'Pending payment';
    case 'pending':
      return 'Pending payment';
    case 'paid':
      return 'Paid';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Cancelled';
    case 'unpaid':
      return 'Unpaid';
    default:
      return 'Processing';
  }
}
