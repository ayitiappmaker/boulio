import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type PlatformStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export const platformStorage: PlatformStorage = {
  getItem(key) {
    if (Platform.OS !== 'web') {
      return AsyncStorage.getItem(key);
    }

    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (Platform.OS !== 'web') {
      return AsyncStorage.setItem(key, value);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Keep in-memory app state when browser storage is unavailable.
      }
    }
  },
  removeItem(key) {
    if (Platform.OS !== 'web') {
      return AsyncStorage.removeItem(key);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Removing an unavailable browser value is already satisfied.
      }
    }
  },
};
