export type SupplierFulfillmentTargetType = 'topup_order' | 'data_request';

export type SupplierFulfillmentPlaceholderResponse = {
  ok: false;
  code: 'FULFILLMENT_NOT_ENABLED';
  message: string;
};

export function requestFulfillmentPlaceholder(): SupplierFulfillmentPlaceholderResponse {
  return {
    ok: false,
    code: 'FULFILLMENT_NOT_ENABLED',
    message: 'Supplier fulfillment is not enabled yet.',
  };
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
