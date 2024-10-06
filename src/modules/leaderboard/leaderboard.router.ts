import actionHandler from "@/middleware/action-handler";
import checkPermissions from "@/middleware/check-permissions";
import { ROLE } from "@/modules/user/user.constant";
import { BaseRouter } from "@/utils/base";

import { LeaderboardController } from ".";

export default class LeaderboardRouter extends BaseRouter {
  private leaderboardController: LeaderboardController;

  constructor() {
    super();

    this.leaderboardController = new LeaderboardController();
    this.routes();
  }

  public routes(): void {
    this.router.get(
      "/",
      checkPermissions({ roles: [ROLE.ADMIN] }),
      actionHandler(this.leaderboardController.getAll)
    );
  }
}
