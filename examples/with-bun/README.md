# Bull-Board Example with Bun

This example demonstrates how to use Bull-Board with Bun server.

## Prerequisites

- [Bun](https://bun.sh) installed
- Redis server running on localhost:6379

## Installation

```bash
bun install
```

## Running the Example

```bash
bun run start
```

The server will start on `http://localhost:3000/ui`.

## Adding Jobs to the Queue

You can add jobs to the queue by making a GET request:

```bash
curl http://localhost:3000/add?title=MyJob
```

Or open in your browser:
```
http://localhost:3000/add?title=MyJob
```

## Features Demonstrated

- Setting up Bull-Board with Bun server
- Using BullMQ adapter
- Custom base path configuration
- Job processing with progress updates
- Error handling

## Notes

This example uses Bun's native HTTP server (`Bun.serve`), which is one of the fastest HTTP servers available in JavaScript, making it perfect for high-performance queue monitoring.
