import { Bundle, Burn, FactoryData, Mint, Pool, PoolDayData, PoolHourData, Swap, Tick, Token, TokenDayData, TokenHourData, UniswapDayData } from '../generated/schema'
import {Initialize, Swap as SwapEvent, Mint as MintEvent, Burn as BurnEvent, Flash as FlashEvent } from '../generated/templates/Pool/Pool'
import { BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { ONE_BI, ZERO_BD, ZERO_BI } from './factory'
import { convertTokenToDecimal, createTick, exponentToBigDecimal, findEthPerToken, getTrackedAmountUSD, loadTransaction, safeDiv } from './utils'
import { log } from '@graphprotocol/graph-ts'
import { Pool as PoolABI } from '../generated/factory/pool'


/**
 * @param event every pool initialize with sqrtPrice and tick 
 * @return it return nothing but update the variables
 */
export function handleInitialize(event: Initialize): void {
    // update pool sqrt price and tick
    let poolAddress = event.address.toHexString()
    let pool = Pool.load(poolAddress)

    // pool should not be null, it is loading data from pool and update sqrtPrice, tick
    if (pool) {
        pool.sqrtPrice = event.params.sqrtPriceX96
        pool.tick = BigInt.fromI32(event.params.tick)
        pool.save()

        // update token prices
        let token0 = Token.load(pool.token0)
        let token1 = Token.load(pool.token1)

        // update ETH price now that prices could have changed
        let bundle = Bundle.load("1")
        if (bundle) {
          bundle.ethPriceUSD = getEthPriceInUSD();
          bundle.save()
        }

        updatePoolDayData(event);
        updatePoolHourData(event);

        if (token0 && token1) {
          // update token prices
          token0.derivedETH = findEthPerToken(token0 as Token)
          token1.derivedETH = findEthPerToken(token1 as Token)
          token0.save()
          token1.save()
        }
    }
}

/**
 * @param event whenever mint event emit this function trigger and capture the emiited data.
 * @return it return nothing but update the variables
 */
export function handleMint(event: MintEvent): void {
  // load the data from address
  let bundle = Bundle.load('1')
  let poolAddress = event.address.toHexString()
  let pool = Pool.load(poolAddress)
  
  // pool and bundle should not be null.
  if (pool && bundle ) {
    let token0 = Token.load(pool.token0)
    let token1 = Token.load(pool.token1)

    // token0 and token1 should not be null.
    if(token0 && token1) {
      // convert number of token to decimlas data.
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      // convert amount into usd 
      let amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)))

      // pool data
      pool.txCount = pool.txCount.plus(ONE_BI)
      
      // pool data
      // Pools liquidity tracks the currently active liquidity given pools current tick.
      // We only want to update it on burn if the position being burnt includes the current tick.
      if (
        pool.tick !== null &&
        BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
        BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
      ) {
        pool.liquidity = pool.liquidity.minus(event.params.amount)
      }

      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0)
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1)
     
      let transaction = loadTransaction(event);
      let mint = new Mint(transaction.id.toString() + '#' + pool.txCount.toString())
      mint.transaction = transaction.id
      mint.timestamp = transaction.timestamp
      mint.pool = pool.id
      mint.token0 = pool.token0
      mint.token1 = pool.token1
      mint.amount = event.params.amount
      mint.amount0 = amount0
      mint.amount1 = amount1
      mint.amountUSD = amountUSD
      mint.tickLower = BigInt.fromI32(event.params.tickLower)
      mint.tickUpper = BigInt.fromI32(event.params.tickUpper)
      
      // tick entities
      let lowerTickIdx = event.params.tickLower
      let upperTickIdx = event.params.tickUpper

      let lowerTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickLower).toString()
      let upperTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickUpper).toString()

      let lowerTick = Tick.load(lowerTickId)
      let upperTick = Tick.load(upperTickId)

      // lower tick and upper tick should not be null, if it is null create new tick which means update the data.
      if (lowerTick === null) {
        lowerTick = createTick(lowerTickId, lowerTickIdx)
      }
    
      if (upperTick === null) {
        upperTick = createTick(upperTickId, upperTickIdx)
      }
 
      // lower tick and upper tick should not be null.
      if (lowerTick && upperTick) {
        let amount = event.params.amount
        // update the liquidity with emitted amount.
        lowerTick.liquidityGross = lowerTick.liquidityGross.plus(amount)
        lowerTick.liquidityNet = lowerTick.liquidityNet.plus(amount)
        upperTick.liquidityGross = upperTick.liquidityGross.plus(amount)
        upperTick.liquidityNet = upperTick.liquidityNet.minus(amount)
      }

      // level requires reimplementing some of the swapping code from v3-core.
      // update the uniswapDayData, PoolDayData, PoolHourData, TokenDayData and TokenHourData with the emiited event.
      // whenever mint happens on any pool, handler will capture the data and update subgraph.
      updateUniswapDayData(event)
      updatePoolDayData(event)
      updatePoolHourData(event)
      updateTokenDayData(token0 as Token, event)
      updateTokenDayData(token1 as Token, event)
      updateTokenHourData(token0 as Token, event)
      updateTokenHourData(token1 as Token, event)

      // save the updated pool and mint data.
      token0.save()
      token1.save()
      pool.save()
      mint.save()
    }
  }
}


