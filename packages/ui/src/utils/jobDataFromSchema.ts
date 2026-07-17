type JsonSchema = Record<string, any>;

function placeholderForType(type: string | string[] | undefined): unknown {
  const resolved = Array.isArray(type) ? type[0] : type;
  switch (resolved) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

/**
 * Derives a starting value for the "add job" data editor from a queue's JSON Schema.
 * Priority: an explicit `default`, then the first `examples` entry, then a skeleton
 * built from `properties` (each key seeded with its own `default` or a typed placeholder).
 * Returns undefined when the schema carries nothing usable, so callers fall back to `{}`.
 */
export function jobDataFromSchema(schema?: JsonSchema): Record<string, any> | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }

  const { properties } = schema;
  if (properties && typeof properties === 'object') {
    return Object.entries(properties as Record<string, JsonSchema>).reduce(
      (acc, [key, prop]) => {
        acc[key] = prop && prop.default !== undefined ? prop.default : placeholderForType(prop?.type);
        return acc;
      },
      {} as Record<string, any>
    );
  }

  return undefined;
}
