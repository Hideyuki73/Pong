import { Controller, Post, Body, Get } from '@nestjs/common';
import { PlayerDto } from './dto/player.dto';

@Controller('lobby')
export class LobbyController {
  private players: PlayerDto[] = [];
  private ranking: { name: string; score: number }[] = [];

  @Post('join')
  joinLobby(@Body() player: PlayerDto) {
    if (!this.players.find(p => p.name === player.name)) {
      this.players.push(player);
    }
    return { message: 'Jogador adicionado ao lobby', player };  
  }

  @Get('players')
  getPlayers() {
    return this.players;
  }

  @Get('ranking')
  getRanking() {
    return this.ranking.sort((a, b) => b.score - a.score);
  }

  addScore(name: string) {
    const found = this.ranking.find(p => p.name === name);
    if (found) {
      found.score += 1;
    } else {
      this.ranking.push({ name, score: 1 });
    }
  }
}
