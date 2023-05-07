import { NestFactory } from '@nestjs/core';
import { DocumentBuilder } from '@nestjs/swagger';
import { SwaggerModule } from '@nestjs/swagger/dist';
import { AppModule } from './uniswapV3.module';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('uni');

  const options = new DocumentBuilder()
      .setTitle('Uniswap V3 APIs')
      .setDescription(`This will help you to query Uniswap V3 analytics by unsing input params. 
                       You can fetch data points like collected fees for a position, current liquidity of a pool, volume on a certain day and much more. 
                       Below are some example apis. To run a query copy and paste it into the v3 explorer to get fresh data.`)
      .build();

  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
