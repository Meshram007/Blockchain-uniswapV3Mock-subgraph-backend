import { Injectable, NotFoundException } from '@nestjs/common';
import fetch from 'cross-fetch';
import { FactoryData, UniswapDayData } from './entity/uniswapV3.entity';
import { MonthSelector, Selector } from './enum/uniswapV3.enum';
import * as moment from 'moment';
import { DayData, MonthData } from './interfaces/uniswapV3.interface';


@Injectable()
export class UniswapService {
  private readonly graphBaseUrl: string;
  constructor() {
    this.graphBaseUrl =
      'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
  }


  /**
  * selector used to get the perticular data from the pool.
  * poolData = 1
  * feeUSD = 2
  * feeTier = 3
  * volumeToken0 = 4
  * volumeToken = 5
  * liquidity = 6
  * @param poolID address of the pool.
  * @param selector number to select the parameter in return.
  * @returns various paramters like fees in USD, fee Tiers, liquidity, volume of token0 and token1
  */
  async fetchDataByPoolID(poolID: any, selector: number): Promise<any> {
  // query PoolDayData from subgraph
  const PoolDayDataQuery = {
    query: `
      {
      pool (
        subgraphError: allow,
        id: "${poolID}"
      ) {
        id
        feeTier
        liquidity
        volumeToken0
        volumeToken1
        volumeUSD
        feesUSD
        token0Price
        token1Price
        token0 {
          id
          decimals
          symbol
        }
        token1 {
          id
          decimals
          symbol
        }
      }
    }`,
  };

  // fetch the data from subgraph url currently deployed 
  // when sending data to web server, the data has to be string
  const PoolInfoData = await fetch(this.graphBaseUrl, {
    method: 'POST',
    headers: { 'Content-Type' : 'application/json' },
    body: JSON.stringify(PoolDayDataQuery),
  }) 
    .then((res) => res.json())
    .then((resJson) => {
      return resJson?.data?.pool;
    });

  // if the pool id is not valid it should throw error.
  if (PoolInfoData == null) {
    throw new NotFoundException(`"${poolID} is does not exist`);
  }

  // to get complete pool data.
  if (selector == Selector.poolData) {
    return  PoolInfoData;
  }
  
  // to get pool fees in USD.
  if (selector == Selector.feeUSD) {
    return PoolInfoData.feesUSD;
  }

  // to get pool fee tier
  if (selector == Selector.feeTier) {
    return PoolInfoData.feeTier;
  }

  // to get volume of token0 in the pool.
  if (selector == Selector.volumeToken0) {
    return PoolInfoData.volumeToken0;
  }

    // to get volume of token1 in the pool.
  if (selector == Selector.volumeToken1) {
    return PoolInfoData.volumeToken1;
  }

  // to get total liquidity used in the pool.
  if (selector == Selector.liquidity) {
    return PoolInfoData.liquidity;
  }

  return null;
}

  
/**
 * @param dateParam date in format YYYY-MM-DD for which you are trying to query volume.
 * @returns total volume used in particular day,
 * otherwise return 0 if there is no volume used from any pool for that particular da.
 */
async fetchPoolChartData(dateParam: any): Promise<DayData[]> {
  // conversion from date to timestamp 
  const dayNew  = moment.utc(dateParam, "YYYY-MM-DD");
  const timestamp = moment(dayNew).format("X");

  // conversion from timestamp to date 
  // const day = moment.unix(1620864000).utc();
  // console.log(day)
  // console.log(moment.utc().unix())

  // set the varibale to initial value i.e 0
  let poolDayTotalVolume: any = 0;
  let txCountInDay: any = 0 ;
  let skip = 0;

  // there is limit to skip data upto 5000 
  for (let j = 0 ; j < 6; j++) {

    // const startTimestamp = 1619170975  //2021-04-23
    // query PoolDayData from subgraph
    // date: 163364243 :- Fri Oct 08 2021
    // date choose to query should be 163364243(Fri Oct 08 2021), before that no data available
    const PoolDayDataQuery = {
      query: `
      query {
        poolDayDatas(
          first: 1000
          skip: ${skip}
          subgraphError: allow where: {
          } 
          orderBy: date
          orderDirection: asc
          ) {
          date
          volumeToken0
          volumeToken1
          volumeUSD
          feesUSD
        }
      }`
    };
    // fetch the data from subgraph url currently deployed 
    // when sending data to web server, the data has to be string
    const PoolInfoData = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(PoolDayDataQuery),
    }) 
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.poolDayDatas;
      });

    for(let i = 0; i < PoolInfoData.length; i++ ) {
      if (timestamp == PoolInfoData[i].date) {
        // number of tx happened in day 
        txCountInDay = txCountInDay + 1;
        // total volume of data(usd amount) used in particular day
        poolDayTotalVolume = poolDayTotalVolume + Number(PoolInfoData[i].volumeUSD);
      } 
    }
    // increase the skip if it is pool date dat is not available in previous skip.
    skip = skip + 1000;
  }
  return [poolDayTotalVolume, txCountInDay];
}


