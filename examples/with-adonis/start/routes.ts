/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router';
import { AdonisAdapter } from '@bull-board/adonis';
import { createBullBoard } from '@bull-board/api';

const serverAdapter = new AdonisAdapter(router);

serverAdapter.setBasePath('/');

createBullBoard({
  queues: [],
  serverAdapter,
});
