import {
  BullBoardExpressAdapter,
  BullBoardFastifyAdapter, BullBoardServerAdapter,
} from "./bull-board.types";

export const isFastifyAdapter = (adapter: BullBoardServerAdapter): adapter is BullBoardFastifyAdapter => {
  return 'registerPlugin' in adapter;
}

export const isExpressAdapter = (adapter: BullBoardServerAdapter): adapter is BullBoardExpressAdapter => {
  return 'getRouter' in adapter;
}