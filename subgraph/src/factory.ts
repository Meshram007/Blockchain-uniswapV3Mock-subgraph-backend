import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts"
import {
  PoolCreated
} from "../generated/factory/factory"
import { Bundle, FactoryData, Pool, Token } from "../generated/schema"
import { ERC20 } from '../generated/Factory/ERC20'
import { ERC20SymbolBytes } from '../generated/Factory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../generated/Factory/ERC20NameBytes'
import { Pool as PoolTemplate } from '../generated/templates'

/**
 * 
 * @param event PoolCreated is emitted from uniswap V3 factory contract.
 * @notice this function dynamically create pool and update the pool data.
 * @returns it return nothing but update the params of entity. 
 * @Note global data refers to data points about the Uniswap v3 protocol as a whole. 
 * @Note some examples of global data points are total volume all time in derived USD, total swap fees all time in USD, total swap fees all time in USD etc.
 * @Note query historical data by specifying a block number.
 */
export function handlePoolCreated(event: PoolCreated): void {
  // temp fix
  if (event.params.pool == Address.fromHexString('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
    return
  }

  // laod the factory data from contract address
  let factory = FactoryData.load("0x1F98431c8aD98523631AE4a59f267346ea31F984")
  // if factory data is null, initialise variables to zero and scaled by decimals.
  if (factory === null) {
    factory = new FactoryData("0x1F98431c8aD98523631AE4a59f267346ea31F984")
    factory.poolCount = ZERO_BI
    factory.totalVolumeETH = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalFeesETH = ZERO_BD
    factory.txCount = ZERO_BI

    // create new bundle for tracking eth price
    let bundle = new Bundle('1')
    bundle.ethPriceUSD = ZERO_BD
    bundle.save()
  }

  factory.poolCount = factory.poolCount.plus(ONE_BI)
  
  // this event emit pool, token0, token1 addresses can be captured by this function.
  let pool = new Pool(event.params.pool.toHexString()) as Pool
  let token0 = Token.load(event.params.token0.toHexString())
  let token1 = Token.load(event.params.token1.toHexString())

    // fetch info if null
    if (token0 === null) {
      token0 = new Token(event.params.token0.toHexString())
      token0.symbol = fetchTokenSymbol(event.params.token0)
      token0.name = fetchTokenName(event.params.token0)
      token0.totalSupply = fetchTokenTotalSupply(event.params.token0)
      let decimals = fetchTokenDecimals(event.params.token0)
  
      // bail if we couldn't figure out the decimals
      if (decimals === null) {
        return
      }
  
      token0.decimals = decimals
      token0.derivedETH = ZERO_BD
      token0.volume = ZERO_BD
      token0.volumeUSD = ZERO_BD
      token0.feesUSD = ZERO_BD
      token0.untrackedVolumeUSD = ZERO_BD
      token0.txCount = ZERO_BI
      token0.poolCount = ZERO_BI
      token0.whitelistPools = []
    }
  
    if (token1 === null) {
      token1 = new Token(event.params.token1.toHexString())
      token1.symbol = fetchTokenSymbol(event.params.token1)
      token1.name = fetchTokenName(event.params.token1)
      token1.totalSupply = fetchTokenTotalSupply(event.params.token1)
      let decimals = fetchTokenDecimals(event.params.token1)

      // bail if we couldn't figure out the decimals
      if (decimals === null) {
        return
      }

      token1.decimals = decimals
      token1.derivedETH = ZERO_BD
      token1.volume = ZERO_BD
      token1.volumeUSD = ZERO_BD
      token1.untrackedVolumeUSD = ZERO_BD
      token1.feesUSD = ZERO_BD
      token1.txCount = ZERO_BI
      token1.poolCount = ZERO_BI
      token1.whitelistPools = []
    }

  // update white listed pools
  // if the pool is not in the list, 
  // then pushed the pool address and update the pool data
  if (WHITELIST_TOKENS.includes(token0.id)) {
    let newPools = token1.whitelistPools
    newPools.push(pool.id)
    token1.whitelistPools = newPools
  }
  if (WHITELIST_TOKENS.includes(token1.id)) {
    let newPools = token0.whitelistPools
    newPools.push(pool.id)
    token0.whitelistPools = newPools
  }

  // initially initialise pool variables to zero and scaled by decimals.
  // the maxiumum items you can query at once is 1000. Thus to get all possible pools, you can interate using the skip variable. 
  // to get pools beyond the first 1000 you can also set the skip
  pool.token0 = token0.id
  pool.token1 = token1.id
  pool.feeTier = BigInt.fromI32(event.params.fee)
  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number
  pool.txCount = ZERO_BI
  pool.liquidity = ZERO_BI
  pool.sqrtPrice = ZERO_BI
  pool.feeGrowthGlobal0X128 = ZERO_BI
  pool.feeGrowthGlobal1X128 = ZERO_BI
  pool.token0Price = ZERO_BD
  pool.token1Price = ZERO_BD
  pool.tick = ZERO_BI
  pool.totalValueLockedToken0 = ZERO_BD
  pool.totalValueLockedToken1 = ZERO_BD
  pool.volumeToken0 = ZERO_BD
  pool.volumeToken1 = ZERO_BD
  pool.volumeUSD = ZERO_BD
  pool.feesUSD = ZERO_BD
  pool.untrackedVolumeUSD = ZERO_BD

  pool.save()
  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool)
  token0.save()
  token1.save()
  factory.save()
}

// constants scaled by big decimals and integer.
export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)


export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with s
export let WHITELIST_TOKENS: string[] = [
  WETH_ADDRESS, // WETH
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
  '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
  '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
  '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
  '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
  '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
  '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
  '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
  '0xfe2e637202056d30016725477c5da089ab0a043a' // sETH2
]

// list of stable token addresses
export let STABLE_COINS: string[] = [
  '0x6b175474e89094c44da98b954eedeac495271d0f',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '0x0000000000085d4780b73119b644ae5ecd22b376',
  '0x956f47f50a910163d8bf957cf5846d573e7f87ca',
  '0x4dd28568d05f09b02220b09c2cb307bfd837cb95'
]


/**
 * 
 * @param tokenAddress address of the token.
 * @returns big integer decimals value 
 */
export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  let decimalResult = contract.try_decimals()
  return BigInt.fromI32(decimalResult.value as i32)
}


/**
 * 
 * @param tokenAddress address of the token.
 * @returns symbol of the token
 */
export function fetchTokenSymbol(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let symbolValue = 'Unknown'
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    symbolValue = symbolResultBytes.value.toString()
  }
  return symbolResult.value
}


/**
 * 
 * @param tokenAddress address of the token 
 * @returns name of the token
 */
export function fetchTokenName(tokenAddress: Address): string {
  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let nameValue = 'Unknown'
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    nameValue = nameResultBytes.value.toString()
  }
  return nameResult.value
}


/**
 * 
 * @param tokenAddress address of the token
 * @returns total supply of the token.
 */
export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  let contract = ERC20.bind(tokenAddress)
  let totalSupplyValue = BigInt.fromI32(0);
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    totalSupplyValue = totalSupplyResult.value
  }
  return totalSupplyValue
}