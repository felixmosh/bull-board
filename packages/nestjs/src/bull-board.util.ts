import {
  BullBoardExpressAdapter,
  BullBoardFastifyAdapter,
  BullBoardNodeAdapter,
  BullBoardServerAdapter,
} from './bull-board.types';

export const isFastifyAdapter = (
  adapter: BullBoardServerAdapter
): adapter is BullBoardFastifyAdapter => {
  return 'registerPlugin' in adapter;
};

export const isExpressAdapter = (
  adapter: BullBoardServerAdapter
): adapter is BullBoardExpressAdapter => {
  return 'getRouter' in adapter;
};

export const isNodeAdapter = (adapter: BullBoardServerAdapter): adapter is BullBoardNodeAdapter => {
  return 'handle' in adapter && typeof adapter.handle === 'function';
};
