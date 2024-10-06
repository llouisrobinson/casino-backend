import { FilterQuery } from "mongoose";

import { ADMIN_WALLET_ADDRESS } from "@/config";
import { CDENOM_TOKENS } from "@/constant/crypto";
import AESWrapper from "@/utils/encryption/aes-wrapper";
import { CustomError } from "@/utils/helpers";
import * as localizations from "@/utils/localizations";
import ILocalization from "@/utils/localizations/localizations.interface";
import logger from "@/utils/logger";

import { IAuthInfo } from "../auth/auth.types";
import UserService from "../user/user.service";
import {
  CSITE_PAYMENT_LIMIT,
  EPAYMENT_STATUS,
  IPaymentModel,
  TDayAmount,
} from ".";
import { PaymentService } from "./payment.service";

export class PaymentController {
  // Services
  private paymentService: PaymentService;
  private userService: UserService;

  // Diff services
  private localizations: ILocalization;

  constructor() {
    this.paymentService = new PaymentService();
    this.userService = new UserService();

    this.localizations = localizations["en"];
  }

  public getAll = async () => {
    const paymentFilter = <FilterQuery<IPaymentModel>>{};
    const [item, count] = await Promise.all([
      this.paymentService.get(paymentFilter),
      this.paymentService.getCount(paymentFilter),
    ]);

    return {
      item,
      count,
    };
  };

  public getByName = async (name) => {
    const payment = await this.paymentService.getItem({ name });

    // need add to localizations
    if (!payment) {
      throw new CustomError(404, "Payment not found");
    }

    return payment;
  };

  public getById = async (paymentId) => {
    const payment = await this.paymentService.getItemById(paymentId);

    // need add to localizations
    if (!payment) {
      throw new CustomError(404, "Payment not found");
    }

    return payment;
  };

  public create = async (payment: Partial<IPaymentModel>) => {
    try {
      return await this.paymentService.create(payment);
    } catch (error) {
      if (error.code === 11000) {
        throw new CustomError(409, this.localizations.ERRORS.OTHER.CONFLICT);
      }

      throw new Error(this.localizations.ERRORS.OTHER.SOMETHING_WENT_WRONG);
    }
  };

