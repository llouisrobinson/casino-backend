// need add model to mongo index file
import BaseService from "@/utils/base/service";
import { CoinflipGame } from "@/utils/db";

import { ICoinflipGameModel } from "./coinflip-game.interface";

export class CoinflipGameService extends BaseService<ICoinflipGameModel> {
  constructor() {
    super(CoinflipGame);
  }
}