/**
 * @param event whenever burn event emit this function trigger and capture the emiited data.
 * @return it return nothing but update the variables
 */
export function handleBurn(event: BurnEvent): void {
  // load the data from address
  let bundle = Bundle.load('1')
  let poolAddress = event.address.toHexString()
  let pool = Pool.load(poolAddress)
   
  // pool and bundle should not be null.
  if (pool && bundle) {
    let token0 = Token.load(pool.token0)
    let token1 = Token.load(pool.token1)

    // token0 and token1 should not be null.
    if (token0 && token1) {
      // convert number of token to decimlas data.
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
    
      // convert amount into usd 
      let amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)))
    
      // pool data
      pool.txCount = pool.txCount.plus(ONE_BI)

      // pool data
      // Pools liquidity tracks the currently active liquidity given pools current tick.
      // We only want to update it on burn if the position being burnt includes the current tick.
      if (
        pool.tick !== null &&
        BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
        BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
      ) {
        pool.liquidity = pool.liquidity.minus(event.params.amount)
      }
    
      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0)
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1)
    
      // burn entity
      let transaction = loadTransaction(event)
      let burn = new Burn(transaction.id + '#' + pool.txCount.toString())
      burn.transaction = transaction.id
      burn.timestamp = transaction.timestamp
      burn.pool = pool.id
      burn.token0 = pool.token0
      burn.token1 = pool.token1
      burn.amount = event.params.amount
      burn.amount0 = amount0
      burn.amount1 = amount1
      burn.amountUSD = amountUSD
      burn.tickLower = BigInt.fromI32(event.params.tickLower)
      burn.tickUpper = BigInt.fromI32(event.params.tickUpper)
    
      // tick entities
      let lowerTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickLower).toString()
      let upperTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickUpper).toString()
      
      let lowerTick = Tick.load(lowerTickId)
      let upperTick = Tick.load(upperTickId)
      
      let amount = event.params.amount

      // lower tick and upper tick should not be null.
      if (lowerTick && upperTick) {
        lowerTick.liquidityGross = lowerTick.liquidityGross.minus(amount)
        lowerTick.liquidityNet = lowerTick.liquidityNet.minus(amount)
        upperTick.liquidityGross = upperTick.liquidityGross.minus(amount)
        upperTick.liquidityNet = upperTick.liquidityNet.plus(amount)
      }
    
      // update the uniswapDayData, PoolDayData, PoolHourData, TokenDayData and TokenHourData with the emiited event.
      // whenever burn happens on any pool, handler will capture the data and update subgraph.
      updateUniswapDayData(event)
      updatePoolDayData(event)
      updatePoolHourData(event)
      updateTokenDayData(token0 as Token, event)
      updateTokenDayData(token1 as Token, event)
      updateTokenHourData(token0 as Token, event)
      updateTokenHourData(token1 as Token, event)

      // save the updated pool and burn data.
      token0.save()
      token1.save()
      pool.save()
      burn.save()
    }
  }
}


