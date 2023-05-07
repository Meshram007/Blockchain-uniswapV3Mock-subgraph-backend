import { Any, BaseEntity, Column, Entity } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";

@Entity()
export class UniswapDayData extends BaseEntity {
    @Column() // to get the default id for each data
    id : string

    @Column()
    date : BigInteger //timestamp rounded to current day by dividing by 86400

    @Column()
    volumeETH : string //total daily volume in Uniswap derived in terms of ETH

    @Column()
    volumeUSD : number // total daily volume in Uniswap derived in terms of USD

    @Column()
    volumeUSDUntracked : number // total daily volume in Uniswap derived in terms of USD untracked

    @Column()
    feeUSD : string
}

export class FactoryData extends BaseEntity {
    @Column()
    id: string

    @Column()
    totalVolumeUSD: string  // total volume all time in derived USD

    @Column()
    totalVolumeETH: string  // total volume all time in derived ETH

    @Column()
    totalFeesUSD: string  // total swap fees all time in USD

    @Column()
    totalFeesETH : string  // total swap fees all time in USD

    @Column()
    untrackedVolumeUSD: string  // all volume even through less reliable USD values
}

export class PoolDayData extends BaseEntity {
    @Column()
    id : string

    @Column()
    volumeToken0: string  // volume in token0

    @Column()
    volumeToken1: string //volume in token1

    @Column()
    volumeUSD: string// volume in USD

    @Column()
    feesUSD:  string// fees in USD
}

export class Token extends BaseEntity {
    @Column()
    id: string // token address

    @Column()
    decimals: number  // token decimals

    @Column()
    symbol: string  // token symbol
}

export class Pool extends BaseEntity {
    @Column()
    id : string  // pool address

    @Column()
    feeTier: string  // fee amount

    @Column()
    liquidity: string  // in range liquidity

    @Column()
    volumeToken0: string  // all time token0 swapped

    @Column()
    volumeToken1: string  // all time token1 swapped

    @Column()
    volumeUSD: string  // all time USD swapped

    @Column()
    feesUSD: string  // fees in USD

    @Column()
    token0Price: string // token0 per token1

    @Column()
    token1Price: string  // token1 per token0

    @Column()
    token0: Token  // token0 info
 
    @Column()
    token1: Token  // token1 info
}

export class poolDto {
    @ApiProperty({type: String, description: 'Pool Address'})
    poolID: string // address of the pool 
    
    @ApiProperty({type: Number, description: 'Selector'})
    selector : number  // selector must be number from 1 to 6 used to get data 
}


export class MonthParams {
    startingDate: string  // starting date of month
    endingDate: string    // ending date of month
}
