# Link jobs to your own admin

If your jobs exist in your own admin app too (an order, an email, a rendered report), you can link each dashboard job card to the corresponding page in your app.

Pass `externalJobUrl` to the queue adapter:

```ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const adapter = new BullMQAdapter(ordersQueue, {
  externalJobUrl: (job) => ({
    displayText: `Order ${job.data.orderId}`,
    href: `https://admin.example.com/orders/${job.data.orderId}`,
  }),
});
```

The function receives the job's JSON representation and returns `{ href, displayText? }`. The dashboard adds a link next to the job name pointing at your URL.

Useful when debugging from the dashboard and you want to jump straight to the real-world record.
