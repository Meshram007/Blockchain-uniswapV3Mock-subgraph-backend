import { UniswapDayData } from "src/entity/uniswapV3.entity";
import { TypeOrmModuleOptions } from '@nestjs/typeorm';


// connect to the database.
export const typeOrmConfig: TypeOrmModuleOptions = {
    type: 'postgres', // database application
    host: 'localhost', // host name where to save
    port: 5432, // port where to connect
    username: 'postgres', // name of the channel
    password: 'Tiger123@', //password of channel
    database: 'uniswapV3Database', // name of the database
    entities: [UniswapDayData], // kind of data want to store
    synchronize: false //  true: to continuosly synchronise with database.
}