  public update = async ({ id }, paymentData) => {
    try {
      const payment = await this.paymentService.updateById(id, paymentData);

      // need add to localizations
      if (!payment) {
        throw new CustomError(404, "Payment not found");
      }

      return payment;
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
    const payment = await this.paymentService.deleteById(id);

    // need add to localizations
    if (!payment) {
      throw new CustomError(404, "Payment not found");
    }

    return payment;
  };

  public userBalanceWithdraw = async (
    { amount, currency, address },
    { userId }: IAuthInfo
  ) => {
    const withdrawParam = {
      address: address,
      amount: amount,
      tokenType: currency,
    };

    try {
      if (Object.keys(CDENOM_TOKENS).indexOf(currency) == -1) {
        throw new CustomError(409, "Balance type is not supported");
      }

      const user = await this.userService.getItemById(userId);
      const updateParams = `wallet.${currency}`;
      const walletValue = user?.wallet?.[currency] ?? 0;
      let updateValue = 0;

      if (walletValue < amount) {
        throw new CustomError(409, "not enough token balances");
      } else {
        updateValue = walletValue - amount;
        let updatedUser = await this.userService.updateUserBalance(
          userId,
          updateParams,
          updateValue
        );

        // user withdraw crypto to admin wallet
        try {
          const resPayment = await this.paymentService.balanceWithdraw(
            withdrawParam,
            userId
          );

          if (!resPayment) {
            throw new CustomError(409, "unable withdraw");
          }
        } catch {
          updatedUser = await this.userService.updateUserBalance(
            userId,
            updateParams,
            walletValue
          );
          logger.error(
            `[Payment failed] user: ${userId} paymentInfo: ${JSON.stringify(withdrawParam)}`
          );
        }

        logger.info(
          `[Payment success] user: ${userId} paymentInfo: ${JSON.stringify(withdrawParam)}`
        );
        return updatedUser;
      }
    } catch (error) {
      logger.error(
        `[Payment failed] user: ${userId} paymentInfo: ${JSON.stringify(withdrawParam)}`
      );
      throw new CustomError(409, "updating balance error");
    }
  };

  public getAdminBalanceWithdrwable = async () => {
    const adminBalance = await this.paymentService.getAdminBalance();

    if (
      adminBalance.kart <= CSITE_PAYMENT_LIMIT.kart ||
      adminBalance.usk <= CSITE_PAYMENT_LIMIT.usk
    ) {
      return false;
    }

    return true;
  };

  public getAddress = async () => {
    try {
      const address = ADMIN_WALLET_ADDRESS ?? "";
      const aesKey = AESWrapper.generateKey();
      const encryptedAddress = AESWrapper.createAesMessage(aesKey, address);
      return {
        encryptedAddress,
        aesKey: aesKey.toString("base64"),
      };
    } catch (ex) {
      const errorMessage = `Error encrypting address: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return {
        error: errorMessage,
      };
    }
  };

  public userBalanceDeposit = async (
    { amount, currency, address, txHash },
    { userId }: IAuthInfo
  ) => {
    const depositParam = {
      address: address,
      txHash: txHash ?? "",
      amount: amount,
      tokenType: currency,
    };

    try {
      if (Object.keys(CDENOM_TOKENS).indexOf(currency) == -1) {
        throw new CustomError(409, "Balance type is not supported");
      }

      const user = await this.userService.getItemById(userId);
      const updateParams = `wallet.${currency}`;

      const walletValue = user?.wallet?.[currency] ?? 0;
      let updateValue = 0;

      // user deposit crypto to admin wallet
      const resPayment = await this.paymentService.balanceDeposit(
        depositParam,
        userId
      );

      if (!resPayment) {
        logger.error(
          `[Payment failed] deposit user - unable deposit: ${userId} paymentInfo: ${JSON.stringify(depositParam)}`
        );
        throw new CustomError(409, "unable deposit");
      }

      logger.info(
        `[Payment success] deposit user: ${userId} paymentInfo: ${JSON.stringify(depositParam)}`
      );

      updateValue = walletValue + amount;
      return await this.userService.updateUserBalance(
        userId,
        updateParams,
        updateValue
      );
    } catch (error) {
      logger.error(
        `[Payment failed] deposit user: ${userId} paymentInfo: ${JSON.stringify(depositParam)}`
      );
      throw new CustomError(409, "updating balance error");
    }
  };

  public getUserTodayWithdraw = async (userId): Promise<TDayAmount> => {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const todayAmounts = await this.paymentService.aggregateByPipeline([
      {
        $match:
        /**
         * query: The query in MQL.
         */
        {
          userId: String(userId),
          type: "Withdraw",
          status: {
            $ne: {
              $or: ["PENDING", "PENDING_SUCCESS"],
            },
          },
          createdAt: {
            $gte: startOfDay,
          },
        },
      },
      {
        $group:
        /**
         * _id: The id of the group.
         * fieldN: The first field name.
         */
        {
          _id: "$denom",
          totalAmount: {
            $sum: "$amount",
          },
        },
      },
      {
        $group:
        /**
         * _id: The id of the group.
         * fieldN: The first field name.
         */
        {
          _id: null,
          result: {
            $push: {
              k: "$_id",
              v: "$totalAmount",
            },
          },
        },
      },
      {
        $replaceRoot:
        /**
         * replacementDocument: A document or string.
         */
        {
          newRoot: {
            $arrayToObject: "$result",
          },
        },
      },
    ]);

    if (todayAmounts.length > 0) {
      return todayAmounts[0];
    } else {
      return {
        usk: 0,
        kart: 0,
      };
    }
  };

  public getUserHavePendingWithdraw = async (userId): Promise<boolean> => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const tomorrowDay = new Date(today);
      tomorrowDay.setDate(today.getDate() + 1);
      tomorrowDay.setHours(0, 0, 0, 0);

      const todayPending = await this.paymentService.aggregateByPipeline([
        {
          $match:
          /**
           * query: The query in MQL.
           */
          {
            userId: String(userId),
            type: "Withdraw",
            status: EPAYMENT_STATUS.PENDING,
            createdAt: {
              $gte: startOfDay,
              $lte: tomorrowDay,
            },
          },
        },
      ]);

      if (todayPending.length > 0) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  };

  public getActivePendingWithdrawList = async (): Promise<
    Array<Partial<IPaymentModel>>
  > => {
    try {
      const now = new Date();
      const endOfDuration = new Date(now);
      endOfDuration.setDate(now.getDate() - 2);
      endOfDuration.setHours(now.getHours() + 1, 0, 0, 0);
      const startOfDuration = new Date(endOfDuration);
      startOfDuration.setHours(now.getHours(), 0, 0, 0);

      const targetPending = await this.paymentService.aggregateByPipeline([
        {
          $match:
          /**
           * query: The query in MQL.
           */
          {
            type: "Withdraw",
            status: EPAYMENT_STATUS.PENDING,
            createdAt: {
              $gte: startOfDuration,
              $lte: endOfDuration,
            },
          },
        },
      ]);
      return targetPending;
    } catch {
      return [];
    }
  };
}
