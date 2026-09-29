import type { BaseAdapter } from './base';
import { isCluster } from './clusterInfo';

export interface WorkerLookup {
  client: object;
  matches(connectionName: string): boolean;
}

interface ClientListSource {
  client(subcommand: 'LIST'): Promise<unknown>;
}

const UNSUPPORTED = /ERR unknown command ['`]\s*client\s*['`]/;
const NAME = /(?:^| )name=(\S*)/;

async function readNames(source: ClientListSource): Promise<string[] | null> {
  try {
    return String(await source.client('LIST'))
      .split(/\r?\n/)
      .map((line) => NAME.exec(line)?.[1])
      .filter((name): name is string => !!name);
  } catch (error) {
    if (UNSUPPORTED.test((error as Error).message)) {
      return null;
    }
    throw error;
  }
}

export function createClientListSnapshot() {
  const reads = new Map<object, Promise<(string[] | null)[]>>();

  function namesOf(client: object): Promise<(string[] | null)[]> {
    let read = reads.get(client);
    if (!read) {
      const sources = (isCluster(client)
        ? client.nodes('master')
        : [client]) as unknown as ClientListSource[];
      read = Promise.all(sources.map(readNames));
      reads.set(client, read);
    }
    return read;
  }

  return {
    async hasWorkers(queue: BaseAdapter): Promise<boolean | null> {
      const lookup = await queue.getWorkerLookup();
      if (!lookup) {
        const workers = await queue.getWorkers();
        return workers && workers.length > 0;
      }

      const answered = (await namesOf(lookup.client)).filter(
        (names): names is string[] => names !== null
      );
      if (answered.length === 0) {
        return null;
      }
      return answered.some((names) => names.some(lookup.matches));
    },
  };
}

export type ClientListSnapshot = ReturnType<typeof createClientListSnapshot>;
