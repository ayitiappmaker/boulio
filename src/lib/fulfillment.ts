import { t } from '@/lib/i18n';
import type { DataRequestRecord } from '@/lib/dataRequests';
import type { TopUpOrderRecord } from '@/lib/topupOrders';

export type FulfillmentTargetType = 'topup_order' | 'data_request';

export type FulfillmentSummary = {
  label: string;
  detail: string;
  ready: boolean;
};

type TopUpFulfillmentTarget = Pick<
  TopUpOrderRecord,
  'status' | 'paymentStatus' | 'supplierStatus'
> & {
  targetType: 'topup_order';
};

type DataRequestFulfillmentTarget = Pick<
  DataRequestRecord,
  'publicStatus' | 'internalStatus' | 'paymentStatus' | 'fulfillmentStatus'
> & {
  targetType: 'data_request';
};

export type FulfillmentTarget = TopUpFulfillmentTarget | DataRequestFulfillmentTarget;

export function isReadyForFulfillment(target: FulfillmentTarget): boolean {
  if (target.targetType === 'topup_order') {
    return (
      target.paymentStatus === 'paid' &&
      target.status !== 'completed' &&
      target.status !== 'cancelled' &&
      target.supplierStatus !== 'successful' &&
      target.supplierStatus !== 'failed'
    );
  }

  return (
    target.paymentStatus === 'paid' &&
    target.fulfillmentStatus !== 'successful' &&
    target.fulfillmentStatus !== 'failed' &&
    target.internalStatus !== 'completed' &&
    target.internalStatus !== 'cancelled'
  );
}

export function getFulfillmentStatusLabel(target: FulfillmentTarget): string {
  return getFulfillmentSummary(target).label;
}

export function getFulfillmentSummary(target: FulfillmentTarget): FulfillmentSummary {
  if (target.targetType === 'topup_order') {
    return summarizeTopUpFulfillment(target);
  }

  return summarizeDataRequestFulfillment(target);
}

function summarizeTopUpFulfillment(target: TopUpFulfillmentTarget): FulfillmentSummary {
  if (target.status === 'completed' || target.supplierStatus === 'successful') {
    return {
      label: t('completed'),
      detail: t('supplierSent'),
      ready: false,
    };
  }

  if (target.status === 'failed' || target.supplierStatus === 'failed') {
    return {
      label: t('needsReview'),
      detail: t('supplierFailed'),
      ready: false,
    };
  }

  if (target.paymentStatus !== 'paid') {
    return {
      label: t('unpaidCheckoutNotCompleted'),
      detail: t('fulfillmentPending'),
      ready: false,
    };
  }

  if (target.status === 'processing' || target.supplierStatus === 'pending') {
    return {
      label: t('paidProcessing'),
      detail: t('supplierPending'),
      ready: true,
    };
  }

  return {
    label: t('paidWaitingForFulfillment'),
    detail: t('readyForFulfillment'),
    ready: true,
  };
}

function summarizeDataRequestFulfillment(target: DataRequestFulfillmentTarget): FulfillmentSummary {
  if (target.publicStatus === 'completed' || target.internalStatus === 'completed' || target.fulfillmentStatus === 'successful') {
    return {
      label: t('completed'),
      detail: t('fulfillmentSent'),
      ready: false,
    };
  }

  if (
    target.publicStatus === 'cancelled' ||
    target.publicStatus === 'expired' ||
    target.internalStatus === 'cancelled' ||
    target.internalStatus === 'failed' ||
    target.fulfillmentStatus === 'failed'
  ) {
    return {
      label: t('needsReview'),
      detail: t('fulfillmentFailed'),
      ready: false,
    };
  }

  if (target.paymentStatus !== 'paid') {
    return {
      label: t('waitingForSupporter'),
      detail: t('fulfillmentPending'),
      ready: false,
    };
  }

  if (target.internalStatus === 'processing' || target.fulfillmentStatus === 'processing' || target.publicStatus === 'paid') {
    return {
      label: t('paidProcessing'),
      detail: t('fulfillmentPending'),
      ready: true,
    };
  }

  return {
    label: t('paidWaitingForFulfillment'),
    detail: t('readyForFulfillment'),
    ready: true,
  };
}
