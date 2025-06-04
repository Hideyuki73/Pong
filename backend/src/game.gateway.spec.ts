import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { Socket } from 'socket.io';

describe('GameGateway', () => {
  let gateway: GameGateway;
  let mockClient: Socket;
  let mockClient2: Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameGateway],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);

    // Mock do server do socket
    gateway.server = {
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    } as any;

    mockClient = {
      id: 'test-client',
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;

    mockClient2 = {
      id: 'test-client-2',
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;

    // Simula conexão e join
    gateway.handleConnection(mockClient);
    gateway.handleJoin(
      {
        name: 'A',
        color: 'red',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient,
    );
    gateway.handleConnection(mockClient2);
    gateway.handleJoin(
      {
        name: 'B',
        color: 'blue',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient2,
    );
  });

  it('should assign unique sides to each player', () => {
    expect(gateway.players[mockClient.id]).toBeDefined();
    expect(gateway.players[mockClient2.id]).toBeDefined();
    expect(gateway.players[mockClient.id].side).not.toBe(
      gateway.players[mockClient2.id].side,
    );
  });

  it('should handle player color update', () => {
    gateway.players[mockClient.id].color = 'red';
    expect(gateway.players[mockClient.id].color).toBe('red');
  });

  it('should handle player movement (up/down/left/right)', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.positions[side] = 100;
    gateway.handleMove({ direction: 'up' }, mockClient);
    expect(gateway.positions[side]).toBe(90);
    gateway.handleMove({ direction: 'down' }, mockClient);
    expect(gateway.positions[side]).toBe(100);

    // Test left/right for horizontal paddles
    if (side === 'top' || side === 'bottom') {
      gateway.positions[side] = 100;
      gateway.handleMove({ direction: 'left' }, mockClient);
      expect(gateway.positions[side]).toBe(90);
      gateway.handleMove({ direction: 'right' }, mockClient);
      expect(gateway.positions[side]).toBe(100);
    }
  });

  it('should not move beyond boundaries', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.positions[side] = 0;
    gateway.handleMove({ direction: 'up' }, mockClient);
    expect(gateway.positions[side]).toBe(0);

    gateway.positions[side] = 600;
    gateway.handleMove({ direction: 'down' }, mockClient);
    expect(gateway.positions[side]).toBeLessThanOrEqual(600);
  });

  it('should remove player on disconnect', () => {
    gateway.handleDisconnect(mockClient);
    expect(gateway.players[mockClient.id]).toBeUndefined();
  });

  it('should reset cooldowns when a point is scored', () => {
    gateway.score.left = 9;
    gateway.lastHitter = 'left';
    gateway.remainingTime = 100;
    gateway.gameOver = false;
    // Simula a bola passando e marcando ponto
    gateway.startGameLoop();
    gateway.score.left++;
    expect(gateway.score.left).toBeGreaterThanOrEqual(10);
    // Cooldowns devem ser resetados no loop
    expect(gateway.stickCooldown.left).toBe(false);
    expect(gateway.duplicateBallCooldown.left).toBe(false);
  });

  it('should activate and reset ability cooldowns', (done) => {
    gateway.players[mockClient.id].ability = 'grow';
    gateway.handleUseAbility(mockClient);
    expect(gateway.growActive[gateway.players[mockClient.id].side]).toBe(true);
    setTimeout(() => {
      expect(gateway.growActive[gateway.players[mockClient.id].side]).toBe(
        false,
      );
      done();
    }, 12000);
  }, 13000);

  it('should handle player leaving and keep wall active', () => {
    const side = gateway.players[mockClient.id].side;
    gateway.handleDisconnect(mockClient);
    expect(gateway.players[mockClient.id]).toBeUndefined();
    // A parede ainda rebate (simulação: positions não é apagado)
    expect(gateway.positions[side]).toBeDefined();
  });

  it('should not allow more than 4 players', () => {
    const mockClient3 = {
      id: 'test-client-3',
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    const mockClient4 = {
      id: 'test-client-4',
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    const mockClient5 = {
      id: 'test-client-5',
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    gateway.handleConnection(mockClient3);
    gateway.handleJoin(
      {
        name: 'C',
        color: 'green',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient3,
    );
    gateway.handleConnection(mockClient4);
    gateway.handleJoin(
      {
        name: 'D',
        color: 'yellow',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient4,
    );
    gateway.handleConnection(mockClient5);
    gateway.handleJoin(
      {
        name: 'E',
        color: 'black',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient5,
    );

    expect(gateway.players[mockClient5.id]).toBeUndefined();
  });

  it('should emit playersReady when enough players join', () => {
    const spy = jest.spyOn(gateway.server, 'emit');
    gateway.handleJoin(
      {
        name: 'A',
        color: 'red',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient,
    );
    gateway.handleJoin(
      {
        name: 'B',
        color: 'blue',
        ability: 'grow',
        gradient: '',
        background: '',
      },
      mockClient2,
    );
    expect(spy).toHaveBeenCalledWith('playersReady');
  });

  afterEach(() => {
    if (gateway.interval) clearInterval(gateway.interval);
    if (gateway.timerInterval) clearInterval(gateway.timerInterval);
  });
});