/**
 * @param event whenever swap event emit this function trigger and capture the emiited data.
 * @return it return nothing but update the variables.
 * @Note set the where field to filter swap data by pool address. 
 * @Note this example fetches data about multiple swaps for the USDC-USDT pool
 */
export function handleSwap(event: SwapEvent): void {
  // load the data from address
  let bundle = Bundle.load('1')
  let factory = FactoryData.load("0x1F98431c8aD98523631AE4a59f267346ea31F984")
  let pool = Pool.load(event.address.toHexString())

  // pool and bundle should not be null.
  if (pool && bundle && factory) {
    // hot fix for bad pricing
    if (pool.id == '0x9663f2ca0454accad3e094448ea6f77443880454') {
      return
    }

    let token0 = Token.load(pool.token0)
    let token1 = Token.load(pool.token1)

    // token0 and token1 should not be null.
    if (token0 && token1) {
      // amounts - 0/1 are token deltas: can be positive or negative
      let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
      let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)

      
      // need absolute amounts for volume
      let amount0Abs = amount0
      if (amount0.lt(ZERO_BD)) {
        amount0Abs = amount0.times(BigDecimal.fromString('-1'))
      }
      let amount1Abs = amount1
      if (amount1.lt(ZERO_BD)) {
        amount1Abs = amount1.times(BigDecimal.fromString('-1'))
      }

      let amount0ETH = amount0Abs.times(token0.derivedETH)
      let amount1ETH = amount1Abs.times(token1.derivedETH)
      let amount0USD = amount0ETH.times(bundle.ethPriceUSD)
      let amount1USD = amount1ETH.times(bundle.ethPriceUSD)

      // get amount that should be tracked only - div 2 because cant count both input and output as volume
      let amountTotalUSDTracked = getTrackedAmountUSD(amount0Abs, token0 as Token, amount1Abs, token1 as Token).div(
        BigDecimal.fromString('2')
      )
      let amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD)
      let amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(BigDecimal.fromString('2'))

      let feesETH = amountTotalETHTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))
      let feesUSD = amountTotalUSDTracked.times(pool.feeTier.toBigDecimal()).div(BigDecimal.fromString('1000000'))
    
      // global updates
      factory.txCount = factory.txCount.plus(ONE_BI)
      factory.totalVolumeETH = factory.totalVolumeETH.plus(amountTotalETHTracked)
      factory.totalVolumeUSD = factory.totalVolumeUSD.plus(amountTotalUSDTracked)
      factory.untrackedVolumeUSD = factory.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
      factory.totalFeesETH = factory.totalFeesETH.plus(feesETH)
      factory.totalFeesUSD = factory.totalFeesUSD.plus(feesUSD)

      // pool volume
      pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs)
      pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs)
      pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked)
      pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
      pool.feesUSD = pool.feesUSD.plus(feesUSD)
      pool.txCount = pool.txCount.plus(ONE_BI)

      // Update the pool with the new active liquidity, price, and tick.
      pool.liquidity = event.params.liquidity
      pool.tick = BigInt.fromI32(event.params.tick as i32)
      pool.sqrtPrice = event.params.sqrtPriceX96
      pool.save()
      
      // update token0 data
      token0.volume = token0.volume.plus(amount0Abs)
      token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked)
      token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
      token0.feesUSD = token0.feesUSD.plus(feesUSD)
      token0.txCount = token0.txCount.plus(ONE_BI)

      // update token1 data
      token1.volume = token1.volume.plus(amount1Abs)
      token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked)
      token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked)
      token1.feesUSD = token1.feesUSD.plus(feesUSD)
      token1.txCount = token1.txCount.plus(ONE_BI)

      // updated pool ratess
      let prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token)
      pool.token0Price = prices[0]
      pool.token1Price = prices[1]
      pool.save()

      // update USD pricing
      bundle.ethPriceUSD = getEthPriceInUSD()
      bundle.save()
      token0.derivedETH = findEthPerToken(token0 as Token)
      token1.derivedETH = findEthPerToken(token1 as Token)

      // create Swap event
      let transaction = loadTransaction(event)
      let swap = new Swap(transaction.id + '#' + pool.txCount.toString())
      swap.transaction = transaction.id
      swap.timestamp = transaction.timestamp
      swap.pool = pool.id
      swap.token0 = pool.token0
      swap.token1 = pool.token1
      swap.amount0 = amount0
      swap.amount1 = amount1
      swap.amountUSD = amountTotalUSDTracked
      swap.tick = BigInt.fromI32(event.params.tick as i32)
      swap.sqrtPriceX96 = event.params.sqrtPriceX96

      // interval data
      // update the uniswapDayData, PoolDayData, PoolHourData, TokenDayData and TokenHourData with the emiited event.
      // whenever swap happens on any pool, handler will capture the data and update subgraph.
      let uniswapDayData = updateUniswapDayData(event)
      let poolDayData = updatePoolDayData(event)
      let poolHourData = updatePoolHourData(event)
      let token0DayData = updateTokenDayData(token0 as Token, event)
      let token1DayData = updateTokenDayData(token1 as Token, event)
      let token0HourData = updateTokenHourData(token0 as Token, event)
      let token1HourData = updateTokenHourData(token1 as Token, event)

      // update volume metrics
      uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked)
      uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked)
      uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD)
      uniswapDayData.save()

      poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked)
      poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0Abs)
      poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1Abs)
      poolDayData.feesUSD = poolDayData.feesUSD.plus(feesUSD)
      poolDayData.save()

      poolHourData.volumeUSD = poolHourData.volumeUSD.plus(amountTotalUSDTracked)
      poolHourData.volumeToken0 = poolHourData.volumeToken0.plus(amount0Abs)
      poolHourData.volumeToken1 = poolHourData.volumeToken1.plus(amount1Abs)
      poolHourData.feesUSD = poolHourData.feesUSD.plus(feesUSD)
      poolHourData.save()

      token0DayData.volume = token0DayData.volume.plus(amount0Abs)
      token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked)
      token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
      token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD)
      token0DayData.save()

      token0HourData.volume = token0HourData.volume.plus(amount0Abs)
      token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked)
      token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
      token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD)
      token0HourData.save()

      token1DayData.volume = token1DayData.volume.plus(amount1Abs)
      token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked)
      token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
      token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD)
      token1DayData.save()

      token1HourData.volume = token1HourData.volume.plus(amount1Abs)
      token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked)
      token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked)
      token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD)
      token1HourData.save()  
      
      
      // save the updated pool, swap, factory, token0 and token1 data.
      swap.save()
      factory.save()
      pool.save()
      token0.save()
      token1.save()

    }
  }
}


