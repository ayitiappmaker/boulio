import type { TopUpProduct } from '@/lib/types';

export type DtoneProviderProductMapping = {
  externalProvider: string | null;
  externalProductId: string | null;
  externalProductMetadata: Record<string, unknown> | null;
};

export type DtoneMappingStatus = 'mapped' | 'not_mapped' | 'needs_mapping' | 'ready_for_supplier_fulfillment';

export type DtoneMappingSummary = DtoneProviderProductMapping & {
  status: DtoneMappingStatus;
  label: string;
};

type ProductWithMapping = TopUpProduct;

export function getDtoneMappingForProduct(product: ProductWithMapping): DtoneMappingSummary {
  const externalProvider = normalizeText(product.externalProvider);
  const externalProductId = normalizeText(product.externalProductId);
  const externalProductMetadata = normalizeRecord(product.externalProductMetadata);
  const mapped = Boolean(externalProvider && externalProductId);

  return {
    externalProvider,
    externalProductId,
    externalProductMetadata,
    status: mapped ? 'mapped' : 'not_mapped',
    label: mapped ? 'Ready for supplier fulfillment' : 'Product not mapped',
  };
}

export function isProductMappedForDtone(product: ProductWithMapping): boolean {
  return getDtoneMappingForProduct(product).status === 'mapped';
}

export function getProductMappingStatusLabel(product: ProductWithMapping): string {
  const mapping = getDtoneMappingForProduct(product);
  return mapping.label;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRecord(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
}
