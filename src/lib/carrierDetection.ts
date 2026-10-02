type HaitiCarrier = 'Digicel' | 'Natcom';

const DIGICEL_PREFIXES = ['30', '31', '34', '36', '37', '38', '39'];
const NATCOM_PREFIXES = ['40', '41', '42', '43', '46', '47', '48', '49'];

export function normalizeHaitiPhoneForDisplay(phone: string) {
  const localDigits = normalizeHaitiLocalDigits(phone);
  if (!localDigits) {
    return null;
  }

  return `+509${localDigits}`;
}

export function normalizeHaitiPhoneForFulfillment(phone: string) {
  const localDigits = normalizeHaitiLocalDigits(phone);
  if (!localDigits) {
    return null;
  }

  return `509${localDigits}`;
}

export function isValidHaitiMobilePhone(phone: string) {
  return normalizeHaitiLocalDigits(phone) !== null;
}

export function detectHaitiCarrierFromPhone(phone: string): HaitiCarrier | null {
  const localDigits = normalizeHaitiLocalDigits(phone);
  if (!localDigits) {
    return null;
  }

  const prefix = localDigits.slice(0, 2);

  if (DIGICEL_PREFIXES.includes(prefix)) {
    return 'Digicel';
  }

  if (NATCOM_PREFIXES.includes(prefix)) {
    return 'Natcom';
  }

  return null;
}

function normalizeHaitiLocalDigits(phone: string) {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 8) {
    return digits;
  }

  if (digits.length === 11 && digits.startsWith('509')) {
    return digits.slice(3);
  }

  if (phone.trim().startsWith('+509')) {
    const plusPrefixedDigits = phone.replace(/[^\d]/g, '');
    if (plusPrefixedDigits.length === 11 && plusPrefixedDigits.startsWith('509')) {
      return plusPrefixedDigits.slice(3);
    }
  }

  return null;
}

/*
Manual validation examples:
- +50940123456 -> Natcom
- 40123456 -> Natcom
- 50937123456 -> Digicel
- 37123456 -> Digicel
- 1234567 -> invalid
- 6522532526562 -> invalid
*/
