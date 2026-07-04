import type { UserMode } from '@/lib/types';

const STORAGE_KEY = 'boulio.userMode';
const DEFAULT_MODE: UserMode = 'haiti_user';

let currentMode: UserMode = DEFAULT_MODE;
const listeners = new Set<(mode: UserMode) => void>();

export function getStoredUserMode(): UserMode {
  const storedMode = readModeFromStorage();
  if (storedMode) {
    currentMode = storedMode;
  }

  return currentMode;
}

export function setStoredUserMode(mode: UserMode) {
  currentMode = mode;
  writeModeToStorage(mode);

  for (const listener of listeners) {
    listener(mode);
  }
}

export function subscribeToUserModeChanges(onChange: (mode: UserMode) => void) {
  listeners.add(onChange);
  onChange(getStoredUserMode());

  return () => {
    listeners.delete(onChange);
  };
}

function readModeFromStorage(): UserMode | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'haiti_user' || value === 'diaspora_supporter') {
      return value;
    }
  } catch {
    // Ignore storage access issues and keep the in-memory fallback.
  }

  return null;
}

function writeModeToStorage(mode: UserMode) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage access issues and keep the in-memory fallback.
  }
}
