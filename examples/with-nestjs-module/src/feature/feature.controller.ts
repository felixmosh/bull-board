import { Controller, Get } from "@nestjs/common";
import { BullBoardInstance, InjectBullBoard } from "@bull-board/nestjs";

@Controller('my-feature')
export class FeatureController {

  constructor(
    //inject the bull-board instance using the provided decorator
    @InjectBullBoard() private readonly boardInstance: BullBoardInstance
  ) {
  }

  @Get()
  getFeature() {
    // You can do anything from here with the boardInstance for example:

    //this.boardInstance.replaceQueues();
    //this.boardInstance.addQueue();
    //this.boardInstance.setQueues();

    return 'ok';
  }

}