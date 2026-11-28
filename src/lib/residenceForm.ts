/**
 * Guest residence forms refuse to submit until every field is filled
 * (WEBSITE (1).pdf): the guest sees which fields are still missing and those
 * fields are outlined in red.
 */
export type RequiredField = { key: string; label: string; filled: boolean };

export function missingFields(fields: RequiredField[]): RequiredField[] {
  return fields.filter((field) => !field.filled);
}

export function missingMessage(missing: RequiredField[]): string {
  return `Vui lòng điền đầy đủ thông tin còn thiếu: ${missing.map((field) => field.label).join(', ')}.`;
}

/** Red outline for a field the guest left empty after trying to submit. */
export function fieldClass(base: string, missing: Set<string>, key: string): string {
  return missing.has(key) ? `${base} !border-red-500 ring-2 ring-red-100` : base;
}

export const filled = (value: string) => value.trim().length > 0;
