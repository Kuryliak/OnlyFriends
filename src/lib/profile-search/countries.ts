// Country codes used by XVIDEOS <select name="country"> and labels shown in profile meta.
export const COUNTRY_META_LABELS: Record<string, string> = {
  US: "USA",
  AU: "Australia",
  RU: "Russia",
  UA: "Ukraine",
  DE: "Germany",
  FR: "France",
  GB: "United Kingdom",
  BR: "Brazil",
  CA: "Canada",
  IN: "India",
  MX: "Mexico",
  IT: "Italy",
  ES: "Spain",
  PL: "Poland",
  TR: "Turkey",
  JP: "Japan",
  KR: "Korea",
  CL: "Chile",
  CO: "Colombia",
  AR: "Argentina",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  DK: "Denmark",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  PT: "Portugal",
  CZ: "Czech Republic",
  RO: "Romania",
  HU: "Hungary",
  GR: "Greece",
  IE: "Ireland",
  NZ: "New Zealand",
  ZA: "South Africa",
  PH: "Philippines",
  TH: "Thailand",
  VN: "Vietnam",
  ID: "Indonesia",
  MY: "Malaysia",
  SG: "Singapore",
  EG: "Egypt",
  NG: "Nigeria",
  IL: "Israel",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  PK: "Pakistan",
  BD: "Bangladesh",
  CN: "China",
  TW: "Taiwan",
};

export const COUNTRY_OPTIONS = ["", ...Object.keys(COUNTRY_META_LABELS).sort()];

export function countryMetaLabel(code: string): string | undefined {
  return COUNTRY_META_LABELS[code];
}

export function profileMatchesCountry(meta: string, countryCode: string): boolean {
  const label = countryMetaLabel(countryCode);
  if (!label) return true;
  return meta.includes(`(${label})`);
}