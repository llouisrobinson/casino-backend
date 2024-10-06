export const CCoinflipConfig = {
  minBetAmount: 0.1, // Min bet amount (in coins)
  maxBetAmount: 100000, // Max bet amount (in coins)
  feePercentage: 0.05, // House fee percentage
  minBetCoinsCount: 1, // Min bet coins count
  maxBetCoinsCount: 10, // Max bet coins count
  clientAnimationTime: 8500, // client animation time for coin flipping
};

export enum ECoinflipGameEvents {
  auth = "auth",
  createNewCoinflipgame = "create-new-coinflipgame",
}