/**
 * @param event whenever flash event emit this function trigger and capture the emiited data.
 * @return it return nothing but update the variables.
 */
export function handleFlash(event: FlashEvent): void {
  // update fee growth
  let pool = Pool.load(event.address.toHexString())
  let poolContract = PoolABI.bind(event.address)
  let feeGrowthGlobal0X128 = poolContract.feeGrowthGlobal0X128()
  let feeGrowthGlobal1X128 = poolContract.feeGrowthGlobal1X128()
  // pool should not be null
  // update the fee growth global variables.
  if (pool) {
    pool.feeGrowthGlobal0X128 = feeGrowthGlobal0X128 as BigInt
    pool.feeGrowthGlobal1X128 = feeGrowthGlobal1X128 as BigInt
    pool.save()
  }
}


/**
 * Tracks global aggregate data over daily windows
 * @param event the event which is used to update the emiited data 
 * @return updated uniswapDayData.
 */
export function updateUniswapDayData(event: ethereum.Event): UniswapDayData {
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400 // rounded
  let dayStartTimestamp = dayID * 86400
  let uniswapDayData = UniswapDayData.load(dayID.toString())
  if (uniswapDayData === null) {
    uniswapDayData = new UniswapDayData(dayID.toString())
    uniswapDayData.date = dayStartTimestamp
    uniswapDayData.volumeETH = ZERO_BD
    uniswapDayData.volumeUSD = ZERO_BD
    uniswapDayData.volumeUSDUntracked = ZERO_BD
    uniswapDayData.feesUSD = ZERO_BD
  }
  // after updating save the uniswapDayData.
  uniswapDayData.save()
  return uniswapDayData as UniswapDayData
}


