interface ClusterLike {
  nodes(role: 'master'): { info(): Promise<string> }[];
}

const ADDITIVE_FIELDS = [
  'used_memory',
  'used_memory_peak',
  'maxmemory',
  'total_system_memory',
  'connected_clients',
  'blocked_clients',
];

const MINIMUM_FIELDS = ['uptime_in_seconds', 'uptime_in_days'];

export function isCluster(client: unknown): client is ClusterLike {
  return typeof (client as Partial<ClusterLike>)?.nodes === 'function';
}

function parseFields(info: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator > 0) {
      fields.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }

  return fields;
}

// INFO carries no key, so a cluster client answers it from an arbitrary node: one node's
// memory and client counts, flipping to another node's on the next poll. Hence the merge.
export async function clusterInfo(client: ClusterLike): Promise<string | null> {
  const masters = client.nodes('master');
  if (masters.length === 0) {
    return null;
  }

  const parsed = (await Promise.all(masters.map((node) => node.info()))).map(parseFields);
  const merged = new Map(parsed[0]);

  for (const field of ADDITIVE_FIELDS) {
    const values = parsed.map((fields) => Number(fields.get(field))).filter(Number.isFinite);
    if (values.length > 0) {
      merged.set(field, String(values.reduce((sum, value) => sum + value, 0)));
    }
  }

  for (const field of MINIMUM_FIELDS) {
    const values = parsed.map((fields) => Number(fields.get(field))).filter(Number.isFinite);
    if (values.length > 0) {
      merged.set(field, String(Math.min(...values)));
    }
  }

  merged.set('cluster_known_nodes', String(masters.length));

  return [...merged].map(([field, value]) => `${field}:${value}`).join('\r\n');
}
