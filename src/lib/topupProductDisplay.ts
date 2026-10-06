import type { TopUpProduct } from '@/lib/types';
import { t } from '@/lib/i18n';

type MetadataRecord = Record<string, unknown>;

const RECIPIENT_AMOUNT_KEYS = [
  'recipient_receives',
  'recipient_receives_label',
  'recipient_receive_label',
  'recipient_credit',
  'recipient_credit_amount',
  'benefit_amount',
  'benefit_label',
  'destination_amount',
  'destination_credit_amount',
  'destination_credit_label',
  'airtime_amount',
  'credit_amount',
  'credit_label',
] as const;

const RECIPIENT_UNIT_KEYS = [
  'recipient_unit',
  'recipient_currency',
  'destination_unit',
  'destination_currency',
  'credit_unit',
  'currency',
  'unit',
] as const;

export function getRecipientReceivesLabel(product: TopUpProduct): string {
  const metadata = normalizeRecord(product.externalProductMetadata);

  if (product.productType === 'data') {
    const bundleLabel = product.bundleLabel?.trim();
    if (bundleLabel) {
      return bundleLabel;
    }

    const extra = buildBundleExtraSummary(metadata);
    if (extra) {
      return extra;
    }

    return t('shownAfterConfirmation');
  }

  const explicitLabel = getTextValue(metadata, ['recipient_receives', 'recipient_receives_label']);
  if (explicitLabel) {
    return normalizeRecipientLabel(explicitLabel);
  }

  const amount = getNumericValue(metadata, RECIPIENT_AMOUNT_KEYS);
  const unit = getTextValue(metadata, RECIPIENT_UNIT_KEYS);
  if (amount != null && unit) {
    return `${formatRecipientAmount(amount)} ${unit.toUpperCase()}`;
  }

  return t('airtime');
}

export function isRecipientBenefitShownAfterConfirmation(product: TopUpProduct): boolean {
  if (product.productType !== 'data') {
    return false;
  }

  return !product.bundleLabel?.trim() && !buildBundleExtraSummary(normalizeRecord(product.externalProductMetadata));
}

export function hasAuthoritativeAirtimeDestination(product: TopUpProduct): boolean {
  if (product.productType !== 'airtime') {
    return true;
  }

  const metadata = normalizeRecord(product.externalProductMetadata);
  const amount = getNumericValue(metadata, ['destination_amount']);
  const currency = getTextValue(metadata, ['destination_currency']);

  return amount != null && amount > 0 && currency?.toUpperCase() === 'HTG';
}

export function getProductPaymentBreakdownLabel(product: TopUpProduct): string {
  return `You pay: ${formatAmount(product.amountUsd)} + ${formatAmount(product.serviceFeeUsd)} fee`;
}

export function getProductTotalLabel(product: TopUpProduct): string {
  return `Total: ${formatAmount(product.totalUsd)}`;
}

export function getBundleExtraSummary(product: TopUpProduct): string | null {
  return buildBundleExtraSummary(normalizeRecord(product.externalProductMetadata));
}

function buildBundleExtraSummary(metadata: MetadataRecord | null): string | null {
  if (!metadata) {
    return null;
  }

  const parts: string[] = [];

  const dataBenefit = getTextValue(metadata, ['data_benefit', 'internet_benefit']);
  const minutesBenefit = getTextValue(metadata, ['minutes_benefit', 'calls_benefit', 'voice_benefit']);
  const whatsappBenefit = getTextValue(metadata, ['whatsapp_benefit']);
  const smsBenefit = getTextValue(metadata, ['sms_benefit']);

  if (dataBenefit) {
    parts.push(dataBenefit);
  }

  if (minutesBenefit) {
    parts.push(minutesBenefit);
  }

  if (whatsappBenefit) {
    parts.push(whatsappBenefit);
  }

  if (smsBenefit) {
    parts.push(smsBenefit);
  }

  const filteredParts = parts.filter((part) => part.trim().length > 0);
  if (!filteredParts.length) {
    return null;
  }

  return filteredParts.join(' • ');
}

function normalizeRecord(value: Record<string, unknown> | null | undefined): MetadataRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
}

function getTextValue(metadata: MetadataRecord | null, keys: readonly string[]): string | null {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumericValue(metadata: MetadataRecord | null, keys: readonly string[]): number | null {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function formatRecipientAmount(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function normalizeRecipientLabel(value: string) {
  return value
    .replace(/^\$(?=\d+(?:\.\d+)?\s+HTG\b)/i, '')
    .replace(/\s+credit$/i, '')
    .trim();
}
