import { LobbyController } from './lobby.controller';
import { PlayerDto } from './dto/player.dto';

describe('LobbyController', () => {
  let controller: LobbyController;

  beforeEach(() => {
    controller = new LobbyController();
  });

  it('deve adicionar um jogador ao lobby', () => {
    const player: PlayerDto = { name: 'Alice', color: '#ff0000' };
    const response = controller.joinLobby(player);
    expect(response).toEqual({ message: 'Jogador adicionado ao lobby', player });
    expect(controller.getPlayers()).toContainEqual(player);
  });

  it('não deve adicionar jogadores duplicados com o mesmo nome', () => {
    const player1: PlayerDto = { name: 'Bob', color: '#00ff00' };
    const player2: PlayerDto = { name: 'Bob', color: '#0000ff' };
    controller.joinLobby(player1);
    controller.joinLobby(player2);
    const players = controller.getPlayers().filter(p => p.name === 'Bob');
    expect(players.length).toBe(1);
    expect(players[0].color).toBe('#00ff00');
  });

  it('deve retornar a lista de jogadores', () => {
    const player: PlayerDto = { name: 'Charlie', color: '#abcdef' };
    controller.joinLobby(player);
    const players = controller.getPlayers();
    expect(players).toContainEqual(player);
  });

  it('deve gerenciar o ranking corretamente', () => {
    controller.addScore('Alice');
    controller.addScore('Alice');
    controller.addScore('Bob');

    const ranking = controller.getRanking();
    expect(ranking[0].name).toBe('Alice');
    expect(ranking[0].score).toBe(2);
    expect(ranking[1].name).toBe('Bob');
    expect(ranking[1].score).toBe(1);
  });

  it('deve retornar um ranking vazio caso nenhuma pontuação tenha sido adicionada', () => {
    const ranking = controller.getRanking();
    expect(ranking).toEqual([]);
  });
});