/**
 * Tracks global aggregate data over hour windows
 * @param event the event which is used to update the emiited data 
 * @return updated poolHourData.
 */
export function updatePoolHourData(event: ethereum.Event): PoolHourData {
  let timestamp = event.block.timestamp.toI32();
  let hourIndex = timestamp / 3600;    // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600;  // want the rounded effect
  let hourPoolID = event.address.toHexString().concat('-').concat(hourIndex.toString())
  let pool = Pool.load(event.address.toHexString());
  let poolHourData = PoolHourData.load(hourPoolID)
  if (pool) {
    if (poolHourData === null) {
      poolHourData = new PoolHourData(hourPoolID);
      poolHourData.periodStartUnix = hourStartUnix
      poolHourData.pool = pool.id
      // things that dont get initialized always
      poolHourData.volumeToken0 = ZERO_BD
      poolHourData.volumeToken1 = ZERO_BD
      poolHourData.volumeUSD = ZERO_BD
      poolHourData.txCount = ZERO_BI
      poolHourData.feesUSD = ZERO_BD
      poolHourData.feeGrowthGlobal0X128 = ZERO_BI
      poolHourData.feeGrowthGlobal1X128 = ZERO_BI
      poolHourData.open = pool.token0Price
      poolHourData.high = pool.token0Price
      poolHourData.low = pool.token0Price
      poolHourData.close = pool.token0Price
    }

    if (pool.token0Price.gt(poolHourData.high)) {
      poolHourData.high = pool.token0Price
    }
    if (pool.token0Price.lt(poolHourData.low)) {
      poolHourData.low = pool.token0Price
    }

    poolHourData.liquidity = pool.liquidity
    poolHourData.sqrtPrice = pool.sqrtPrice
    poolHourData.token0Price = pool.token0Price
    poolHourData.token1Price = pool.token1Price
    poolHourData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128
    poolHourData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128
    poolHourData.close = pool.token0Price
    poolHourData.tick = pool.tick
    poolHourData.txCount = poolHourData.txCount.plus(ONE_BI)
    // after updating save the poolHourData.
    poolHourData.save()
  }
  return poolHourData as PoolHourData
}


/**
 * Tracks global aggregate data over day windows
 * @param event the event which is used to update the emiited data 
 * @return updated PoolDayData.
 */
export function updatePoolDayData(event: ethereum.Event): PoolDayData {
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayStartTimestamp = dayID * 86400;
  let dayPoolID = event.address.toHexString().concat('-').concat(dayID.toString())
  let pool = Pool.load(event.address.toHexString())
  let poolDayData = PoolDayData.load(dayPoolID)
  if (pool){
    if (poolDayData === null) {
      poolDayData = new PoolDayData(dayPoolID)
      poolDayData.date = dayStartTimestamp
      poolDayData.pool = pool.id
      // things that dont get initialized always
      poolDayData.volumeToken0 = ZERO_BD
      poolDayData.volumeToken1 = ZERO_BD
      poolDayData.volumeUSD = ZERO_BD
      poolDayData.feesUSD = ZERO_BD
      poolDayData.txCount = ZERO_BI
      poolDayData.feeGrowthGlobal0X128 = ZERO_BI
      poolDayData.feeGrowthGlobal1X128 = ZERO_BI
      poolDayData.open = pool.token0Price
      poolDayData.high = pool.token0Price
      poolDayData.low = pool.token0Price
      poolDayData.close = pool.token0Price
    }

    if (pool.token0Price.gt(poolDayData.high)) {
      poolDayData.high = pool.token0Price
    }
    if (pool.token0Price.lt(poolDayData.low)) {
      poolDayData.low = pool.token0Price
    }

    poolDayData.liquidity = pool.liquidity
    poolDayData.sqrtPrice = pool.sqrtPrice
    poolDayData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128
    poolDayData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128
    poolDayData.token0Price = pool.token0Price
    poolDayData.token1Price = pool.token1Price
    poolDayData.tick = pool.tick
    poolDayData.txCount = poolDayData.txCount.plus(ONE_BI)
    // after updating save the poolDayData.
    poolDayData.save()
  }
  return poolDayData as PoolDayData
}