/**
 * @param monthParam contains starting and ending date of one particular month. (date in format YYYY-MM-DD) 
 * for which you are trying to query volume.
 * @returns total volume used in particular month,
 * otherwise return 0 if there is no volume used from any pool for that particular month.
 */
 async fetchMonthlyPoolChartData(month: number, year: number): Promise<MonthData[]> {
  // get number of days in particular month.
  const days = this.getDaysInMonth(month);

  // set the varibale to initial value i.e 0
  let poolMonthlyTotalVolume: any = 0;
  let txCountInMonth: any = 0 ;
  let skip = 0;

  // there is limit to skip data upto 5000 
  for (let j = 0 ; j < 6; j++) {
    // const startTimestamp = 1619170975  //2021-04-23
    // query PoolDayData from subgraph
    // date: 163364243 :- Fri Oct 08 2021
    // date choose to query should be 163364243(Fri Oct 08 2021), before that no data available
    const PoolDayDataQuery = {
      query: `
      query {
        poolDayDatas(
          first: 1000
          skip: ${skip}
          subgraphError: allow where: {
          } 
          orderBy: date
          orderDirection: asc
          ) {
          date
          volumeToken0
          volumeToken1
          volumeUSD
          feesUSD
        }
      }`
    };
    // fetch the data from subgraph url currently deployed 
    // when sending data to web server, the data has to be string
    const PoolInfoData = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(PoolDayDataQuery),
    }) 
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.poolDayDatas;
      });
  
    for(let i = 0; i <= days; i++ ) {
      const dateCalculated = moment.utc([year, month, i], "YYYY-MM-DD");
      // conversion from date to timestamp 
      const dayTimestamp = moment(dateCalculated).format("X");

      for (let k = 0 ; k < PoolInfoData.length ; k++) {
        if (dayTimestamp == PoolInfoData[k].date) {
          // number of tx happened in day 
          txCountInMonth = txCountInMonth + 1;
          // total volume of data(usd amount) used in particular day
          poolMonthlyTotalVolume = poolMonthlyTotalVolume + Number(PoolInfoData[i].volumeUSD);
        } 
      }
    }
    // increase the skip if it is pool date dat is not available in previous skip.
    skip = skip + 1000;
  }
  return [poolMonthlyTotalVolume, txCountInMonth];
}


  /**
   * this function is used to query the complete uniswap day data from the subgraph.
   * @returns UniswapDayData[] contains volumes of all pools in a day
   */
  async getUniswapDayData(): Promise<UniswapDayData[]> {
    // query UniswapDayData from subgraph
    const UniswapDayDataQuery = {
      query: `
      query {
        uniswapDayDatas (subgraphError: allow) {
          id
          date
          volumeETH
          volumeUSD
          volumeUSDUntracked
          feesUSD
        }
      }`
    };
    // fetch the data from subgraph url currently deployed 
    // when sending data to web server, the data has to be string
    const UniswapInfoData = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(UniswapDayDataQuery),
    }) 
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.uniswapDayDatas;
      });
    return UniswapInfoData;
  }


  /**
   * this function is used to query the complete factory data from the subgraph.
   * @returns FactoryData[] contains total volumes from all the pools in eth value and usd value.
   */
  async getFactoryData(): Promise<FactoryData[]> {
    // query Factory Data from subgraph
    const FactoryDataQuery = {
      query: `
      query {
        factoryDatas (subgraphError: allow) {
          id
          totalVolumeUSD
          totalVolumeETH
          totalFeesUSD
          totalFeesETH
          untrackedVolumeUSD
        }
      }`
    };
    // fetch the data from subgraph url curently deployed 
    // when sending data to web server, the data has to be string
    const FactoryDataInfo = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(FactoryDataQuery),
    })
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.factoryDatas;
      });

    return FactoryDataInfo;
  }


  /**
   * this function is used to query total volume updated in all pools in a day.
   * @returns uniswap 24 hours volume from the subgraph.
   */
  async getUniswap24HourVolume(): Promise<any> {
    // query UniswapDayData from subgraph
    const UniswapDayDataQuery = {
      query: `
      query {
        uniswapDayDatas (subgraphError: allow) {
          id
          date
          volumeETH
          volumeUSD
          volumeUSDUntracked
          feesUSD
        }
      }`
    };
    // fetch the data from subgraph url currently deployed 
    // when sending data to web server, the data has to be string
    const UniswapInfoData = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(UniswapDayDataQuery),
    }) 
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.uniswapDayDatas;
      });

    let totalVolume: any = 0; 
    for (let i = 0; i < UniswapInfoData.length; i++) {
      totalVolume = totalVolume 
                    + Number(UniswapInfoData[i].volumeUSD) 
                    + Number(UniswapInfoData[i].volumeUSDUntracked)
    }

    return totalVolume;
  }


  /**
   * this function is used to query total volume updated in particulaer pool in a day.
   * This query returns daily aggregated data for the first 1 day for particular pool id.
   * @returns pool 24 hours volume from the subgraph.
   */
  async getPool24HourVolume(poolID: any): Promise<any> {
    // query PoolDayData from subgraph
    const PoolDayDataQuery = {
      query: `
      query {
        poolDayDatas(first: 1, subgraphError: allow, 
          where: {pool: "${poolID}"}) 
        {
          id
          volumeToken0
          volumeToken1
          volumeUSD
          feesUSD
        }
      }`
    };
    // fetch the data from subgraph url currently deployed 
    // when sending data to web server, the data has to be string
    const PoolInfoData = await fetch(this.graphBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify(PoolDayDataQuery),
    }) 
      .then((res) => res.json())
      .then((resJson) => {
        return resJson?.data?.poolDayDatas;
      });

    let poolTotalVolume: any = 0;
    for(let i = 0; i < PoolInfoData.length; i++ ) {
      poolTotalVolume = poolTotalVolume + Number(PoolInfoData[i].volumeUSD)
    }

    return poolTotalVolume;
  }
 
  
  /**
   * This function provides number of days in perticualr day and it is used to get data of complete month.
   * @param selector number of the month like january = 1,  february = 2 etc.
   * @returns number of days in month.
   */
  getDaysInMonth(selector: number): number {
    if (selector == 1) {
      return MonthSelector.Jan;
    } else if (selector == 2) {
      if (moment([moment().year()]).isLeapYear()) {
        return MonthSelector.FebLeap;
      } else {
        return MonthSelector.Feb;
      }
    } else if (selector == 3) {
      return MonthSelector.Mar;
    } else if (selector == 4) {
      return MonthSelector.Apr;
    } else if (selector == 5) {
      return MonthSelector.May;
    } else if (selector == 6) {
      return MonthSelector.June;
    } else if (selector == 7) {
      return MonthSelector.July;
    } else if (selector == 8) {
      return MonthSelector.Aug;
    } else if (selector == 9) {
      return MonthSelector.Sep;
    } else if (selector == 10) {
      return MonthSelector.Oct;
    } else if (selector == 11) {
      return MonthSelector.Nov;
    } else if (selector == 12) {
      return MonthSelector.Dec;
    }
  } 

}
