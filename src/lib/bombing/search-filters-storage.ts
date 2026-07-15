import type { ProfileSearchFilters } from "@/lib/profile-search/filters";

const STORAGE_KEY = "onlyfriends.profileSearchFilters";

export const defaultProfileSearchFilters: ProfileSearchFilters = {
  keywords: "",
  sex: "Woman",
  country: "",
  ageMin: 0,
  ageMax: 0,
  createDate: 0,
  verified: true,
  hasPicture: false,
  hasVideo: false,
  isPornstar: false,
  orderby: "relevance",
  page: 1,
  listMode: "",
};

export function loadProfileSearchFilters(): ProfileSearchFilters {
  if (typeof window === "undefined") return defaultProfileSearchFilters;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfileSearchFilters;
    return { ...defaultProfileSearchFilters, ...JSON.parse(raw) };
  } catch {
    return defaultProfileSearchFilters;
  }
}

export function saveProfileSearchFilters(filters: ProfileSearchFilters) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // ignore quota errors
  }
}