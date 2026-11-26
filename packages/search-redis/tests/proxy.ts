import net from 'net';

export interface Proxy {
  port: number;
  pause(): void;
  resume(): void;
  close(): Promise<void>;
}

export async function startProxy(target: { host: string; port: number }): Promise<Proxy> {
  const sockets = new Set<net.Socket>();
  let down = false;
  const server = net.createServer((client) => {
    if (down) {
      client.destroy();
      return;
    }
    const upstream = net.connect(target.port, target.host);
    const end = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', end);
      socket.on('close', end);
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const cut = () => {
    for (const socket of sockets) socket.destroy();
  };

  return {
    port: (server.address() as net.AddressInfo).port,
    pause() {
      down = true;
      cut();
    },
    resume() {
      down = false;
    },
    close: () =>
      new Promise<void>((resolve) => {
        down = true;
        cut();
        server.close(() => resolve());
      }),
  };
}
