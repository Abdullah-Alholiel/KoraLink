import { RedisIoAdapter } from './redis-io.adapter';

jest.mock('ioredis', () => {
  const mockClient = {
    duplicate: jest.fn(() => mockClient),
    on: jest.fn(),
  };
  return { __esModule: true, default: jest.fn(() => mockClient) };
});

describe('RedisIoAdapter', () => {
  const app = { getHttpServer: () => ({}) };

  it('stays in-memory until connectToRedis is called (WS_REDIS_ADAPTER=false)', () => {
    const adapter = new RedisIoAdapter(app as any);
    expect((adapter as any).adapterConstructor).toBeUndefined();
  });

  it('builds a redis adapter from pub/sub clients on connectToRedis', async () => {
    const adapter = new RedisIoAdapter(app as any);
    await adapter.connectToRedis('localhost', 6379, '');
    expect((adapter as any).adapterConstructor).toBeDefined();
  });
});
