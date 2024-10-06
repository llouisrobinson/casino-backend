import checkPermissions from "@/middleware/check-permissions";
import { ROLE } from "@/modules/user/user.constant";
import { BaseRouter } from "@/utils/base";

import { CoinflipGameController } from ".";

export default class CoinflipGameRouter extends BaseRouter {
  private coinflipGameController: CoinflipGameController;

  constructor() {
    super();
    this.coinflipGameController = new CoinflipGameController();
    this.routes();
  }

  public routes(): void {
    this.router.get("/", checkPermissions({ roles: [ROLE.ADMIN] }));
  }
}
