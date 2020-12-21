"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const supertest_1 = __importDefault(require("supertest"));
const bullBoard = __importStar(require("./index"));
const bullMQ_1 = require("./queueAdapters/bullMQ");
describe('index', () => {
    it('should save the interface', () => {
        expect(bullBoard).toMatchInlineSnapshot(`
      Object {
        "BullAdapter": [Function],
        "BullMQAdapter": [Function],
        "replaceQueues": [Function],
        "router": [Function],
        "setQueues": [Function],
      }
    `);
    });
});
describe('happy', () => {
    const { router, setQueues, replaceQueues } = bullBoard;
    it('should be able to set queue', async () => {
        const paintQueue = new bullMQ_1.BullMQAdapter(new bullmq_1.Queue('Paint', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        }));
        setQueues([paintQueue]);
        await supertest_1.default(router)
            .get('/api/queues')
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res) => {
            expect(JSON.parse(res.text)).toMatchInlineSnapshot({
                stats: {
                    blocked_clients: expect.any(String),
                    connected_clients: expect.any(String),
                    mem_fragmentation_ratio: expect.any(String),
                    redis_version: expect.any(String),
                    total_system_memory: expect.any(String),
                    used_memory: expect.any(String),
                },
            }, `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                },
                "jobs": Array [],
                "name": "bull:Paint:~",
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `);
        });
    });
    it('should be able to replace queues', async () => {
        const paintQueue = new bullMQ_1.BullMQAdapter(new bullmq_1.Queue('Paint', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        }));
        const drainQueue = new bullMQ_1.BullMQAdapter(new bullmq_1.Queue('Drain', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        }));
        const codeQueue = new bullMQ_1.BullMQAdapter(new bullmq_1.Queue('Code', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        }));
        setQueues([paintQueue, drainQueue]);
        replaceQueues([codeQueue]);
        await supertest_1.default(router)
            .get('/api/queues')
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res) => {
            expect(JSON.parse(res.text)).toMatchInlineSnapshot({
                stats: {
                    blocked_clients: expect.any(String),
                    connected_clients: expect.any(String),
                    mem_fragmentation_ratio: expect.any(String),
                    redis_version: expect.any(String),
                    total_system_memory: expect.any(String),
                    used_memory: expect.any(String),
                },
            }, `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                },
                "jobs": Array [],
                "name": "bull:Code:~",
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `);
        });
    });
    it('should be able to replace queues without initial set', async () => {
        const codeQueue = new bullMQ_1.BullMQAdapter(new bullmq_1.Queue('Code', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        }));
        replaceQueues([codeQueue]);
        await supertest_1.default(router)
            .get('/api/queues')
            .expect('Content-Type', /json/)
            .expect(200)
            .then((res) => {
            expect(JSON.parse(res.text)).toMatchInlineSnapshot({
                stats: {
                    blocked_clients: expect.any(String),
                    connected_clients: expect.any(String),
                    mem_fragmentation_ratio: expect.any(String),
                    redis_version: expect.any(String),
                    total_system_memory: expect.any(String),
                    used_memory: expect.any(String),
                },
            }, `
          Object {
            "queues": Array [
              Object {
                "counts": Object {
                  "active": 0,
                  "completed": 0,
                  "delayed": 0,
                  "failed": 0,
                  "paused": 0,
                  "waiting": 0,
                },
                "jobs": Array [],
                "name": "bull:Code:~",
              },
            ],
            "stats": Object {
              "blocked_clients": Any<String>,
              "connected_clients": Any<String>,
              "mem_fragmentation_ratio": Any<String>,
              "redis_version": Any<String>,
              "total_system_memory": Any<String>,
              "used_memory": Any<String>,
            },
          }
        `);
        });
    });
});
//# sourceMappingURL=index.spec.js.map