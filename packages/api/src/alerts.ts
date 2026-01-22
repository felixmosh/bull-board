import { BaseAdapter } from './queueAdapters/base';
import { BoardOptions, AlertsConfig, Status } from '../typings/app';

export class QueueAlarms {
  private config: AlertsConfig = {};
  private onAlert?: NonNullable<BoardOptions['queueAlerts']>['onAlert'];
  private checkInterval: number = 60 * 1000;
  private intervalId?: NodeJS.Timeout;
  private queues: Map<string, BaseAdapter>;

  constructor(queues: Map<string, BaseAdapter>, options?: BoardOptions['queueAlerts']) {
    this.queues = queues;
    if (options) {
      this.config = options.config || {};
      this.onAlert = options.onAlert;
      this.checkInterval = options.checkInterval || this.checkInterval;
      this.start();
    }
  }

  public start() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Only start if we have some config
    if (Object.keys(this.config).length === 0) return;

    this.intervalId = setInterval(async () => {
      await this.checkAlerts();
    }, this.checkInterval);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async checkAlerts() {
    const defaultDetails = this.config['default'] || {};

    for (const [name, queue] of this.queues) {
      const queueDetails = this.config[name] || {};
      
      // If no config for this queue and no default config, skip
      if (Object.keys(queueDetails).length === 0 && Object.keys(defaultDetails).length === 0) {
        continue;
      }

      try {
        const counts = await queue.getJobCounts();
        
        // We need to check all statuses that have configuration
        // Merge keys from default and specific queue config
        // NOTE: This simple merge implies we check statuses that exist in either default or queue config
        // We aren't strictly iterating over all possible statuses, but rather what is configured.
        
        // Combine keys safely
        const statusesToCheck = new Set([
            ...Object.keys(defaultDetails),
            ...Object.keys(queueDetails)
        ]);
        
        // Remove 'steps' from the set as it is not a status
        statusesToCheck.delete('steps');

        for (const statusKey of statusesToCheck) {
           const status = statusKey as Status;
           
           // Determine config for this status
           // Priority: Queue Specific Status Config -> Default Status Config
           const statusConfig = (queueDetails as any)[status] || (defaultDetails as any)[status];
           
           if (!statusConfig) continue; // Should not happen given logic above but safety first

           const threshold = statusConfig.count;
           
           if (typeof threshold !== 'number' || threshold === Infinity) continue;

           // Determine steps
           // Priority: Queue Specific Status Config -> Queue Specific Default -> Default Status Config -> Default Global Steps -> 1
           const steps = statusConfig.steps || queueDetails.steps || defaultDetails.steps || 1;

           const currentCount = (counts as any)[status];
           
           if (typeof currentCount === 'number' && currentCount > threshold) {
              // Check steps condition
              // Alert if we are exactly at threshold + N * steps
              // Example: Threshold 10, Steps 5.
              // 15 -> (15-10) % 5 === 0 -> Alert
              // 16 -> (16-10) % 5 !== 0 -> No Alert
              
              if ((currentCount - threshold) % steps === 0) {
                  if (this.onAlert) {
                      this.onAlert({
                          queueName: name,
                          status: status,
                          count: currentCount,
                          threshold: threshold
                      });
                  }
              }
           }
        }
      } catch (e) {
        console.error(`[BullBoard] Error checking alert for queue ${name}:`, e);
      }
    }
  }
}
