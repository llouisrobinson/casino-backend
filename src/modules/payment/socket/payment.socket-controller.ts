import { verifyADR36Amino } from "@keplr-wallet/cosmos";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Event as SocketEvent, Namespace, Socket } from "socket.io";

import { ADMIN_WALLET_ADDRESS, TOKEN_SECRET } from "@/config";
import { IUserModel } from "@/modules/user/user.interface";
import UserService from "@/modules/user/user.service";
import AESWrapper from "@/utils/encryption/aes-wrapper";
import { fromBase64 } from "@/utils/helpers/string-helper";
import logger from "@/utils/logger";

import {
  CDAILY_PAYMENT_LIMIT,
  CONETIME_PAYMENT_LIMIT,
  CSITE_PAYMENT_LIMIT,
  EPAYMENT_STATUS,
  EPaymentEvents,
} from "../payment.constant";
import { PaymentController } from "../payment.controller";
import { TSocketDepositParam, TSocketWithDrawParam } from "../payment.types";

class PaymentSocketHandler {
  private socket: Socket;
  private socketNameSpace: Namespace;
  private loggedIn = false;
  private user: IUserModel | null = null;
  private logoPrefix: string = "[Payment Socket Handler]::: ";
  private paymentController: PaymentController;
  private aesKey: Buffer;

  private userService: UserService;

  constructor(socketNameSpace: Namespace, socket: Socket) {
    this.userService = new UserService();
    this.paymentController = new PaymentController();

    this.socket = socket;
    this.socketNameSpace = socketNameSpace;
  }

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
      this.user = await this.userService.getItemById(decoded.userId);

