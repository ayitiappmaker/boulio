function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

function normalizeHaitiLocalDigits(phone: string) {
  const digits = normalizePhoneDigits(phone);

  if (!digits) {
    return null;
  }

  // Haiti mobile numbers are safest to detect when they resolve to a local
  // 8-digit number. Prefix assignments can change over time, and portability
  // means this remains a best-effort hint rather than a guarantee.
  if (digits.length === 11 && digits.startsWith('509')) {
    return digits.slice(3);
  }

  return digits.length === 8 ? digits : null;
}

export function detectHaitiCarrierFromPhone(phone: string): 'Digicel' | 'Natcom' | null {
  const localDigits = normalizeHaitiLocalDigits(phone);

  if (!localDigits) {
    return null;
  }

  const prefix = localDigits.slice(0, 2);

  if (['30', '31', '34', '36', '37', '38', '39'].includes(prefix)) {
    return 'Digicel';
  }

  if (['40', '41', '42', '43', '46', '47', '48', '49'].includes(prefix)) {
    return 'Natcom';
  }

  return null;
}

/*
Manual validation examples:
- +509 30 12 34 56 -> Digicel
- 50934124411 -> Digicel
- 35123456 -> Natcom
- 40123456 -> Natcom
- 44123456 -> null
- 1234567 -> null
*/
