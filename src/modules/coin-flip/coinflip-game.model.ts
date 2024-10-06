// Require Dependencies
import mongoose, { model } from "mongoose";

import { ICoinflipGameModel } from "./coinflip-game.interface";

// Setup Coinflip Schema
const CoinflipGameSchema = new mongoose.Schema(
  {
    // Basic fields
    betAmount: Number, // User bet amount
    denom: {
      type: String,
      default: "usk",
    },
    betCoinsCount: {
      // User bet number of coins
      type: Number,
      default: 1,
    },
    betSide: {
      // User bet side  0: front, 1: back
      type: Boolean,
      default: 0,
    },
    betSideCount: {
      // User bet number of the selected side of coins
      type: Number,
      default: 1,
    },

    // Provably Fair fields
    privateSeed: String,
    privateHash: String,
    publicSeed: {
      type: String,
      default: null,
    },
    randomModule: {
      type: Number,
      default: null,
    },

    isEarn: {
      type: Boolean, // 0: failed, 1: success
      default: null,
    },

    // UserID of who created this game
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Indicates if the bot was called or not
    isBotCalled: {
      type: Boolean,
      default: false,
    },

    // Game status
    status: {
      type: Number,
      default: 1,
      /**
       * Status list:
       *
       * 1 = Waiting
       * 2 = Rolling
       * 3 = Ended
       */
    },

    // When game was created
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    minimize: false,
    timestamps: true,
    versionKey: false,
  }
);

export default model<ICoinflipGameModel>("CoinflipGame", CoinflipGameSchema);
