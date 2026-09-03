import { createServer, type Server } from 'node:net';

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

function readCommands(buffer: Buffer): { commands: string[][]; rest: Buffer<ArrayBuffer> } {
  const commands: string[][] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0x2a) return { commands, rest: Buffer.from(buffer.subarray(offset)) };

    const headerEnd = buffer.indexOf('\r\n', offset);
    if (headerEnd === -1) return { commands, rest: Buffer.from(buffer.subarray(offset)) };

    const argc = Number(buffer.subarray(offset + 1, headerEnd).toString());
    const parts: string[] = [];
    let cursor = headerEnd + 2;
    let complete = true;

    for (let i = 0; i < argc; i++) {
      const lengthEnd = buffer.indexOf('\r\n', cursor);
      if (lengthEnd === -1) {
        complete = false;
        break;
      }
      const length = Number(buffer.subarray(cursor + 1, lengthEnd).toString());
      const start = lengthEnd + 2;
      if (buffer.length < start + length + 2) {
        complete = false;
        break;
      }
      parts.push(buffer.subarray(start, start + length).toString());
      cursor = start + length + 2;
    }

    if (!complete) return { commands, rest: Buffer.from(buffer.subarray(offset)) };

    commands.push(parts);
    offset = cursor;
  }

  return { commands, rest: Buffer.alloc(0) };
}

export async function startFakeSentinel(master: {
  host: string;
  port: number;
  name: string;
}): Promise<FakeSentinel> {
  const commands: string[] = [];

  const server: Server = createServer((socket) => {
    let buffered = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      const { commands: received, rest } = readCommands(buffered);
      buffered = rest;

      for (const parts of received) {
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
      }
    });

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
