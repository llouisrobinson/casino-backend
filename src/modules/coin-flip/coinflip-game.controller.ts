import { FilterQuery } from "mongoose";

import { CustomError } from "@/utils/helpers";
import * as localizations from "@/utils/localizations";
import ILocalization from "@/utils/localizations/localizations.interface";

import { CoinflipGameService, ICoinflipGameModel } from ".";

export class CoinflipGameController {
  // Services
  private coinflipGameService: CoinflipGameService;

  // Diff services
  private localizations: ILocalization;

  constructor() {
    this.coinflipGameService = new CoinflipGameService();

    this.localizations = localizations["en"];
  }

  public getAll = async () => {
    const coinflipGameFilter = <FilterQuery<ICoinflipGameModel>>{};
    const [item, count] = await Promise.all([
      this.coinflipGameService.get(coinflipGameFilter),
      this.coinflipGameService.getCount(coinflipGameFilter),
    ]);

    return {
      item,
      count,
    };
  };

  public getByName = async (name) => {
    const coinflipGame = await this.coinflipGameService.getItem({ name });

    // need add to localizations
    if (!coinflipGame) {
      throw new CustomError(404, "Coinflip game not found");
    }

    return coinflipGame;
  };

  public getById = async (coinflipGameId) => {
    const coinflipGame =
      await this.coinflipGameService.getItemById(coinflipGameId);

    // need add to localizations
    if (!coinflipGame) {
      throw new CustomError(404, "Coinflip game not found");
    }

    return coinflipGame;
  };

  public create = async (coinflipGame) => {
    try {
      return await this.coinflipGameService.create(coinflipGame);
    } catch (error) {
      if (error.code === 11000) {
        throw new CustomError(409, this.localizations.ERRORS.OTHER.CONFLICT);
      }

      throw new Error(this.localizations.ERRORS.OTHER.SOMETHING_WENT_WRONG);
    }
  };

  public update = async ({ id }, coinflipGameData) => {
    try {
      const coinflipGame = await this.coinflipGameService.updateById(
        id,
        coinflipGameData
      );

      // need add to localizations
      if (!coinflipGame) {
        throw new CustomError(404, "Coinflip game not found");
      }

      return coinflipGame;
    } catch (error) {
      if (error.code === 11000) {
        throw new CustomError(409, this.localizations.ERRORS.OTHER.CONFLICT);
      } else if (error.status) {
        throw new CustomError(error.status, error.message);
      } else {
        throw new Error(this.localizations.ERRORS.OTHER.SOMETHING_WENT_WRONG);
      }
    }
  };

  public delete = async ({ id }) => {
    const coinflipGame = await this.coinflipGameService.deleteById(id);

    // need add to localizations
    if (!coinflipGame) {
      throw new CustomError(404, "Coinflip game not found");
    }

    return coinflipGame;
  };
}
