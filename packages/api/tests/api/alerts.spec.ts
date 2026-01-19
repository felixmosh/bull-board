import { BaseAdapter } from '../../src/queueAdapters/base';
import { QueueAlarms } from '../../src/alerts';


describe('QueueAlarms', () => {
  let mockQueue: jest.Mocked<BaseAdapter>;
  let queues: Map<string, BaseAdapter>;

  beforeEach(() => {
    mockQueue = {
      getName: jest.fn().mockReturnValue('TestQueue'),
      getJobCounts: jest.fn(),
    } as any;

    queues = new Map();
    queues.set('TestQueue', mockQueue);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should trigger alert when threshold is exceeded based on default config', async () => {
    jest.useFakeTimers();
    
    const onAlert = jest.fn();
    const config = {
        default: {
            active: { count: 10, steps: 1 }
        }
    };

    const alarms = new QueueAlarms(queues, { config, onAlert, checkInterval: 1000 });
    
    // Mock getJobCounts to return a value exceeding threshold
    mockQueue.getJobCounts.mockResolvedValue({ active: 15 } as any);

    // Initial check is inside setInterval, so fast forward
    jest.advanceTimersByTime(1000);
    
    // Wait for the async callback
    await Promise.resolve();
    await Promise.resolve();

    expect(mockQueue.getJobCounts).toHaveBeenCalled();
    expect(onAlert).toHaveBeenCalledWith({
      queueName: 'TestQueue',
      status: 'active',
      count: 15,
      threshold: 10,
    });
    
    alarms.stop();
  });

  it('should trigger alert when threshold is exceeded based on specific queue config', async () => {
    jest.useFakeTimers();
    
    const onAlert = jest.fn();
    const config = {
        TestQueue: {
            failed: { count: 5 }
        }
    };

    const alarms = new QueueAlarms(queues, { config, onAlert, checkInterval: 1000 });
    
    // Mock getJobCounts 
    mockQueue.getJobCounts.mockResolvedValue({ failed: 8 } as any);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(onAlert).toHaveBeenCalledWith({
      queueName: 'TestQueue',
      status: 'failed',
      count: 8,
      threshold: 5,
    });
    
    alarms.stop();
  });

  it('should respect steps configuration', async () => {
    jest.useFakeTimers();
    
    const onAlert = jest.fn();
    const config = {
        default: {
            waiting: { count: 10, steps: 5 }
        }
    };

    const alarms = new QueueAlarms(queues, { config, onAlert, checkInterval: 1000 });
    
    // Case 1: Count 12 (Threshold 10). (12-10)%5 = 2. Should NOT alert.
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 12 } as any);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(onAlert).not.toHaveBeenCalled();

    // Case 2: Count 15 (Threshold 10). (15-10)%5 = 0. Should alert.
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 15 } as any);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(onAlert).toHaveBeenCalledWith({
      queueName: 'TestQueue',
      status: 'waiting',
      count: 15,
      threshold: 10,
    });
    
    alarms.stop();
  });

  it('should use default checkInterval if not provided', () => {
    const alarms = new QueueAlarms(queues, { config: {}, onAlert: jest.fn() });
    // access private property to check (casting to any)
    expect((alarms as any).checkInterval).toBe(60000);
    alarms.stop();
  });
});