/**
 * Tracks global aggregate data over day windows
 * @param event the event which is used to update the emiited data 
 * @return updated TokenDayData.
 */
export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
  let bundle = Bundle.load('1')
  let timestamp = event.block.timestamp.toI32()
  let dayID = timestamp / 86400
  let dayStartTimestamp = dayID * 86400
  let tokenDayID = token.id
    .toString()
    .concat('-')
    .concat(dayID.toString())

  let tokenDayData = TokenDayData.load(tokenDayID)
  if (tokenDayData === null) {
    tokenDayData = new TokenDayData(tokenDayID)
    tokenDayData.date = dayStartTimestamp
    tokenDayData.token = token.id
    tokenDayData.volume = ZERO_BD
    tokenDayData.volumeUSD = ZERO_BD
    tokenDayData.feesUSD = ZERO_BD
    tokenDayData.untrackedVolumeUSD = ZERO_BD
  }

  if (bundle){
    tokenDayData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD)
    tokenDayData.save()
  }
  tokenDayData.save()

  return tokenDayData as TokenDayData
}


/**
 * Tracks global aggregate data over hour windows
 * @param event the event which is used to update the emiited data 
 * @return updated TokenHourData.
 */
export function updateTokenHourData(token: Token, event: ethereum.Event): TokenHourData {
  let bundle = Bundle.load('1')
  let timestamp = event.block.timestamp.toI32()
  let hourIndex = timestamp / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect
  let tokenHourID = token.id
    .toString()
    .concat('-')
    .concat(hourIndex.toString())
  let tokenHourData = TokenHourData.load(tokenHourID)

  if (tokenHourData === null) {
    tokenHourData = new TokenHourData(tokenHourID)
    tokenHourData.periodStartUnix = hourStartUnix
    tokenHourData.token = token.id
    tokenHourData.volume = ZERO_BD
    tokenHourData.volumeUSD = ZERO_BD
    tokenHourData.untrackedVolumeUSD = ZERO_BD
    tokenHourData.feesUSD = ZERO_BD
  }
  
  if (bundle){
    tokenHourData.priceUSD = token.derivedETH.times(bundle.ethPriceUSD)
    tokenHourData.save()
  }
  tokenHourData.save()

  return tokenHourData as TokenHourData
}

/**
 * get updated and converted token price from eth to usd.
 * @return eth prices for each stablecoin.
 */
export function getEthPriceInUSD(): BigDecimal {
    // fetch eth prices for each stablecoin
    let usdcPool = Pool.load('0x09622b458f27c6f394455b9c0fb404ffac05e37a') // USDC_WETH_03_POOL  //WOMBAT
    if (usdcPool !== null ) {
      // this price will update through swap sqrtPrice and also from pool initialised sqrtPrice
      return usdcPool.token0Price
    } else {
      return ZERO_BD
    }
}

// this function is used to provide token0 and token1 actual price.
// this price is used to get actual price of eth in usd
// sqrtPriceX96 = sqrt(price) * 2 ** 96
// # divide both sides by 2 ** 96
// sqrtPriceX96 / (2 ** 96) = sqrt(price)
// # square both sides
// (sqrtPriceX96 / (2 ** 96)) ** 2 = price
// # expand the squared fraction
// (sqrtPriceX96 ** 2) / ((2 ** 96) ** 2)  = price
// # multiply the exponents in the denominator to get the final expression
// sqrtRatioX96 ** 2 / 2 ** 192 = price
// let Q192 = 2 ** 192 = 6277101735386680763835789423207666416102355444464034512896
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, token0: Token, token1: Token): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
    let denom = BigDecimal.fromString('6277101735386680763835789423207666416102355444464034512896')
    log.info('Message to be displayed: {}', [denom.toString()])
    let price1 = num
      .div(denom)
      .times(exponentToBigDecimal(token0.decimals))
      .div(exponentToBigDecimal(token1.decimals))
  
    let price0 = safeDiv(BigDecimal.fromString('1'), price1)
    return [price0, price1]
}
