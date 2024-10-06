import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { kujiraQueryClient } from "kujira.js/lib/cjs/queryClient.js";
import { Document } from "mongoose";

import { EPAYMENT_STATUS } from "./payment.constant";

export interface IPaymentModel extends Document {
  userId?: string;
  walletAddress?: string;
  type?: string;
  amount: number;
  denom?: string;
  txHash?: string;
  status?: EPAYMENT_STATUS;
}

export interface IClient {
  tmClient: Tendermint37Client;
  querier: ReturnType<typeof kujiraQueryClient>;
}
