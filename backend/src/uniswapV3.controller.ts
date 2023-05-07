import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Body, Param, Post } from '@nestjs/common/decorators';
import { monthValidator, Selector } from './enum/uniswapV3.enum';
import { FactoryData, poolDto, UniswapDayData } from './entity/uniswapV3.entity';
import { UniswapService } from './uniswapV3.service';
import { ApiBody } from '@nestjs/swagger';
import { DayData } from './interfaces/uniswapV3.interface';

// set route 'home' to reponse 
// to make this class controller need to define annotation before class
@Controller('/uniswapV3')
export class UniswapV3Controller {
    constructor(
      // define injected dependncy 
      private readonly uniswapService: UniswapService) {}


    /**
     * @returns This function provide the complete data of uniswap v3 like date,
     * date, volumeETH, volumeUSD, volumeUSDUntracked feeUSD etc.
     */
    @Get('/UniswapDayData')
    async getUniswapDayData(): Promise<UniswapDayData[]> {
      return this.uniswapService.getUniswapDayData();
    }


    /**
     * @returns This function provides the complete factory data like,
     * pool count, tx count, total volume in USD, total fees in USD etc.
     */
    @Get('/FactoryData')
    async getFactoryData(): Promise<FactoryData[]> {
      return this.uniswapService.getFactoryData();
    }


    /**
     * @returns This function provides uniswap v3 24 hours volume from all pools including untrackable volume.
     */
    @Get('/Uniswap24HoursVolume')
    async getUniswap24HourVolume(): Promise<any> {
      return this.uniswapService.getUniswap24HourVolume();
    } 


    /**
     * @returns This function provides 24 hours volume of perticular pool lke usdc-crv pool, luna-usd pool.
     */
    @Get('/Pool24HoursVolume')
    async getPool24HoursVolume(@Param() poolId: any): Promise<any> {
      return this.uniswapService.getPool24HourVolume(poolId);
    } 


    /**
     * 
     * @param params poolDto which contains two varibles 
     * pool id: address of pool,  selector: 1 to 6 number to get particular data. 
     * @returns 
     */
    @Post('/poolID')
    @ApiBody({type: poolDto})
    async fetchDataByPoolAddress
      (
        @Body() params: poolDto
      ): Promise<any> {

      // selector used to get the perticular data from the pool.
      /**
       * poolData = 1
       * feeUSD = 2
       * feeTier = 3
       * volumeToken0 = 4
       * volumeToken = 5
       * liquidity = 6
       */ 
      if 
      ( (params.selector != Selector.poolData) &&
        (params.selector != Selector.feeUSD) &&
        (params.selector != Selector.feeTier) && 
        (params.selector != Selector.volumeToken0) &&
        (params.selector != Selector.volumeToken1) &&
        (params.selector != Selector.liquidity)
      ) 
      {
        throw new NotFoundException(`"${params.selector}" is not valid`);
      }

      // get the pool data from subgraph and obtained from uniswapV3Service.
      const result = await this.uniswapService.fetchDataByPoolID(params.poolID, params.selector);
      
      // result from the uniswapV3Service should not be null 
      // if it is throw an error with the pool id.
      if (!result) {
        throw new NotFoundException(`"${params.poolID} is does not exist`);
      }

      // if pool data is not null and selector is valid then return the particular pool data.
      return result;
    }


    /**
     * @returns This function provides particular day data
     */
    @Get(':dateParam')
    async getDataByDate(
      @Param('dateParam') dateParam: string
    ): Promise<DayData[]> {
      return this.uniswapService.fetchPoolChartData(dateParam);
    } 


    /**
     * @returns This function provides complete month pool data.
     */
    @Get(':monthSelector/:year')
    async getDataByMonth(
      @Param('monthSelector') monthSelector: number,
      @Param('year') year: number
    ): Promise<any> {
      // valid month
      if 
      ( (monthSelector != monthValidator.Jan) &&
        (monthSelector != monthValidator.Feb) &&
        (monthSelector != monthValidator.Mar) && 
        (monthSelector != monthValidator.Apr) &&
        (monthSelector != monthValidator.May) &&
        (monthSelector != monthValidator.June) &&
        (monthSelector != monthValidator.July) &&
        (monthSelector != monthValidator.Aug) &&
        (monthSelector != monthValidator.Sep) &&
        (monthSelector != monthValidator.Oct) &&
        (monthSelector != monthValidator.Nov) &&
        (monthSelector != monthValidator.Dec) 
      ) 
      {
        throw new NotFoundException(`"${monthSelector}" is not valid`);
      }
      return this.uniswapService.fetchMonthlyPoolChartData(monthSelector, year);
    } 
}
