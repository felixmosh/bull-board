import { DynamicModule, Inject, MiddlewareConsumer, Module, NestModule, Provider } from "@nestjs/common";
import { createBullBoard } from "@bull-board/api";
import { BULL_BOARD_ADAPTER, BULL_BOARD_INSTANCE, BULL_BOARD_OPTIONS } from "./bull-board.constants";
import { BullBoardModuleAsyncOptions, BullBoardModuleOptions, BullBoardServerAdapter } from "./bull-board.types";
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
    const addForwardSlash = (path: string) => {
      return path.startsWith('/') || path === '' ? path : `/${path}`;
    };
    const prefix = addForwardSlash(this.applicationConfig.getGlobalPrefix() + this.options.route);

    this.adapter.setBasePath(prefix);

    if (isExpressAdapter(this.adapter)) {
      return consumer
        .apply(this.options.middleware, this.adapter.getRouter())
        .forRoutes(this.options.route);
    }

    if (isFastifyAdapter(this.adapter)) {
      this.adapterHost.httpAdapter
        .getInstance()
        .register(this.adapter.registerPlugin(), { prefix });

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

  static forRootAsync(options: BullBoardModuleAsyncOptions): DynamicModule {
    const bullBoardProvider: Provider = {
      provide: BULL_BOARD_INSTANCE,
      useFactory: (options: BullBoardModuleOptions, adapter: BullBoardServerAdapter) => createBullBoard({
        queues: [],
        serverAdapter: adapter,
        options: options.boardOptions,
      }),
      inject: [BULL_BOARD_OPTIONS, BULL_BOARD_ADAPTER]
    };

    const serverAdapterProvider: Provider = {
      provide: BULL_BOARD_ADAPTER,
      useFactory: (options: BullBoardModuleOptions) => new options.adapter(),
      inject: [BULL_BOARD_OPTIONS]
    };

    const optionsProvider: Provider = {
      provide: BULL_BOARD_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject
    }

    return {
      module: BullBoardRootModule,
      global: true,
      imports: options.imports,
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