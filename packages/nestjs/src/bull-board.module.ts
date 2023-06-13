import { DynamicModule, Module} from "@nestjs/common";
import { BullBoardFeatureModule } from "./bull-board.feature-module";
import { BullBoardRootModule } from "./bull-board.root-module";
import { BULL_BOARD_QUEUES } from "./bull-board.constants";
import { BullBoardModuleOptions, BullBoardQueueOptions } from "./bull-board.types";

@Module({})
export class BullBoardModule {

  static forFeature(...queues: BullBoardQueueOptions[]): DynamicModule {
    return {
      module: BullBoardFeatureModule,
      providers: [
        {
          provide: BULL_BOARD_QUEUES,
          useValue: queues
        }
      ]
    };
  }

  static forRoot(options: BullBoardModuleOptions): DynamicModule {
    return {
      module: BullBoardModule,
      imports: [ BullBoardRootModule.forRoot(options) ],
      exports: [ BullBoardRootModule ],
    };
  }
}