import { Queue } from '@sinianluoye/bullmq';
import request from 'supertest';

import { createBullBoard } from '@sinianluoye/bull-board-api';
import { BullMQAdapter } from '@sinianluoye/bull-board-api/bullMQAdapter';
import { ExpressAdapter } from '@sinianluoye/bull-board-express';

describe('Scheduled Job Removal', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('ScheduledJobTest', { connection });

    // Clear queue before each test
    await testQueue.obliterate({ force: true });

    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });
  });

  afterEach(async () => {
    await testQueue.obliterate({ force: true });
    await testQueue.close();
  });

  describe('Scheduled job with upsertJobScheduler', () => {
    it('should create a scheduled job with repeatJobKey', async () => {
      // Create a scheduled job using upsertJobScheduler
      const schedulerId = 'test-scheduled-job';
      const job = await testQueue.upsertJobScheduler(
        schedulerId,
        {
          pattern: '0 0 * * *', // Daily at midnight
        },
        {
          name: 'scheduled-task',
          data: { test: 'data' },
          opts: {},
        }
      );

      expect(job).toBeDefined();
      if (!job) {
        throw new Error('Job should have been created');
      }

      expect(job.id).toContain(`repeat:${schedulerId}`);

      // Verify job has repeatJobKey
      const jobJson = job.toJSON();
      expect(jobJson.repeatJobKey).toBe(schedulerId);
    });

    it('should successfully remove a scheduled job via API', async () => {
      // 1. Create a scheduled job
      const schedulerId = 'test-cleanup-scheduled';
      const job = await testQueue.upsertJobScheduler(
        schedulerId,
        {
          pattern: '0 0 * * *',
        },
        {
          name: 'cleanup-task',
          data: { test: 'cleanup' },
          opts: {},
        }
      );

      expect(job).toBeDefined();
      if (!job || !job.id) {
        throw new Error('Job and job ID should have been created');
      }
      const jobId = job.id;

      // Verify scheduler exists in Redis
      const schedulersBefore = await testQueue.getJobSchedulers();
      expect(schedulersBefore).toHaveLength(1);
      expect(schedulersBefore[0].key).toBe(schedulerId);

      // Verify delayed job exists
      const delayedJobsBefore = await testQueue.getDelayed();
      expect(delayedJobsBefore).toHaveLength(1);
      expect(delayedJobsBefore[0].id).toBe(jobId);

      // 2. Send API request to clean the job
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${jobId}/clean`)
        .expect(204);

      // 3. Verify scheduler was removed
      const schedulersAfter = await testQueue.getJobSchedulers();
      expect(schedulersAfter).toHaveLength(0);

      // 4. Verify delayed job was removed
      const delayedJobsAfter = await testQueue.getDelayed();
      expect(delayedJobsAfter).toHaveLength(0);

      // 5. Verify job cannot be retrieved
      const removedJob = await testQueue.getJob(jobId);
      expect(removedJob).toBeUndefined();
    });

    it('should remove multiple scheduled jobs independently', async () => {
      // Create two scheduled jobs
      const scheduler1 = 'scheduled-job-1';
      const scheduler2 = 'scheduled-job-2';

      const job1 = await testQueue.upsertJobScheduler(
        scheduler1,
        { pattern: '0 0 * * *' },
        { name: 'task-1', data: {}, opts: {} }
      );

      const job2 = await testQueue.upsertJobScheduler(
        scheduler2,
        { pattern: '0 12 * * *' },
        { name: 'task-2', data: {}, opts: {} }
      );

      expect(job1).toBeDefined();
      expect(job2).toBeDefined();
      if (!job1 || !job1.id || !job2 || !job2.id) {
        throw new Error('Both jobs and their IDs should have been created');
      }

      // Verify both schedulers exist
      const schedulersBefore = await testQueue.getJobSchedulers();
      expect(schedulersBefore).toHaveLength(2);

      // Remove first scheduled job
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${job1.id}/clean`)
        .expect(204);

      // Verify only second scheduler remains
      const schedulersAfter = await testQueue.getJobSchedulers();
      expect(schedulersAfter).toHaveLength(1);
      expect(schedulersAfter[0].key).toBe(scheduler2);

      // Verify first job is gone but second remains
      const delayedJobs = await testQueue.getDelayed();
      expect(delayedJobs).toHaveLength(1);
      expect(delayedJobs[0].id).toBe(job2.id);
    });

    it('should handle removing already removed scheduled job gracefully', async () => {
      // Create scheduled job
      const schedulerId = 'test-double-remove';
      const job = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'task', data: {}, opts: {} }
      );

      expect(job).toBeDefined();
      if (!job || !job.id) {
        throw new Error('Job and job ID should have been created');
      }
      const jobId = job.id;

      // Remove once
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${jobId}/clean`)
        .expect(204);

      // Try to remove again - should return 404 (job not found)
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${jobId}/clean`)
        .expect(404);
    });

    it('should not affect regular jobs', async () => {
      // Add regular job
      const regularJob = await testQueue.add('regular-task', { data: 'regular' });

      // Add scheduled job
      const schedulerId = 'scheduled-task';
      const scheduledJob = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'scheduled-task', data: {}, opts: {} }
      );

      expect(regularJob).toBeDefined();
      expect(scheduledJob).toBeDefined();
      if (!regularJob.id) {
        throw new Error('Regular job ID should have been created');
      }

      // Remove regular job
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${regularJob.id}/clean`)
        .expect(204);

      // Verify regular job is removed
      const removedRegular = await testQueue.getJob(regularJob.id);
      expect(removedRegular).toBeUndefined();

      // Verify scheduled job still exists
      const schedulers = await testQueue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0].key).toBe(schedulerId);
    });

    it('should verify repeatJobKey extraction from job metadata', async () => {
      const schedulerId = 'metadata-test';
      const job = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'metadata-task', data: {}, opts: {} }
      );

      expect(job).toBeDefined();
      if (!job || !job.id) {
        throw new Error('Job and job ID should have been created');
      }

      // Verify repeatJobKey is present on job
      const jobJson = job.toJSON();

      // Check repeatJobKey at top level
      expect(jobJson.repeatJobKey).toBe(schedulerId);

      // Verify job can be retrieved and has repeatJobKey
      const jobData = await testQueue.getJob(job.id);
      expect(jobData).toBeDefined();
      if (!jobData) {
        throw new Error('Job data should be retrievable');
      }
      expect(jobData.repeatJobKey).toBe(schedulerId);

      const dataJson = jobData.toJSON();
      expect(dataJson.repeatJobKey).toBe(schedulerId);
    });

    it('should handle scheduled jobs with different repeat patterns', async () => {
      // Test with cron pattern
      const cronJob = await testQueue.upsertJobScheduler(
        'cron-job',
        { pattern: '0 */6 * * *' }, // Every 6 hours
        { name: 'cron-task', data: {}, opts: {} }
      );

      // Test with every pattern
      const everyJob = await testQueue.upsertJobScheduler(
        'every-job',
        { every: 3600000 }, // Every hour in milliseconds
        { name: 'every-task', data: {}, opts: {} }
      );

      expect(cronJob).toBeDefined();
      expect(everyJob).toBeDefined();
      if (!cronJob || !cronJob.id) {
        throw new Error('Cron job and its ID should have been created');
      }

      // Verify both schedulers exist
      const schedulers = await testQueue.getJobSchedulers();
      expect(schedulers).toHaveLength(2);

      // Remove cron job
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${cronJob.id}/clean`)
        .expect(204);

      // Verify only every job remains
      const remainingSchedulers = await testQueue.getJobSchedulers();
      expect(remainingSchedulers).toHaveLength(1);
      expect(remainingSchedulers[0].key).toBe('every-job');
    });
  });

  describe('Redis state verification', () => {
    it('should clean up all Redis keys for scheduled job', async () => {
      const schedulerId = 'redis-cleanup-test';
      const job = await testQueue.upsertJobScheduler(
        schedulerId,
        { pattern: '0 0 * * *' },
        { name: 'cleanup-task', data: {}, opts: {} }
      );

      expect(job).toBeDefined();
      if (!job || !job.id) {
        throw new Error('Job and job ID should have been created');
      }
      const jobId = job.id;

      // Get Redis client
      const client = await testQueue.client;

      // Verify keys exist before removal
      const jobKeyBefore = await client.exists(
        `${testQueue.opts.prefix}:${testQueue.name}:${jobId}`
      );
      const schedulerKeyBefore = await client.zscore(
        `${testQueue.opts.prefix}:${testQueue.name}:repeat`,
        schedulerId
      );

      expect(jobKeyBefore).toBe(1);
      expect(schedulerKeyBefore).not.toBeNull();

      // Remove scheduled job
      await request(serverAdapter.getRouter())
        .put(`/api/queues/${testQueue.name}/${jobId}/clean`)
        .expect(204);

      // Verify keys are removed
      const jobKeyAfter = await client.exists(
        `${testQueue.opts.prefix}:${testQueue.name}:${jobId}`
      );
      const schedulerKeyAfter = await client.zscore(
        `${testQueue.opts.prefix}:${testQueue.name}:repeat`,
        schedulerId
      );

      expect(jobKeyAfter).toBe(0);
      expect(schedulerKeyAfter).toBeNull();
    });
  });
});
