import jwt, { JwtPayload } from "jsonwebtoken";
import _ from "lodash";
import mongoose from "mongoose";
import { Event as SocketEvent, Namespace, Socket } from "socket.io";

import { SITE_USER_ID, TOKEN_SECRET } from "@/config";
import { SiteTransactionService } from "@/modules/site-transaction";
import { IUserModel } from "@/modules/user/user.interface";
import UserService from "@/modules/user/user.service";
import {
  generateCoinflipRandom,
  generatePrivateSeedHashPair,
  probabilityXOrMoreHeads,
} from "@/utils/crypto/random";
import * as localizations from "@/utils/localizations";
import ILocalization from "@/utils/localizations/localizations.interface";
import logger from "@/utils/logger";

import { CCoinflipConfig } from "../coinflip-game.constant";
import { ICoinflipGameModel } from "../coinflip-game.interface";
import { CoinflipGameService } from "../coinflip-game.service";
import { TNewCoinflipGamePayload } from "../coinflip-game.types";

export class CoinflipGameSocketController {
  // Services
  private coinflipGameService: CoinflipGameService;
  private userService: UserService;
  private siteTransactionService: SiteTransactionService;

  // Diff services
  private localizations: ILocalization;
  // Logger config
  private logoPrefix: string = "[Coinflip Game UserSocket]::: ";

  // Socket setting
  private socketNameSpace: Namespace;

  // Socket
  private socket: Socket;

  // User status
  private loggedIn = false;
  private user: IUserModel | null = null;
  private newGame: ICoinflipGameModel | null = null;

  constructor() {
    this.coinflipGameService = new CoinflipGameService();
    this.userService = new UserService();
    this.siteTransactionService = new SiteTransactionService();

    this.localizations = localizations["en"];
  }

  public setSocketNamespace = (namespace: Namespace) => {
    this.socketNameSpace = namespace;
  };

  public setSocket = (socket: Socket) => {
    this.socket = socket;
  };

  public initializeSubscribe = async () => { };

