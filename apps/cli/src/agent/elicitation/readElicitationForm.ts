import { z } from 'zod';
import { STRUCTURED_QUESTION_LIMITS } from '@happier-dev/protocol';

import type { ElicitationForm } from './types';

const SupportedFormRequestSchema = z.object({
  mode: z.literal('form'),
  sessionId: z.string().min(1),
  message: z.string().min(1),
  requestedSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

const EnumPropertySchema = z.object({
  type: z.literal('string').optional(),
  enum: z
    .array(z.string().min(1))
    .min(2)
    .max(STRUCTURED_QUESTION_LIMITS.maxOptionsPerQuestion),
  title: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Extracts the single-enum form this client can render, or null.
 *
 * Supported: `mode: 'form'` with exactly one required property whose schema is
 * `{ type: 'string', enum: string[] }`. Multi-field forms, free-form input and
 * URL mode return null; the caller must then answer `cancel`, never `accept`.
 */
export function readElicitationForm(request: unknown): ElicitationForm | null {
  const parsed = SupportedFormRequestSchema.safeParse(request);
  if (!parsed.success) return null;
  const { sessionId, message, requestedSchema } = parsed.data;

  const supported: Array<{ propertyName: string; property: z.infer<typeof EnumPropertySchema> }> = [];
  for (const [propertyName, value] of Object.entries(requestedSchema.properties)) {
    const parsedProperty = EnumPropertySchema.safeParse(value);
    if (parsedProperty.success) supported.push({ propertyName, property: parsedProperty.data });
  }
  // A binary prompt cannot express a multi-field form.
  if (supported.length !== 1) return null;
  const [{ propertyName, property }] = supported;
  if (requestedSchema.required && !requestedSchema.required.includes(propertyName)) return null;

  const labels = [...new Set(property.enum)];
  // A single option cannot distinguish approve from decline.
  if (labels.length < 2) return null;

  return {
    sessionId,
    message,
    propertyName,
    question: {
      question: property.title ?? property.description ?? message,
      ...(property.title && property.description ? { header: property.description } : {}),
      options: labels.map((label) => ({ label })),
      multiSelect: false,
    },
  };
}
