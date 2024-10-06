import actionHandler from "@/middleware/action-handler";
import checkPermissions from "@/middleware/check-permissions";
import validateSchema from "@/middleware/validate-schema";
import { BaseRouter } from "@/utils/base";
import * as mapProperty from "@/utils/interfaces";

import { ROLE } from "../user/user.constant";
import TraitController from "./trait.controller";
import * as validateTrait from "./trait.validate";

export default class TraitRouter extends BaseRouter {
  private traitController: TraitController;

  constructor() {
    super();
    this.traitController = new TraitController();
    this.routes();
  }

  public routes(): void {
    this.router.post(
      "/",
      checkPermissions({ roles: [ROLE.ADMIN] }),
      validateSchema(validateTrait.createValidate, mapProperty.getBody),
      actionHandler(this.traitController.create, mapProperty.getBody)
    );

    this.router.get(
      "/kart/currency",
      actionHandler(this.traitController.getKartCurrency, mapProperty.getQuery)
    );

    this.router.get(
      "/kart/total-stake",
      actionHandler(
        this.traitController.getKartTotalStake,
        mapProperty.getQuery
      )
    );

    this.router.get(
      "/stake/total-reward",
      actionHandler(
        this.traitController.getTotalRewardAmount,
        mapProperty.getQuery
      )
    );
  }
}
