import { getStorageBackend } from "./storageBackend";

export const USER_NAME_STORAGE_KEY = "onion-app.userName";

export const getUserName = () => {
  if (typeof window === "undefined") return "";
  try {
    return getStorageBackend().getItem(USER_NAME_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
};

export const getShortUserName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const [first] = trimmed.split(/\s+/);
  return first ?? "";
};
