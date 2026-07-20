import { Draft07 } from 'json-schema-library';

type JsonSchema = Record<string, any>;

/**
 * Derives a starting value for the "add job" data editor from a queue's JSON Schema.
 * Priority: an explicit schema-level `default`, then the first `examples` entry, then a
 * template generated from the schema. The template walks nested objects and arrays and
 * seeds each leaf with its own `default` or a typed placeholder, which the hand-rolled
 * version could not do. Returns undefined when the schema yields nothing, so callers fall
 * back to `{}`.
 */
export function jobDataFromSchema(schema?: JsonSchema): Record<string, any> | undefined {
  if (!schema || typeof schema !== 'object' || Object.keys(schema).length === 0) {
    return undefined;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }

  const template = new Draft07(schema).getTemplate(undefined, schema, {
    addOptionalProps: true,
  }) as Record<string, any> | undefined;

  return template && typeof template === 'object' && Object.keys(template).length > 0
    ? template
    : undefined;
}
