import { createBullBoard } from '@bull-board/api';
import { H3Adapter } from '@bull-board/h3';

export default defineNitroPlugin((nitroApp) => {
  const serverAdapter = new H3Adapter();
  serverAdapter.setBasePath('/ui');
  createBullBoard({ queues: [], serverAdapter });

  const { handler } = serverAdapter.registerHandlers();
  nitroApp.router.use('/ui', handler);
  nitroApp.router.use('/ui/**', handler);
});
