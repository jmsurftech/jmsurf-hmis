import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';

/** Minimal zod resolver for react-hook-form (avoids cross-version type issues). */
export function zodResolver<T extends FieldValues>(schema: ZodTypeAny): Resolver<T> {
  return async (values) => {
    const r = await schema.safeParseAsync(values);
    if (r.success) return { values: r.data as T, errors: {} };
    const errors: Record<string, any> = {};
    for (const issue of r.error.issues) {
      const path = issue.path.join('.');
      if (!errors[path]) errors[path] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