  public authHandler = async (token: string) => {
    if (!token) {
      this.loggedIn = false;
      this.user = null;
      return this.socket.emit(
        "error",
        "No authentication token provided, authorization declined"
      );
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, TOKEN_SECRET) as JwtPayload;

      const user = await this.userService.getItem({ _id: decoded.userId });

      if (user) {
        if (parseInt(user.banExpires) > new Date().getTime()) {
          this.loggedIn = false;
          this.user = null;
          this.socket.emit("user banned");
        } else {
          this.loggedIn = true;
          this.user = user;

          this.socket.join(String(user._id));
          logger.info(
            this.logoPrefix +
            "User connect userId: " +
            user._id +
            " socketId: " +
            this.socket.id
          );
          // this.socket.emit("notify-success", "Successfully authenticated!");
        }
      }
      // this.socket.emit("notify-error", "Authentication token is not valid");
    } catch (error) {
      this.loggedIn = false;
      logger.error(this.logoPrefix + "auth error handle " + error);
      this.user = null;
      this.socket.emit("notify-error", "Authentication token is not valid");
    }
  };

  public banStatusCheckMiddleware = async (
    _packet: SocketEvent,
    next: (err?: any) => void
  ) => {
    if (this.loggedIn && this.user) {
      try {
        // Check if user is banned
        if (
          this.user &&
          parseInt(this.user.banExpires) > new Date().getTime()
        ) {
          return this.socket.emit("user banned");
        } else {
          return next();
        }
      } catch (error) {
        return this.socket.emit("user banned");
      }
    } else {
      return next();
    }
  };

  public createNewCoinflipgameHandler = async (
    data: TNewCoinflipGamePayload
  ) => {
    if (!this.loggedIn) {
      return this.socket.emit("game-creation-error", "You are not logged in!");
    }

    if (
      parseFloat(data.betAmount.toFixed(2)) < CCoinflipConfig.minBetAmount ||
      parseFloat(data.betAmount.toFixed(2)) > CCoinflipConfig.maxBetAmount
    ) {
      return this.socket.emit(
        "game-creation-error",
        `Your bet must be a minimum of ${CCoinflipConfig.minBetAmount} credits and a maximum of ${CCoinflipConfig.maxBetAmount} credits!`
      );
    }

    if (
      data.betSideCount < CCoinflipConfig.minBetCoinsCount ||
      data.betSideCount > CCoinflipConfig.maxBetCoinsCount
    ) {
      return this.socket.emit(
        "game-creation-error",
        `Invalid bet Coin Count! Must be between ${CCoinflipConfig.minBetCoinsCount} and ${CCoinflipConfig.maxBetCoinsCount}`
      );
    }

    if (
      (data.betCoinsCount > 8 && data.betSideCount < 3) ||
      (data.betCoinsCount > 5 && data.betSideCount < 2) ||
      data.betSideCount < 1
    ) {
      return this.socket.emit(
        "game-creation-error",
        "Invalid bet Coin Side Count!"
      );
    }

    try {
      if (!this.user) {
        return this.socket.emit(
          "game-creation-error",
          "Your account has an betting restriction."
        );
      }

      // Get user from database
      this.user = await this.userService.getItemById(this.user._id);
      const userId = this.user._id.toString();
      // If user is self-excluded

      if (this.user && this.user.selfExcludes.coinflip > Date.now()) {
        return this.socket.emit(
          "game-creation-error",
          `You have self-excluded yourself for another ${((this.user.selfExcludes.coinflip - Date.now()) / 3600000).toFixed(1)} hours.`
        );
      }

      // If user has restricted bets
      if (this.user && this.user.betsLocked) {
        return this.socket.emit(
          "game-creation-error",
          "Your account has an betting restriction."
        );
      }

      // If user can afford this bet
      if (
        (this.user!.wallet?.[data.denom] ?? 0) <
        parseFloat(data.betAmount.toFixed(2))
      ) {
        console.log(
          typeof this.user!.wallet?.[data.denom],
          typeof parseFloat(data.betAmount.toFixed(2))
        );
        return this.socket.emit(
          "game-creation-error",
          "You can't afford this bet!"
        );
      }

      this.newGame = await this.coinflipGameService.create(data);

      const newWalletValue =
        (this.user!.wallet?.[data.denom] || 0) -
        Math.abs(parseFloat(data.betAmount.toFixed(2)));
      const newWagerValue =
        (this.user!.wager?.["coinflip"]?.[data.denom] || 0) +
        Math.abs(parseFloat(data.betAmount.toFixed(2)));
      const newWagerNeededForWithdrawValue =
        (this.user!.wagerNeededForWithdraw?.[data.denom] || 0) +
        Math.abs(parseFloat(data.betAmount.toFixed(2)));
      const newLeaderboardValue =
        (this.user!.leaderboard?.["coinflip"]?.[data.denom]?.betAmount || 0) +
        Math.abs(parseFloat(data.betAmount.toFixed(2)));

      this.user = await this.userService.updateById(userId, {
        $set: {
          [`wallet.${data.denom}`]: newWalletValue,
          [`wager.coinflip.${data.denom}`]: newWagerValue,
          [`wagerNeededForWithdraw.${data.denom}`]:
            newWagerNeededForWithdrawValue,
          [`leaderboard.coinflip.${data.denom}.betAmount`]: newLeaderboardValue,
        },
      });

      // Remove bet amount from user's balance
      const newWalletTxData = {
        userId: new mongoose.Types.ObjectId(userId),
        amount: -Math.abs(parseFloat(data.betAmount.toFixed(2))),
        reason: "Coinflip Bet",
        extraData: {
          coinflipGameId: new mongoose.Types.ObjectId(
            this.newGame._id.toString()
          ),
        },
      };

      await this.siteTransactionService.create(newWalletTxData);

      // Update local wallet
      this.socket.emit("update-wallet", newWalletValue, data.denom);

      // Calculate house edge
      const houseEdge =
        parseFloat(data.betAmount.toFixed(2)) * CCoinflipConfig.feePercentage;

      // Generate pre-roll provably fair data
      const provablyData = await generatePrivateSeedHashPair();

      // Basic fields
      this.newGame.betAmount = parseFloat(data.betAmount.toFixed(2));
      this.newGame.betCoinsCount = data.betCoinsCount; // How many percentage of the joining cost does the creator pay (only for private games)
      this.newGame.betSide = data.betSide; // Custom invite link (only for private games)
      this.newGame.betSideCount = data.betSideCount; // Total Bet amount of all players

      // // Provably Fair fields
      this.newGame.privateSeed = provablyData.seed;
      this.newGame.privateHash = provablyData.hash;

      // // UserID of who created this game
      this.newGame.user = userId;

      // // Save the document
      await this.newGame.save();

      // // Construct a object without seed
      const parsedGame = { ...this.newGame.toObject() };
      delete parsedGame.privateSeed;

      // Notify clients
      this.socket.emit("new-coinflip-game", parsedGame);
      this.socket.emit("notify-success", "Successfully created a new game!");

      logger.log(
        "Coinflip >> Created a new game",
        this.newGame._id.toString(),
        "worth",
        `$${parseFloat(data.betAmount.toFixed(2))}.`,
        "Coins Count:",
        data.betCoinsCount
      );

      // conflip game-rolling and generate random data
      this.socket.emit("coinflipgame-rolling", {
        game_id: this.newGame._id.toString(),
        animation_time: CCoinflipConfig.clientAnimationTime,
      });
      logger.log("Coinflip >> Rolling game", this.newGame._id.toString());

      // Wait for the animation
      setTimeout(async () => {
        // Generate random data
        const randomData = await generateCoinflipRandom(
          this.newGame._id.toString(),
          this.newGame.privateSeed!,
          this.newGame.betCoinsCount
        );

        //   // Calculate winner
        const { isEarn, randomResultArray } = await this.CalculateWon(
          this.newGame.betCoinsCount,
          this.newGame.betSide,
          this.newGame.betSideCount,
          randomData.module
        );

        //   // Update document
        this.newGame.isEarn = isEarn;
        this.newGame.randomModule = randomData.module;

        //   // Calculate profit
        const probability = await probabilityXOrMoreHeads(
          this.newGame.betSideCount,
          this.newGame.betCoinsCount
        );
        const profit = this.newGame.betAmount / probability;
        const houseRake = profit * CCoinflipConfig.feePercentage;
        const feeMultiplier = 1 - CCoinflipConfig.feePercentage;
        const wonAmount = profit * feeMultiplier;

        console.log({
          winAmout: wonAmount,
          houseRake: houseRake,
          Profit: profit,
          probability: probability,
          feeMultiplier: feeMultiplier,
        });

        logger.log(
          "Coinflip >> Game",
          this.newGame._id.toString(),
          "rolled, winner:",
          this.user!.username,
          `(${probability * 100}%, profit: ${wonAmount}, house edge amount: ${houseRake})`
        );

        this.user = await this.userService.getItemById(userId);

        //   // Payout winner
        if (isEarn) {
          const newWalletValue =
            (this.user!.wallet?.[data.denom] || 0) +
            Math.abs(parseFloat(wonAmount.toFixed(2)));
          // const newLeaderboardBetValue =
          //   (this.user!.leaderboard?.["coinflip"]?.[data.denom]?.betAmount || 0) +
          //   Math.abs(parseFloat(data.betAmount.toFixed(2)));
          const newLeaderboardValue =
            (this.user!.leaderboard?.["coinflip"]?.[data.denom]?.winAmount ||
              0) + Math.abs(parseFloat(wonAmount.toFixed(2)));
          await this.userService.updateById(userId, {
            $set: {
              [`wallet.${data.denom}`]: newWalletValue,
              // [`leaderboard.coinflip.${data.denom}.betAmount`]: newLeaderboardBetValue,
              [`leaderboard.coinflip.${data.denom}.winAmount`]:
                newLeaderboardValue,
            },
          });
          const newWalletTxData = {
            userId: new mongoose.Types.ObjectId(userId),
            amount: Math.abs(parseFloat(wonAmount.toFixed(2))),
            reason: "Coinflip game win",
            extraData: {
              coinflipGameId: new mongoose.Types.ObjectId(
                this.newGame._id.toString()
              ),
            },
          };

          await this.siteTransactionService.create(newWalletTxData);

          this.socket.emit("update-wallet", newWalletValue, data.denom);
        }

        //   // Add revenue to the site wallet
        const siteuser = await this.userService.getSiteUserData();
        const newSiteWalletValue =
          (siteuser!.wallet?.[data.denom] || 0) +
          Math.abs(
            parseFloat(
              isEarn ? houseRake.toFixed(2) : data.betAmount.toFixed(2)
            )
          );

        await this.userService.updateById(SITE_USER_ID, {
          $set: {
            [`wallet.${data.denom}`]: newSiteWalletValue,
          },
        });

        //   // Notify clients
        this.socket.emit("coinflipgame-rolled", {
          _id: String(this.newGame._id),
          randomModule: randomData.module,
          coinflipResult: randomResultArray,
          isEarn: isEarn,
        });
        // Update local wallet
      }, CCoinflipConfig.clientAnimationTime);
    } catch (error) {
      console.log("Error while creating Coinflip game:", error);
      return this.socket.emit(
        "game-creation-error",
        "Your bet couldn't be placed: Internal server error, please try again later!"
      );
    }
  };

  public CalculateWon = async (
    betCoinsCount: number,
    betSide: boolean,
    betSideCount: number,
    randomModule: number
  ): Promise<{ isEarn: boolean; randomResultArray: boolean[] }> => {
    return new Promise((resolve, reject) => {
      try {
        // Convert the number to a binary string
        const binaryString = randomModule.toString(2);
        // Convert each binary character to a boolean and store in an array
        const paddedBinaryString = binaryString.padStart(betCoinsCount, "0");
        const booleanArray = Array.from(paddedBinaryString).map(
          (bit) => bit === "1"
        );

        const isEarn =
          booleanArray.filter((item) => item === betSide).length >=
          betSideCount;

        resolve({ isEarn, randomResultArray: booleanArray });
      } catch (error) {
        reject(error);
      }
    });
  };
}
