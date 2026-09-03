import { createServer, type Server } from 'node:net';
import RedisParser from 'redis-parser';

export interface FakeSentinel {
  port: number;
  commands: string[];
  close(): Promise<void>;
}

function bulkArray(values: string[]): string {
  return (
    `*${values.length}\r\n` +
    values.map((value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join('')
  );
}

export async function startFakeSentinel(master: {
  host: string;
  port: number;
  name: string;
}): Promise<FakeSentinel> {
  const commands: string[] = [];

  const server: Server = createServer((socket) => {
    const parser = new RedisParser({
      returnReply: (parts: string[]) => {
        const command = parts[0]?.toUpperCase();
        const subcommand = parts[1]?.toLowerCase();
        commands.push([command, subcommand].filter(Boolean).join(' '));

        if (command === 'SENTINEL' && subcommand === 'get-master-addr-by-name') {
          socket.write(
            parts[2] === master.name ? bulkArray([master.host, String(master.port)]) : '$-1\r\n'
          );
        } else if (command === 'SENTINEL' && subcommand === 'sentinels') {
          socket.write('*0\r\n');
        } else if (command === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else {
          socket.write('+OK\r\n');
        }
      },
      returnError: () => socket.destroy(),
    });

    socket.on('data', (chunk: Buffer) => parser.execute(chunk));
    socket.on('error', () => undefined);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });

  return {
    port,
    commands,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
