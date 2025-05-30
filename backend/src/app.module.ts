import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { LobbyController } from './lobby.controller';

@Module({
  controllers: [LobbyController],
  providers: [GameGateway, LobbyController],
})
export class AppModule {}
