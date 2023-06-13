import { Inject } from '@nestjs/common';
import { BULL_BOARD_INSTANCE } from "./bull-board.constants";

export const InjectBullBoard = (): ParameterDecorator => Inject(BULL_BOARD_INSTANCE);