      if (this.user) {
        if (parseInt(this.user.banExpires) > new Date().getTime()) {
          this.loggedIn = false;
          this.user = null;
          return this.socket.emit("user banned");
        } else {
          this.loggedIn = true;
          this.socket.join(String(this.user._id));
          logger.info(this.logoPrefix + "User connected: " + this.user._id);

          await this.getAdminWalletInfo();

          this.socketNameSpace
            .to(String(this.user._id))
            .emit("notify-success", "Authentication success");
        }
      }
    } catch (error) {
      this.loggedIn = false;
      logger.error(this.logoPrefix + "Auth error occured" + error);
      this.user = null;
      return this.socket.emit(
        "notify-error",
        "Authentication token is not valid"
      );
    }
  };

  public depositHandler = async (depositParamString: string) => {
    try {
      if (!this.loggedIn || !this.user?._id) {
        return this.socket.emit("notify-error", `You are not logged in!`);
      }

      const depositParam: TSocketDepositParam = JSON.parse(
        AESWrapper.decrypt(this.aesKey, depositParamString)
      );

      const isValid = verifyADR36Amino(
        "kujira",
        depositParam.address,
        `Deposit ${depositParam.amount} ${depositParam.currency.toUpperCase()} to Kartel`,
        fromBase64(depositParam.signedTx.pub_key.value),
        fromBase64(depositParam.signedTx.signature)
      );

      if (!isValid) {
        logger.error(
          this.logoPrefix +
            "Deposit failed" +
            "Invalid signature" +
            "user" +
            this.user._id +
            " deposit param:" +
            JSON.stringify(depositParam)
        );
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Deposit Failed`);
      }

      const resDeposit = await this.paymentController.userBalanceDeposit(
        depositParam,
        {
          userId: this.user._id,
          role: this.user.role,
          status: this.user.status,
        }
      );

      if (
        typeof resDeposit === "object" &&
        "status" in resDeposit &&
        resDeposit.status !== "success"
      ) {
        logger.error(
          this.logoPrefix +
            "Deposit failed" +
            "Invalid deposit parameters " +
            "user" +
            this.user._id +
            " deposit param:" +
            JSON.stringify(depositParam)
        );
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Deposit Failed`);
      }

      if (typeof resDeposit !== "object") {
        logger.error(
          this.logoPrefix +
            "Deposit failed" +
            "Invalid deposit parameters " +
            "user" +
            this.user._id +
            " deposit param:" +
            JSON.stringify(depositParam)
        );
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Deposit Failed`);
      }

      this.socketNameSpace
        .to(String(this.user._id))
        .emit(EPaymentEvents.paymentFailed, `Deposit Success`);
      return this.socketNameSpace
        .to(String(this.user._id))
        .emit(EPaymentEvents.updateBalance, {
          walletValue: resDeposit.data?.[depositParam.currency],
          denom: depositParam.currency,
        });
    } catch (error) {
      logger.error(this.logoPrefix + "Deposit failed" + error);
      return this.socket.emit(EPaymentEvents.paymentFailed, `Deposit Failed`);
    }
  };

  public withdrawHandler = async (withdrawParamString: string) => {
    try {
      const withdrawParam: TSocketWithDrawParam = JSON.parse(
        AESWrapper.decrypt(this.aesKey, withdrawParamString)
      );

      if (!this.loggedIn || !this.user?._id) {
        return this.socket.emit("notify-error", `You are not logged in!`);
      }

      if (this.user.signAddress !== withdrawParam.address) {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Connect withdraw wallet`);
      }

      const isValid = verifyADR36Amino(
        "kujira",
        withdrawParam.address,
        `Withdraw ${withdrawParam.amount} ${withdrawParam.currency.toUpperCase()} from Kartel`,
        fromBase64(withdrawParam.signedTx.pub_key.value),
        fromBase64(withdrawParam.signedTx.signature)
      );

      if (!isValid) {
        logger.error(
          this.logoPrefix +
            "Deposit failed" +
            "Invalid signature" +
            "user" +
            this.user._id +
            " withdraw param:" +
            JSON.stringify(withdrawParam)
        );
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Invalid withdraw signature`);
      }

      const adminBalanceAvaliable =
        await this.paymentController.getAdminBalanceWithdrwable();

      if (!adminBalanceAvaliable) {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Contact to admin`);
      }

      const oneTimeLimit =
        withdrawParam.currency === "usk"
          ? CONETIME_PAYMENT_LIMIT.usk
          : CONETIME_PAYMENT_LIMIT.kart;

      if (withdrawParam.amount > oneTimeLimit) {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Exceed withdraw limit`);
      }

      const isExistPendingWithdraw =
        await this.paymentController.getUserHavePendingWithdraw(this.user._id);

      if (isExistPendingWithdraw) {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Exceed daily limit`);
      }

      const userTodayWithdrawAmount =
        await this.paymentController.getUserTodayWithdraw(this.user._id);

      const avaliableTodayLimit = Number(
        withdrawParam.currency === "usk"
          ? CDAILY_PAYMENT_LIMIT.usk
          : CDAILY_PAYMENT_LIMIT.kart
      );
      const todayDenomAmount = Number(
        withdrawParam.currency === "usk"
          ? userTodayWithdrawAmount.usk
          : userTodayWithdrawAmount.kart
      );

      // Make pending tx
      if (withdrawParam.amount > avaliableTodayLimit - todayDenomAmount) {
        const user = await this.userService.getItemById(this.user._id);
        const updateParams = `wallet.${withdrawParam.currency}`;
        const walletValue = user?.wallet?.[withdrawParam.currency] ?? 0;
        const updateValue = walletValue - withdrawParam.amount;

        await this.userService.updateUserBalance(
          this.user._id,
          updateParams,
          updateValue
        );

        await this.paymentController.create({
          userId: this.user._id,
          walletAddress: withdrawParam.address,
          type: "Withdraw",
          denom: withdrawParam.currency,
          amount: withdrawParam.amount,
          status: EPAYMENT_STATUS.PENDING,
        });

        this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.updateBalance, {
            walletValue: updateValue,
            denom: withdrawParam.currency,
          });
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Withdrawal after 2 days`);
      }

      const resWithdraw = await this.paymentController.userBalanceWithdraw(
        withdrawParam,
        {
          userId: this.user._id,
          role: this.user.role,
          status: this.user.status,
        }
      );

      if (
        typeof resWithdraw === "object" &&
        "status" in resWithdraw &&
        resWithdraw.status !== "success"
      ) {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Withdraw Failed`);
      }

      if (typeof resWithdraw !== "object") {
        return this.socketNameSpace
          .to(String(this.user._id))
          .emit(EPaymentEvents.paymentFailed, `Withdraw Failed`);
      }

      this.socketNameSpace
        .to(String(this.user._id))
        .emit(EPaymentEvents.paymentFailed, `Withdraw Success`);
      return this.socketNameSpace
        .to(String(this.user._id))
        .emit(EPaymentEvents.updateBalance, {
          walletValue: resWithdraw.data?.[withdrawParam.currency],
          denom: withdrawParam.currency,
        });
    } catch (error) {
      logger.error(this.logoPrefix + "Withdraw failed" + error);
      return this.socket.emit(EPaymentEvents.paymentFailed, `Withdraw Failed`);
    }
  };

  public getAdminWalletInfo = async () => {
    try {
      if (!this.loggedIn || !this.user?._id) {
        return this.socket.emit("notify-error", `You are not logged in!`);
      }

      const address = ADMIN_WALLET_ADDRESS ?? "";
      this.aesKey = AESWrapper.generateKey();
      const encryptedAddress = AESWrapper.createAesMessage(
        this.aesKey,
        address
      );

      const adminRes = {
        address1: this.aesKey.toString("base64"),
        address2: encryptedAddress,
      };
      return this.socketNameSpace
        .to(String(this.user._id))
        .emit(EPaymentEvents.setAdminWallet, adminRes);
    } catch (error) {
      logger.error(this.logoPrefix + "Send message error occured" + error);
      return this.socket.emit(
        "notify-error",
        `An error is occured on withdarw!`
      );
    }
  };

  public banStatusCheckMiddleware = async (
    packet: SocketEvent,
    next: (err?: any) => void
  ) => {
    if (packet[0] === EPaymentEvents.login) {
      return next();
    }

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
      return this.socket.emit("user banned");
    }
  };

  public disconnectHandler = async () => {
    this.user = null;
  };
}

export default PaymentSocketHandler;
