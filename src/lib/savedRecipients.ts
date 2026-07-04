import { getCurrentSession } from '@/lib/auth';
import { savedRecipients as mockSavedRecipients } from '@/lib/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { SavedRecipient } from '@/lib/types';
import type { TopUpCarrier } from '@/lib/types';

export type SavedRecipientRecord = SavedRecipient & {
  userId: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type CreateSavedRecipientInput = {
  recipientName?: string | null;
  phoneNumber: string;
  carrier: TopUpCarrier;
};

export type CreateSavedRecipientResult = {
  recipient: SavedRecipientRecord;
  created: boolean;
};

type SavedRecipientRow = {
  id: string;
  user_id: string;
  recipient_name: string;
  phone_number: string;
  carrier: TopUpCarrier;
  created_at: string;
  updated_at: string | null;
};

const mockFallbackStore: SavedRecipientRecord[] = mockSavedRecipients.map((recipient, index) => ({
  id: `mock-recipient-${index + 1}`,
  userId: null,
  name: recipient.name,
  carrier: recipient.carrier,
  phoneNumber: recipient.phoneNumber,
  createdAt: `2026-07-${String(3 - index).padStart(2, '0')}`,
  updatedAt: null,
}));

export async function fetchSavedRecipients(): Promise<SavedRecipientRecord[]> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return [];
  }

  if (!isSupabaseConfigured || !supabase) {
    return [...mockFallbackStore];
  }

  try {
    const { data, error } = await supabase
      .from('saved_recipients')
      .select('id, user_id, recipient_name, phone_number, carrier, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapSavedRecipientRow(row as SavedRecipientRow));
  } catch {
    return [...mockFallbackStore];
  }
}

export async function createSavedRecipient(
  input: CreateSavedRecipientInput
): Promise<CreateSavedRecipientResult> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required before saving a recipient.');
  }

  const recipientName = normalizeRecipientName(input.recipientName, input.phoneNumber);
  const phoneNumber = input.phoneNumber.trim();
  const carrier = input.carrier;
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isSupabaseConfigured || !supabase) {
    const existingMockRecipient = mockFallbackStore.find(
      (recipient) =>
        recipient.carrier === carrier && normalizePhoneNumber(recipient.phoneNumber) === normalizedPhone
    );

    if (existingMockRecipient) {
      return { recipient: existingMockRecipient, created: false };
    }

    const nextRecipient: SavedRecipientRecord = {
      id: `mock-recipient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: session.user.id,
      name: recipientName,
      carrier,
      phoneNumber,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    mockFallbackStore.unshift(nextRecipient);
    return { recipient: nextRecipient, created: true };
  }

  try {
    const existingRecipients = await fetchSavedRecipients();
    const existingRecipient = existingRecipients.find(
      (recipient) =>
        recipient.carrier === carrier && normalizePhoneNumber(recipient.phoneNumber) === normalizedPhone
    );

    if (existingRecipient) {
      return { recipient: existingRecipient, created: false };
    }

    const { data, error } = await supabase
      .from('saved_recipients')
      .insert({
        user_id: session.user.id,
        recipient_name: recipientName,
        phone_number: phoneNumber,
        carrier,
      })
      .select('id, user_id, recipient_name, phone_number, carrier, created_at, updated_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { recipient: mapSavedRecipientRow(data as SavedRecipientRow), created: true };
  } catch {
    const fallbackRecipient = mockFallbackStore.find(
      (recipient) =>
        recipient.carrier === carrier && normalizePhoneNumber(recipient.phoneNumber) === normalizedPhone
    );

    if (fallbackRecipient) {
      return { recipient: fallbackRecipient, created: false };
    }

    const nextRecipient: SavedRecipientRecord = {
      id: `mock-recipient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: session.user.id,
      name: recipientName,
      carrier,
      phoneNumber,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    mockFallbackStore.unshift(nextRecipient);
    return { recipient: nextRecipient, created: true };
  }
}

export async function deleteSavedRecipient(recipientId: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required before deleting a recipient.');
  }

  if (!isSupabaseConfigured || !supabase) {
    removeFromFallbackStore(recipientId);
    return;
  }

  try {
    const { error } = await supabase.from('saved_recipients').delete().eq('id', recipientId);
    if (error) {
      throw new Error(error.message);
    }

    removeFromFallbackStore(recipientId);
  } catch {
    removeFromFallbackStore(recipientId);
  }
}

function mapSavedRecipientRow(row: SavedRecipientRow): SavedRecipientRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.recipient_name,
    carrier: row.carrier,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePhoneNumber(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeRecipientName(recipientName: string | null | undefined, phoneNumber: string) {
  const trimmedName = recipientName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const digits = normalizePhoneNumber(phoneNumber);
  return digits ? `Recipient ${digits.slice(-4)}` : 'Recipient';
}

function removeFromFallbackStore(recipientId: string) {
  const nextIndex = mockFallbackStore.findIndex((recipient) => recipient.id === recipientId);
  if (nextIndex >= 0) {
    mockFallbackStore.splice(nextIndex, 1);
  }
}
