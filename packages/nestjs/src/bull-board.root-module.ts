import { DynamicModule, Inject, MiddlewareConsumer, Module, NestModule, Provider } from "@nestjs/common";
import { createBullBoard } from "@bull-board/api";
import { BULL_BOARD_ADAPTER, BULL_BOARD_INSTANCE, BULL_BOARD_OPTIONS } from "./bull-board.constants";
import { BullBoardModuleOptions, BullBoardServerAdapter } from "./bull-board.types";
import { ApplicationConfig, HttpAdapterHost } from "@nestjs/core";
import { isExpressAdapter, isFastifyAdapter } from "./bull-board.util";

@Module({})
export class BullBoardRootModule implements NestModule {

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly applicationConfig: ApplicationConfig,
    @Inject(BULL_BOARD_ADAPTER) private readonly adapter: BullBoardServerAdapter,
    @Inject(BULL_BOARD_OPTIONS) private readonly options: BullBoardModuleOptions
  ) {
  }

  configure(consumer: MiddlewareConsumer): any {
    const globalPrefix = this.applicationConfig.getGlobalPrefix() || '';
    this.adapter.setBasePath(`${ globalPrefix }${ this.options.route }`);

    if (isExpressAdapter(this.adapter)) {
      return consumer
        .apply(this.options.middleware, this.adapter.getRouter())
        .forRoutes(this.options.route);
    }

    if (isFastifyAdapter(this.adapter)) {
      this.adapterHost.httpAdapter
        .getInstance()
        .register(this.adapter.registerPlugin(), {prefix: this.options.route});

      return consumer
        .apply(this.options.middleware)
        .forRoutes(this.options.route);
    }
  }

  static forRoot(options: BullBoardModuleOptions): DynamicModule {
    const serverAdapter = new options.adapter();

    const bullBoardProvider: Provider = {
      provide: BULL_BOARD_INSTANCE,
      useFactory: () => createBullBoard({
        queues: [],
        serverAdapter: serverAdapter,
        options: options.boardOptions,
      })
    };

    const serverAdapterProvider: Provider = {
      provide: BULL_BOARD_ADAPTER,
      useFactory: () => serverAdapter
    };

    const optionsProvider: Provider = {
      provide: BULL_BOARD_OPTIONS,
      useValue: options
    };

    return {
      module: BullBoardRootModule,
      global: true,
      imports: [],
      providers: [
        serverAdapterProvider,
        optionsProvider,
        bullBoardProvider
      ],
      exports: [
        serverAdapterProvider,
        bullBoardProvider,
        optionsProvider
      ],
    };
  }
}