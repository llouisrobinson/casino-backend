// need add model to mongo index file
import BaseService from "@/utils/base/service";
import { Dashboard } from "@/utils/db";

import { EFilterDate, ERevenueType } from "./dashboard.constant";
// need add types
import { IDashboardModel } from "./dashboard.interface";

export class DashboardService extends BaseService<IDashboardModel> {
  constructor() {
    super(Dashboard);
  }

  public async getDashboardChart(
    dateType: EFilterDate,
    desiredRevenueType: ERevenueType,
    kartCurrency: number
  ): Promise<{
    uskLogs: IDashboardModel[];
    kartLogs: IDashboardModel[];
    kart_currency: number;
  }> {
    let date = 5;
    let limit = 12;

    switch (dateType) {
      case EFilterDate.hour:
        date = 5;
        limit = 12;
        break;
      case EFilterDate.day:
        date = 60;
        limit = 24;
        break;
      case EFilterDate.week:
        date = 60 * 24;
        limit = 7;
        break;
      case EFilterDate.month:
        date = 60 * 24;
        limit = 30;
        break;
      default:
        date = 60 * 24 * 30;
        limit = 12;
    }

    const revenueLogs = await this.aggregateByPipeline([
      {
        $addFields: {
          insertMod: {
            $mod: [
              {
                $toLong: "$insertDate",
              },
              1000 * 60 * date,
            ],
          },
        },
      },
      {
        $match: {
          insertMod: 0,
          revenueType: Number(desiredRevenueType),
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $limit: limit * 2,
      },
      {
        $sort: {
          createdAt: 1,
        },
      },
    ]);

    const uskfilteredLogs = revenueLogs.filter((log) => log.denom === "usk");
    const kartfilteredLogs = revenueLogs.filter((log) => log.denom === "kart");

    if (uskfilteredLogs.length > 0 && kartfilteredLogs.length === 0) {
      const lastkartRevenueLog = await this.getLastRevenueLog("kart");
      return {
        uskLogs: uskfilteredLogs,
        kartLogs: lastkartRevenueLog,
        kart_currency: kartCurrency,
      };
    }

    if (kartfilteredLogs.length > 0 && uskfilteredLogs.length === 0) {
      const lastuskRevenueLog = await this.getLastRevenueLog("usk");
      return {
        uskLogs: lastuskRevenueLog,
        kartLogs: kartfilteredLogs,
        kart_currency: kartCurrency,
      };
    }

    if (uskfilteredLogs.length === 0 || kartfilteredLogs.length === 0) {
      const lastuskRevenueLog = await this.getLastRevenueLog("usk");
      const lastkartRevenueLog = await this.getLastRevenueLog("kart");
      return {
        uskLogs: lastuskRevenueLog,
        kartLogs: lastkartRevenueLog,
        kart_currency: kartCurrency,
      };
    }

    return {
      uskLogs: uskfilteredLogs,
      kartLogs: kartfilteredLogs,
      kart_currency: kartCurrency,
    };
  }

  private async getLastRevenueLog(denom: string): Promise<IDashboardModel[]> {
    return await this.aggregateByPipeline([
      {
        $match: {
          denom,
        },
      },
      {
        $sort: {
          insertDate: -1,
        },
      },
      { $limit: 1 },
    ]);
  }
}
