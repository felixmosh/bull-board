type JsonSchema = Record<string, any>;

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'];

function typeOf(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown';
  if (Object.keys(schema).length === 0) return 'any';
  if (schema.$ref) return schema.$ref.split('/').pop() as string;
  if (schema.enum) return schema.enum.map((value: unknown) => `\`${value}\``).join(' \\| ');
  if (schema.anyOf || schema.oneOf) {
    return (schema.anyOf ?? schema.oneOf).map(typeOf).join(' \\| ');
  }
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(' \\| ');
  return schema.type ?? 'object';
}

function renderParameters(parameters: JsonSchema[] = []): string[] {
  if (parameters.length === 0) return [];

  const lines = ['| Parameter | In | Required | Type |', '| --- | --- | --- | --- |'];
  for (const parameter of parameters) {
    lines.push(
      `| \`${parameter.name}\` | ${parameter.in} | ${parameter.required ? 'yes' : 'no'} | ${typeOf(
        parameter.schema
      )} |`
    );
  }
  lines.push('');

  return lines;
}

function renderSchema(name: string, schema: JsonSchema): string[] {
  const lines = [`### ${name}`, ''];

  if (!schema.properties) {
    lines.push(`\`${typeOf(schema)}\``, '');
    return lines;
  }

  const required: string[] = schema.required ?? [];
  lines.push('| Field | Type | Required |', '| --- | --- | --- |');
  for (const [field, property] of Object.entries<JsonSchema>(schema.properties)) {
    lines.push(
      `| \`${field}\` | ${typeOf(property)} | ${required.includes(field) ? 'yes' : 'no'} |`
    );
  }
  lines.push('');

  return lines;
}

export function renderMarkdown(spec: JsonSchema, intro: string): string {
  const byTag = new Map<string, string[]>();

  for (const [routePath, operations] of Object.entries<JsonSchema>(spec.paths)) {
    const methods = Object.keys(operations).sort(
      (a, b) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b)
    );

    for (const method of methods) {
      const operation = operations[method];
      const tag = operation.tags[0];
      const lines = byTag.get(tag) ?? [];

      lines.push(`### \`${method.toUpperCase()} ${routePath}\``, '', operation.summary, '');

      if (operation.description) {
        lines.push(`> ${operation.description}`, '');
      }

      lines.push(...renderParameters(operation.parameters));

      if (operation.requestBody) {
        const ref = operation.requestBody.content['application/json'].schema.$ref;
        lines.push(`Request body: [\`${ref.split('/').pop()}\`](#${anchor(ref)})`, '');
      }

      const successStatus = Object.keys(operation.responses).find((key) => key !== 'default')!;
      const successRef = operation.responses[successStatus].content?.['application/json']?.schema
        ?.$ref as string | undefined;
      lines.push(
        successRef
          ? `Responds \`${successStatus}\` with [\`${successRef.split('/').pop()}\`](#${anchor(
              successRef
            )}).`
          : `Responds \`${successStatus}\` with no body.`,
        ''
      );

      byTag.set(tag, lines);
    }
  }

  const described = new Map<string, string>(
    (spec.tags ?? []).map((tag: JsonSchema) => [tag.name, tag.description])
  );
  const ordered = (spec.tags ?? [])
    .map((tag: JsonSchema) => tag.name as string)
    .filter((name: string) => byTag.has(name));

  const sections: string[] = [intro.trimEnd(), ''];
  for (const tag of ordered) {
    sections.push(`## ${tag}`, '', described.get(tag) as string, '', ...byTag.get(tag)!);
  }

  sections.push('## Schemas', '');
  for (const [name, schema] of Object.entries<JsonSchema>(spec.components.schemas)) {
    sections.push(...renderSchema(name, schema));
  }

  return `${sections.join('\n').trimEnd()}\n`;
}

function anchor(ref: string): string {
  return (ref.split('/').pop() as string).toLowerCase();
}
