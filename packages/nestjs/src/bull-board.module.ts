import { DynamicModule, Module, Provider} from "@nestjs/common";
import { BullBoardFeatureModule } from "./bull-board.feature-module";
import { BullBoardRootModule } from "./bull-board.root-module";
import { BULL_BOARD_QUEUES } from "./bull-board.constants";
import { BullBoardModuleOptions, BullBoardQueueOptions, BullBoardQueueAsyncOptions } from "./bull-board.types";

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

  static forFeatureAsync(options: BullBoardQueueAsyncOptions): DynamicModule {
    const provider: Provider = this.createAsyncProviders(options);
    return {
      imports: options.imports,
      module: BullBoardFeatureModule,
      providers: [provider, BullBoardFeatureModule],
      exports: [provider],
    };
  }

  private static createAsyncProviders(options: BullBoardQueueAsyncOptions): Provider {
    return {
      provide: BULL_BOARD_QUEUES,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };
  }
}
