import _ from "lodash";
import { Event as SocketEvent, Namespace, Server, Socket } from "socket.io";

import { ESOCKET_NAMESPACE } from "@/constant/enum";
import throttleConnections from "@/utils/socket/throttler";

import { ECoinflipGameEvents } from "../coinflip-game.constant";
import { TNewCoinflipGamePayload } from "../coinflip-game.types";
import { CoinflipGameSocketController } from "./coinflip-game.socket-controller";

class CoinflipGameSocketListener {
  private socketServer: Namespace;
  private logoPrefix: string = "[Coinflip Game ServerSocket]::: ";

  constructor(socketServer: Server) {
    // Socket init
    this.socketServer = socketServer.of(ESOCKET_NAMESPACE.coinflip);

    // Function init
    this.initializeListener();
    this.subscribeListener();
  }

  private subscribeListener(): void {
    this.socketServer.on("connection", (socket: Socket) => {
      const coinflipGameController = new CoinflipGameSocketController();
      coinflipGameController.setSocketNamespace(this.socketServer);
      coinflipGameController.setSocket(socket);
      coinflipGameController.initializeSubscribe();

      // Auth handler
      socket.on(ECoinflipGameEvents.auth, async (token: string) => {
        coinflipGameController.authHandler(token);
      });

      // Start Coinflip Game Handler
      socket.on(
        ECoinflipGameEvents.createNewCoinflipgame,
        async (data: TNewCoinflipGamePayload) => {
          coinflipGameController.createNewCoinflipgameHandler(data);
        }
      );

      // Check for users ban status
      socket.use((packet: SocketEvent, next: (err?: any) => void) =>
        coinflipGameController.banStatusCheckMiddleware(packet, next)
      );

      // Throttle connections
      socket.use(throttleConnections(socket));
    });
  }

  private initializeListener = async () => { };
}

export default CoinflipGameSocketListener;
