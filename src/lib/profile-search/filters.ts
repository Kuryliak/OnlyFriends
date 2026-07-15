export type ProfileOrderBy = "relevance" | "hits" | "votes" | "last_activity";

export type ProfileSearchFilters = {
  keywords?: string;
  sex?: string;
  seeking?: string;
  roleplay?: string;
  country?: string;
  region?: string;
  relationship?: string;
  ageMin?: number;
  ageMax?: number;
  createDate?: number;
  kids?: string;
  religion?: string;
  smoking?: string;
  drinking?: string;
  webcam?: string;
  hasPicture?: boolean;
  hasVideo?: boolean;
  isPornstar?: boolean;
  verified?: boolean;
  ethnicity?: string;
  body?: string;
  heightMin?: number;
  heightMax?: number;
  weightMin?: number;
  weightMax?: number;
  hairLength?: string;
  hairColor?: string;
  eyesColor?: string;
  orderby?: ProfileOrderBy;
  page?: number;
  listMode?: string;
};

export const LIST_MODES = [
  { value: "", labelKey: "search.listModes.verifiedWomen" },
  { value: "/profileslist/unverified", labelKey: "search.listModes.unverified" },
  { value: "/profiles-man", labelKey: "search.listModes.men" },
  { value: "/lesbian-girls", labelKey: "search.listModes.lesbian" },
  { value: "/gay-men", labelKey: "search.listModes.gayMen" },
  { value: "/profiles-trans", labelKey: "search.listModes.trans" },
  { value: "/profileslist/most-friends", labelKey: "search.listModes.topFriends" },
  { value: "/profiles-index", labelKey: "search.listModes.newProfiles" },
] as const;

export const SEX_OPTIONS = [
  "", "Woman", "Man", "Couple", "Gay man", "Gay couple", "All gay",
  "Lesbian woman", "Lesbian couple", "Transvestite", "Transvestite man",
  "Transvestite gay man", "Transsexual", "Transsexual man", "Transsexual woman",
  "Transsexual couple", "All transsexual", "Non-binary",
];

export const SEEKING_OPTIONS = [
  "", "Woman", "Man", "Couple", "Gay man", "Gay couple", "Lesbian woman",
  "Lesbian couple", "Transvestite", "Transsexual", "Transsexual couple",
  "Master", "Slave", "Transsexual man", "Transsexual woman",
  "Transvestite man", "Transvestite gay man", "Non-binary",
];

export const RELATIONSHIP_OPTIONS = ["", "Single", "Taken", "Open"];
export const CREATE_DATE_OPTIONS = [
  { value: 0, labelKey: "search.anyTime" },
  { value: 4, labelKey: "search.today" },
  { value: 15, labelKey: "search.lastWeek" },
  { value: 40, labelKey: "search.lastMonth" },
  { value: 90, labelKey: "search.last3Months" },
];

export const ETHNICITY_OPTIONS = ["", "Asian", "Black", "Indian", "Latino", "Middle Eastern", "Mixed", "White"];
export const BODY_OPTIONS = ["", "Slim", "Average", "Athletic", "Stocky", "Large"];
export const HAIR_LENGTH_OPTIONS = ["", "Bald", "Short", "Medium", "Long"];
export const HAIR_COLOR_OPTIONS = ["", "Blonde", "Brown", "Red", "Black", "Other"];
export const EYES_COLOR_OPTIONS = ["", "Grey", "Green", "Blue", "Brown", "Black"];
export const ORDERBY_OPTIONS: { value: ProfileOrderBy; labelKey: string }[] = [
  { value: "relevance", labelKey: "search.orderRelevance" },
  { value: "hits", labelKey: "search.orderHits" },
  { value: "votes", labelKey: "search.orderVotes" },
  { value: "last_activity", labelKey: "search.orderActivity" },
];

export { COUNTRY_OPTIONS, COUNTRY_META_LABELS as COUNTRY_LABELS } from "./countries";

/** Filters that require the profile-search endpoint instead of a browse list URL. */
export function hasBrowseBreakingFilters(filters: ProfileSearchFilters): boolean {
  return !!(
    filters.keywords?.trim() ||
    filters.seeking ||
    filters.roleplay ||
    filters.region ||
    filters.relationship ||
    filters.ageMin ||
    filters.ageMax ||
    filters.createDate ||
    filters.kids ||
    filters.religion ||
    filters.smoking ||
    filters.drinking ||
    filters.webcam ||
    filters.hasPicture ||
    filters.hasVideo ||
    filters.isPornstar ||
    filters.ethnicity ||
    filters.body ||
    filters.heightMin ||
    filters.heightMax ||
    filters.weightMin ||
    filters.weightMax ||
    filters.hairLength ||
    filters.hairColor ||
    filters.eyesColor ||
    filters.verified === false
  );
}

