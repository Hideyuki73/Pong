import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from '../src/game.gateway';
import { Socket } from 'socket.io';

describe('GameGateway', () => {
  let gateway: GameGateway;
  const mockClient: Partial<Socket> = {
    id: 'test-client',
    emit: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameGateway],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    gateway.handleConnection(mockClient as Socket); // simula conexão
  });

  it('should assign side "left" or "right" on connection', () => {
    expect(gateway.players[mockClient.id]).toBeDefined();
    expect(['left', 'right']).toContain(gateway.players[mockClient.id].side);
  });

  it('should handle player color update', () => {
    gateway.handleColor({ color: 'green' }, mockClient as Socket);
    expect(gateway.players[mockClient.id].color).toBe('green');
  });

  it('should handle player movement (up)', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.positions[side] = 100;

    gateway.handleMove({ direction: 'up' }, mockClient as Socket);
    expect(gateway.positions[side]).toBe(90);
  });

  it('should handle player movement (down)', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.positions[side] = 100;

    gateway.handleMove({ direction: 'down' }, mockClient as Socket);
    expect(gateway.positions[side]).toBe(110);
  });

  it('should not move beyond boundaries', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.positions[side] = 0;
    gateway.handleMove({ direction: 'up' }, mockClient as Socket);
    expect(gateway.positions[side]).toBe(0);

    gateway.positions[side] = 500;
    gateway.handleMove({ direction: 'down' }, mockClient as Socket);
    expect(gateway.positions[side]).toBe(500);
  });

  it('should remove player on disconnect', () => {
    gateway.handleDisconnect(mockClient as Socket);
    expect(gateway.players[mockClient.id]).toBeUndefined();
  });
});
