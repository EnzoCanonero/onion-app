export const USER_NAME_STORAGE_KEY = "focustree.userName";

export const getUserName = () => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(USER_NAME_STORAGE_KEY)?.trim() ?? "";
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
