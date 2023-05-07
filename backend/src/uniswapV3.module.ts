import { Module } from '@nestjs/common';
import { UniswapV3Controller } from './uniswapV3.controller';
import {  UniswapService } from './uniswapV3.service';
// import { TypeOrmModule } from '@nestjs/typeorm'
// import { typeOrmConfig } from './config/typeorm.config';

@Module({
  imports: [],
  controllers: [UniswapV3Controller],
  providers: [UniswapService],
})
export class AppModule {}
