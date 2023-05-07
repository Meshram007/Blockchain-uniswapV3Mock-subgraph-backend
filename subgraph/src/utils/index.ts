import { BigInt, BigDecimal, ethereum } from '@graphprotocol/graph-ts'
import { Bundle, Pool, Tick, Token, Transaction } from '../../generated/schema'
import { ONE_BD, ONE_BI, STABLE_COINS, WETH_ADDRESS, WHITELIST_TOKENS, ZERO_BD, ZERO_BI } from '../factory'


// returns decimal value converted from exponent.
export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.equals(ZERO_BD)) {
    return ZERO_BD
  } else {
    return amount0.div(amount1)
  }
}

// convert the number of tokens to decimal value.
export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}


/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
 export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')

  if (bundle) {
    let price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
    let price1USD = token1.derivedETH.times(bundle.ethPriceUSD)

    // both are whitelist tokens, return sum of both amounts
    if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
      return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
    }

    // take double value of the whitelisted token amount
    if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
      return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
    }

    // take double value of the whitelisted token amount
    if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
      return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
    }
  }
  
  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
 let MINIMUM_ETH_LOCKED = BigDecimal.fromString('60')
 export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  let whiteList = token.whitelistPools
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    if(bundle){
      priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD)
    }
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      let poolAddress = whiteList[i]
      let pool = Pool.load(poolAddress)
      if (pool) {
        if (pool.liquidity.gt(ZERO_BI)) {
          if (pool.token0 == token.id) {
            // whitelist token is token1
            let token1 = Token.load(pool.token1)
            if (token1){
              // get the derived ETH in pool
              let ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH)
              if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
                largestLiquidityETH = ethLocked
                // token1 per our token * Eth per token1
                priceSoFar = pool.token1Price.times(token1.derivedETH as BigDecimal)
              }
            }
          }
          if (pool.token1 == token.id) {
            let token0 = Token.load(pool.token0)
            if (token0){
              // get the derived ETH in pool
              let ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH)
              if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_ETH_LOCKED)) {
                largestLiquidityETH = ethLocked
                // token0 per our token * ETH per token0
                priceSoFar = pool.token0Price.times(token0.derivedETH as BigDecimal)
              }
            }
          }
        }
      }
    }
  }
  return priceSoFar // nothing was found return 0
}


export function loadTransaction(event: ethereum.Event): Transaction {
  let transaction = Transaction.load(event.transaction.hash.toHexString())
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString())
  }
  transaction.blockNumber = event.block.number
  transaction.timestamp = event.block.timestamp
  transaction.save()
  return transaction as Transaction
}

/**
 * @param tickId is used to create new tick.
 * @param tickIdx is the lower or upper tick 
 * @return newly created tick if the tick is null in case.
 */
export function createTick(tickId: string, tickIdx: i32): Tick {
  let tick = new Tick(tickId)
  tick.tickIdx = BigInt.fromI32(tickIdx)
  tick.liquidityGross = ZERO_BI
  tick.liquidityNet = ZERO_BI

  tick.price0 = ONE_BD
  tick.price1 = ONE_BD

  // 1.0001^tick is token1/token0.
  let price0 = bigDecimalExponated(BigDecimal.fromString('1.0001'), BigInt.fromI32(tickIdx))
  tick.price0 = price0
  tick.price1 = safeDiv(ONE_BD, price0)
  
  return tick
}

export function bigDecimalExponated(value: BigDecimal, power: BigInt): BigDecimal {
  if (power.equals(ZERO_BI)) {
    return ONE_BD
  }
  let negativePower = power.lt(ZERO_BI)
  let result = ZERO_BD.plus(value)
  let powerAbs = power.abs()
  for (let i = ONE_BI; i.lt(powerAbs); i = i.plus(ONE_BI)) {
    result = result.times(value)
  }

  if (negativePower) {
    result = safeDiv(ONE_BD, result)
  }

  return result
}

