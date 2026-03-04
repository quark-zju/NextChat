import type { StateStorage } from "zustand/middleware";

export const STORAGE_WARNING_EVENT = "chatnext-storage-warning";

type StorageWarningType = "near-limit" | "full";

type StorageWarningDetail = {
  type: StorageWarningType;
  key: string;
};

const SOFT_LIMIT_BYTES = 4 * 1024 * 1024;
const WARNING_COOLDOWN_MS = 30 * 1000;

const lastWarningAt: Record<StorageWarningType, number> = {
  "near-limit": 0,
  full: 0,
};

function estimateLocalStorageBytes(storage: Storage): number {
  let total = 0;

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const value = storage.getItem(key) ?? "";
    total += (key.length + value.length) * 2;
  }

  return total;
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

function emitWarning(detail: StorageWarningDetail) {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  if (now - lastWarningAt[detail.type] < WARNING_COOLDOWN_MS) {
    return;
  }

  lastWarningAt[detail.type] = now;

  window.dispatchEvent(
    new CustomEvent<StorageWarningDetail>(STORAGE_WARNING_EVENT, { detail }),
  );
}

function maybeWarnNearLimit(storage: Storage, key: string) {
  const usedBytes = estimateLocalStorageBytes(storage);
  if (usedBytes >= SOFT_LIMIT_BYTES) {
    emitWarning({ type: "near-limit", key });
  }
}

export const persistStorage: StateStorage = {
  getItem(name) {
    return localStorage.getItem(name);
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
      maybeWarnNearLimit(localStorage, name);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        emitWarning({ type: "full", key: name });
        return;
      }
      throw error;
    }
  },
  removeItem(name) {
    localStorage.removeItem(name);
  },
};