export function hasActiveSearchFilters(filters: ProfileSearchFilters): boolean {
  return !!(filters.country || hasBrowseBreakingFilters(filters));
}

export function usesBrowseListUrl(filters: ProfileSearchFilters): boolean {
  return !!(filters.listMode && !filters.country && !hasBrowseBreakingFilters(filters));
}

export function listModeSearchOverrides(
  listMode: string
): Partial<ProfileSearchFilters> {
  switch (listMode) {
    case "/profileslist/unverified":
      return { sex: "Woman", verified: false };
    case "/profiles-man":
      return { sex: "Man", verified: true };
    case "/lesbian-girls":
      return { sex: "Lesbian woman", verified: true };
    case "/gay-men":
      return { sex: "Gay man", verified: true };
    case "/profiles-trans":
      return { sex: "All transsexual", verified: true };
    case "/profileslist/most-friends":
      return { sex: "Woman", verified: true, orderby: "votes" };
    case "/profiles-index":
      return { sex: "Woman", verified: true, orderby: "last_activity", createDate: 40 };
    default:
      return { sex: "Woman", verified: true };
  }
}

export function resolveSearchFilters(filters: ProfileSearchFilters): ProfileSearchFilters {
  if (!filters.listMode || usesBrowseListUrl(filters)) return filters;
  // List-mode defaults must win over stale UI fields (e.g. sex: "Woman" with /profiles-man).
  return { ...filters, ...listModeSearchOverrides(filters.listMode) };
}

function setParam(params: URLSearchParams, key: string, value?: string | number | boolean) {
  if (value === undefined || value === "" || value === 0 || value === false) return;
  if (typeof value === "boolean") {
    if (value) params.set(key, "on");
    return;
  }
  params.set(key, String(value));
}

export function buildProfileSearchUrl(filters: ProfileSearchFilters): string {
  const page = Math.max(1, filters.page ?? 1);

  if (usesBrowseListUrl(filters)) {
    const base = filters.listMode!;
    if (page === 1) return `https://www.xvideos.com${base}`;
    return `https://www.xvideos.com${base}/${page - 1}`;
  }

  const resolved = resolveSearchFilters(filters);
  const params = new URLSearchParams();
  setParam(params, "keywords", resolved.keywords);
  setParam(params, "sex", resolved.sex ?? "Woman");
  setParam(params, "seeking", resolved.seeking);
  setParam(params, "roleplay", resolved.roleplay);
  setParam(params, "country", resolved.country);
  setParam(params, "region", resolved.region);
  setParam(params, "relationship", resolved.relationship);
  setParam(params, "age_min", resolved.ageMin);
  setParam(params, "age_max", resolved.ageMax);
  setParam(params, "create_date", resolved.createDate);
  setParam(params, "kids", resolved.kids);
  setParam(params, "religion", resolved.religion);
  setParam(params, "smocking", resolved.smoking);
  setParam(params, "drinking", resolved.drinking);
  setParam(params, "webcam", resolved.webcam);
  setParam(params, "ethnicity", resolved.ethnicity);
  setParam(params, "body", resolved.body);
  setParam(params, "height_min", resolved.heightMin);
  setParam(params, "height_max", resolved.heightMax);
  setParam(params, "weight_min", resolved.weightMin);
  setParam(params, "weight_max", resolved.weightMax);
  setParam(params, "hair_length", resolved.hairLength);
  setParam(params, "hair_color", resolved.hairColor);
  setParam(params, "eyes_color", resolved.eyesColor);
  setParam(params, "orderby", resolved.orderby ?? "relevance");

  if (resolved.hasPicture) params.set("has_picture", "on");
  if (resolved.hasVideo) params.set("has_video", "on");
  if (resolved.isPornstar) params.set("is_pornstar", "on");
  if (resolved.verified !== false) params.set("verified", "on");

  if (page > 1) params.set("p", String(page - 1));

  return `https://www.xvideos.com/profile-search/?${params.toString()}`;
}