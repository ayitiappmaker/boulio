import { getCurrentSession } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { UserMode } from '@/lib/types';

export const PROFILE_REQUIRED_ERROR = 'PROFILE_REQUIRED_FOR_SERVICE';

export type ProfileRecord = {
  userId: string;
  fullName: string;
  phoneNumber: string;
  country: string;
  userMode: UserMode | null;
  email: string;
  createdAt: string;
  updatedAt: string | null;
};

export type UpsertProfileInput = {
  fullName: string;
  phoneNumber: string;
  country: string;
  userMode: UserMode;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  phone_number: string | null;
  country: string | null;
  user_mode: UserMode | null;
  email: string;
  created_at: string;
  updated_at: string | null;
};

export async function fetchMyProfile(): Promise<ProfileRecord | null> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return null;
  }

  if (!isSupabaseConfigured || !supabase) {
    return buildFallbackProfile(session.user.id, session.user.email ?? '');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name, phone, phone_number, country, user_mode, email, created_at, updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function upsertMyProfile(input: UpsertProfileInput): Promise<ProfileRecord> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error('Sign in is required before saving your profile.');
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      userId: session.user.id,
      fullName: input.fullName.trim(),
      phoneNumber: input.phoneNumber.trim(),
      country: input.country.trim(),
      userMode: input.userMode,
      email: session.user.email ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const payload = {
    user_id: session.user.id,
    full_name: input.fullName.trim(),
    phone_number: input.phoneNumber.trim(),
    phone: input.phoneNumber.trim(),
    country: input.country.trim(),
    user_mode: input.userMode,
    email: session.user.email ?? '',
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, full_name, phone, phone_number, country, user_mode, email, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfileRow(data as ProfileRow);
}

export async function isProfileComplete(profile?: ProfileRecord | null): Promise<boolean> {
  const nextProfile = profile ?? (await fetchMyProfile());
  return Boolean(
    nextProfile &&
      nextProfile.fullName.trim() &&
      nextProfile.phoneNumber.trim() &&
      nextProfile.country.trim() &&
      nextProfile.userMode
  );
}

export async function assertProfileCompleteForService() {
  const complete = await isProfileComplete();
  if (!complete) {
    throw new Error(PROFILE_REQUIRED_ERROR);
  }
}

export function isProfileRequiredError(error: unknown) {
  return error instanceof Error && error.message === PROFILE_REQUIRED_ERROR;
}

function mapProfileRow(row: ProfileRow): ProfileRecord {
  return {
    userId: row.user_id,
    fullName: row.full_name?.trim() ?? '',
    phoneNumber: (row.phone_number ?? row.phone ?? '').trim(),
    country: row.country?.trim() ?? '',
    userMode: row.user_mode,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFallbackProfile(userId: string, email: string): ProfileRecord {
  return {
    userId,
    fullName: '',
    phoneNumber: '',
    country: 'United States',
    userMode: null,
    email,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
}
