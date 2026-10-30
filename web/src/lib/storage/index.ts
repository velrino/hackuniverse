/** String transport only; callers own keys, schemas, defaults and recovery policy. */
export type StorageService = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Resolve each operation lazily, preserving native failures and method receivers. */
export function createStorageService(resolveStorage: () => StorageService): StorageService {
  return Object.freeze({
    getItem: (key: string) => resolveStorage().getItem(key),
    setItem: (key: string, value: string) => resolveStorage().setItem(key, value),
    removeItem: (key: string) => resolveStorage().removeItem(key),
  });
}

/** Importing on the server or mounting a consumer never accesses browser storage. */
export const browserStorage = createStorageService(() => {
  if (typeof window === "undefined") throw new Error("Browser storage unavailable");
  return window.localStorage;
});
