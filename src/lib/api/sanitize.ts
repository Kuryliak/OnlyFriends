export function emptyToUndefined<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === "") {
      (out as Record<string, unknown>)[key] = undefined;
    }
  }
  return out;
}