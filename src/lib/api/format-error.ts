type ZodFlatError = {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

type ApiErrorBody = {
  error?: string | ZodFlatError;
  details?: ZodFlatError;
};

function firstFieldError(flat?: ZodFlatError): string | undefined {
  if (!flat?.fieldErrors) return undefined;
  for (const messages of Object.values(flat.fieldErrors)) {
    if (messages?.[0]) return messages[0];
  }
  return undefined;
}

export function formatApiError(data: ApiErrorBody, fallback: string): string {
  if (typeof data.error === "string" && data.error) return data.error;

  const fieldMessage =
    firstFieldError(data.details) ??
    (typeof data.error === "object" ? firstFieldError(data.error) : undefined);
  if (fieldMessage) return fieldMessage;

  const formMessage =
    data.details?.formErrors?.[0] ??
    (typeof data.error === "object" ? data.error.formErrors?.[0] : undefined);
  if (formMessage) return formMessage;

  return fallback;
}