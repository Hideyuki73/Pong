import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

type Side = 'left' | 'right' | 'top' | 'bottom';
type Dir = 'up' | 'down' | 'left' | 'right';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  // Jogadores e seus sides
  players: Record<
    string,
    { side: Side; color: string; name: string; ability?: string }
  > = {};

  // Estado das raquetes e pontuação
  positions: Record<Side, number> = {
    left: 250,
    right: 250,
    top: 350,
    bottom: 350,
  };
  padSize: Record<Side, number> = {
    left: 100,
    right: 100,
    top: 100,
    bottom: 100,
  };
  score: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 };

  // Bola e quem foi o último a rebater
  ball = { x: 400, y: 300, dx: 4, dy: 4, size: 10, color: 'white' };
  lastHitter: Side | null = null;

  // Cronômetro e flags
  gameDuration = 300;
  remainingTime = this.gameDuration;
  gameOver = false;
  isPaused = false;
  ballFrozenUntil: number | null = null;

  // Habilidades
  neonActive: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  neonCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  growActive: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  growCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  stickActive: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  stickCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  timeStopCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  private stickTimeouts: Record<Side, NodeJS.Timeout | null> = {
    left: null,
    right: null,
    top: null,
    bottom: null,
  };

  private gameLoopStarted = false;
  private interval!: NodeJS.Timeout;
  private timerInterval!: NodeJS.Timeout;

  handleConnection(client: Socket) {
    const used = Object.values(this.players).map((p) => p.side);
    if (used.length >= 4) {
      client.emit('full', 'Sala cheia');
      return client.disconnect();
    }
    const all: Side[] = ['left', 'right', 'top', 'bottom'];
    const available = all.filter((s) => !used.includes(s));
    const side = available[0];
    this.players[client.id] = { side, color: 'white', name: '' };
    client.emit('side', side);
    client.emit('resetToJoin');
  }

  @SubscribeMessage('disconnect')
  handleDisconnect(client: Socket) {
    const player = this.players[client.id];
    if (!player) return;

    const side = player.side;
    delete this.players[client.id];

    // A parede ainda rebate, mas não será mais controlada nem pontuada.
    this.server.emit('playerLeft', side);
    this.emitState();
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { name: string; color: string; ability: string },
    @ConnectedSocket() client: Socket,
  ) {
    const p = this.players[client.id];
    if (!p) return;
    p.name = data.name;
    p.color = data.color;
    p.ability = data.ability;

    if (
      Object.values(this.players).length >= 2 &&
      Object.values(this.players).every((x) => x.name)
    ) {
      this.server.emit('playersReady');
      this.startGameLoop();
    }
  }

  @SubscribeMessage('move')
  handleMove(
    @MessageBody() { direction, fast }: { direction: Dir; fast?: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (this.gameOver) return;
    const p = this.players[client.id];
    if (!p) return;
    if (this.isPaused && p.ability === 'stop') return;

    const speed = fast ? 20 : 10;
    const s = p.side;
    if (direction === 'up' || direction === 'down') {
      const maxY = 600 - this.padSize[s];
      this.positions[s] = Math.max(
        0,
        Math.min(
          maxY,
          this.positions[s] + (direction === 'up' ? -speed : speed),
        ),
      );
    } else {
      const maxX = 800 - this.padSize[s];
      this.positions[s] = Math.max(
        0,
        Math.min(
          maxX,
          this.positions[s] + (direction === 'left' ? -speed : speed),
        ),
      );
    }
  }

  @SubscribeMessage('useAbility')
  handleUseAbility(@ConnectedSocket() client: Socket) {
    const p = this.players[client.id];
    if (!p || !p.ability) return;
    const s = p.side;

    // Time Stop
    if (p.ability === 'stop' && !this.isPaused && !this.timeStopCooldown[s]) {
      this.isPaused = true;
      this.timeStopCooldown[s] = true;
      this.server.emit('abilityEffect', { side: s, type: 'timeStopOn' });
      setTimeout(() => {
        this.isPaused = false;
        this.server.emit('abilityEffect', { side: s, type: 'timeStopOff' });
      }, 2000);
      setTimeout(() => (this.timeStopCooldown[s] = false), 10000);
      return;
    }
    // Force (Neon)
    if (p.ability === 'force' && !this.neonActive[s] && !this.neonCooldown[s]) {
      this.neonActive[s] = true;
      this.server.emit('abilityEffect', { side: s, type: 'force' });
      setTimeout(() => {
        this.neonActive[s] = false;
        this.neonCooldown[s] = true;
        setTimeout(() => (this.neonCooldown[s] = false), 5000);
      }, 1000);
      return;
    }
    // Grow
    if (p.ability === 'grow' && !this.growActive[s] && !this.growCooldown[s]) {
      this.growActive[s] = true;
      this.padSize[s] *= 1.5;
      this.server.emit('abilityEffect', { side: s, type: 'grow' });
      setTimeout(() => {
        this.growActive[s] = false;
        this.padSize[s] /= 1.5;
        this.growCooldown[s] = true;
        setTimeout(() => (this.growCooldown[s] = false), 5000);
      }, 10000);
      return;
    }
    // Stick (Godmode)
    if (
      p.ability === 'stick' &&
      !this.stickActive[s] &&
      !this.stickCooldown[s]
    ) {
      this.stickActive[s] = true;
      this.server.emit('abilityEffect', { side: s, type: 'stickOn' });
      this.stickTimeouts[s] = setTimeout(() => this.releaseStick(s), 3000);
      return;
    }
    if (this.stickActive[s]) this.releaseStick(s);
  }

  private releaseStick(s: Side) {
    if (this.stickTimeouts[s]) {
      clearTimeout(this.stickTimeouts[s]!);
      this.stickTimeouts[s] = null;
    }
    this.stickActive[s] = false;
    this.stickCooldown[s] = true;
    this.server.emit('abilityEffect', { side: s, type: 'stickOff' });
    setTimeout(() => (this.stickCooldown[s] = false), 10000);
    this.ball.dx = (s === 'left' ? 1 : -1) * 4;
    this.ball.dy = (Math.random() < 0.5 ? 1 : -1) * 4;
  }

  @SubscribeMessage('resetGame')
  resetGame() {
    clearInterval(this.interval);
    clearInterval(this.timerInterval);
    this.gameLoopStarted = false;
    this.gameOver = false;
    this.lastHitter = null;
    Object.values(this.players).forEach((p) => {
      p.name = '';
      p.ability = undefined;
      p.color = 'white';
    });
    Object.keys(this.players).forEach((id) => {
      this.server.to(id).emit('resetToJoin');
    });
    this.positions = { left: 250, right: 250, top: 350, bottom: 350 };
    this.score = { left: 0, right: 0, top: 0, bottom: 0 };
    this.padSize = { left: 100, right: 100, top: 100, bottom: 100 };
    this.resetBall();
    this.remainingTime = this.gameDuration;
    this.server.emit('gameReset', { remainingTime: this.remainingTime });
  }

  private resetBall() {
    this.ball = { x: 400, y: 300, dx: 0, dy: 0, size: 10, color: 'white' };
    this.ballFrozenUntil = Date.now() + 1000;
    this.lastHitter = null;
    setTimeout(() => {
      this.ball.dx = Math.random() < 0.5 ? -4 : 4;
      this.ball.dy = Math.random() < 0.5 ? -4 : 4;
      this.ballFrozenUntil = null;
    }, 1000);
  }

  private emitState() {
    this.server.emit('state', {
      players: this.players,
      positions: this.positions,
      ball: this.ball,
      score: this.score,
      remainingTime: this.remainingTime,
      padSize: this.padSize,
    });
  }

  private startGameLoop() {
    if (this.gameLoopStarted) return;
    this.gameLoopStarted = true;

    // Função auxiliar: retorna true se houver um jogador conectado na Side 's'
    const sideHasPlayer = (s: Side): boolean => {
      return Object.values(this.players).some((p) => p.side === s);
    };

    this.interval = setInterval(() => {
      if (this.gameOver) return;
      if (!this.isPaused && this.ballFrozenUntil === null) {
        this.ball.x += this.ball.dx;
        this.ball.y += this.ball.dy;
      }

      // Contagem de quantos jogadores estão conectados
      const numPlayers = Object.keys(this.players).length;

      // Colisão com raquetes: define lastHitter, reposiciona bola e dá o “rebate”
      (['left', 'right', 'top', 'bottom'] as Side[]).forEach((s) => {
        if (!sideHasPlayer(s)) return;

        const pos = this.positions[s],
          sz = this.padSize[s];
        let hit = false;

        if (s === 'left')
          hit =
            this.ball.x <= 20 && this.ball.y > pos && this.ball.y < pos + sz;
        if (s === 'right')
          hit =
            this.ball.x >= 780 && this.ball.y > pos && this.ball.y < pos + sz;
        if (s === 'top')
          hit =
            this.ball.y <= 20 && this.ball.x > pos && this.ball.x < pos + sz;
        if (s === 'bottom')
          hit =
            this.ball.y >= 580 && this.ball.x > pos && this.ball.x < pos + sz;

        if (!hit) return;

        // Só rebate se a bola vier na direção da raquete
        const goingToward =
          (s === 'left' && this.ball.dx < 0) ||
          (s === 'right' && this.ball.dx > 0) ||
          (s === 'top' && this.ball.dy < 0) ||
          (s === 'bottom' && this.ball.dy > 0);
        if (!goingToward) return;

        // Marca quem rebateu por último
        this.lastHitter = s;

        // Reposiciona a bola imediatamente na frente da raquete
        if (s === 'left') this.ball.x = 20 + this.ball.size + 1;
        if (s === 'right') this.ball.x = 780 - this.ball.size - 1;
        if (s === 'top') this.ball.y = 20 + this.ball.size + 1;
        if (s === 'bottom') this.ball.y = 580 - this.ball.size - 1;

        // Aplica o “rebate” ou “stick”
        if (this.stickActive[s]) {
          // “prende” a bola na raquete
          this.ball.dx = 0;
          this.ball.dy = 0;
        } else {
          // rebate normal invertendo componente principal
          if (s === 'left' || s === 'right') this.ball.dx *= -1;
          else this.ball.dy *= -1;

          // Ajusta ângulo com base no ponto de impacto
          const center = pos + sz / 2;
          const diff =
            s === 'left' || s === 'right'
              ? (this.ball.y - center) / (sz / 2)
              : (this.ball.x - center) / (sz / 2);
          const speed = Math.hypot(this.ball.dx, this.ball.dy);

          if (s === 'left' || s === 'right') {
            this.ball.dy = diff * speed;
            this.ball.dx =
              Math.sign(this.ball.dx) *
              Math.sqrt(speed * speed - this.ball.dy * this.ball.dy);
          } else {
            this.ball.dx = diff * speed;
            this.ball.dy =
              Math.sign(this.ball.dy) *
              Math.sqrt(speed * speed - this.ball.dx * this.ball.dx);
          }

          // Aplicar “neon” (se ativo) para aumentar velocidade
          if (this.neonActive[s]) {
            this.ball.dx *= 1.5;
            this.ball.dy *= 1.5;
          }
        }

        // 3) Atualiza cor da bola de acordo com o jogador que rebateu
        const pid = Object.keys(this.players).find(
          (id) => this.players[id].side === s,
        )!;
        if (this.players?.[pid]) {
          this.ball.color = this.players[pid].color;
        }
      });

      // === Colisão com paredes (topo/fundo e esquerda/direita) ===
      let scored: Side | null = null;

      // Função que faz a bola bater “para dentro” e inverter componente sem pontuar
      const bounceOffWall = (axis: 'x' | 'y', limit: number) => {
        if (axis === 'x') {
          this.ball.x = limit;
          this.ball.dx *= -1;
        } else {
          this.ball.y = limit;
          this.ball.dy *= -1;
        }
      };

      // === TOPO ===
      if (this.ball.y < 0) {
        if (numPlayers < 2) {
          // Menos de 2 jogadores: sempre rebate
          bounceOffWall('y', 0);
        } else {
          // 2 ou mais jogadores: verificar se há player no topo
          if (sideHasPlayer('top')) {
            if (this.lastHitter) {
              scored = this.lastHitter;
            } else {
              this.ball.dy *= -1;
            }
          } else {
            bounceOffWall('y', 0);
          }
        }
      }
      // === FUNDO ===
      else if (this.ball.y > 600) {
        if (numPlayers < 2) {
          bounceOffWall('y', 600);
        } else {
          if (sideHasPlayer('bottom')) {
            if (this.lastHitter) {
              scored = this.lastHitter;
            } else {
              this.ball.dy *= -1;
            }
          } else {
            bounceOffWall('y', 600);
          }
        }
      }

      // === ESQUERDA ===
      if (this.ball.x < 0) {
        if (numPlayers < 2) {
          bounceOffWall('x', 0);
        } else {
          if (sideHasPlayer('left')) {
            if (this.lastHitter) {
              scored = this.lastHitter;
            } else {
              this.ball.dx *= -1;
            }
          } else {
            bounceOffWall('x', 0);
          }
        }
      }
      // === DIREITA ===
      else if (this.ball.x > 800) {
        if (numPlayers < 2) {
          bounceOffWall('x', 800);
        } else {
          if (sideHasPlayer('right')) {
            if (this.lastHitter) {
              scored = this.lastHitter;
            } else {
              this.ball.dx *= -1;
            }
          } else {
            bounceOffWall('x', 800);
          }
        }
      }

      if (scored) {
        // Incrementa pontuação do lado que fez o último hit
        this.score[scored]++;
        const pid = Object.keys(this.players).find(
          (id) => this.players[id].side === scored,
        )!;
        if (this.players?.[pid]) {
          this.server.emit('pointEffect', {
            side: scored,
            color: this.players[pid].color,
          });
        }
        this.server.emit('ballReset');
        this.resetBall();
      }

      // Verifica fim de jogo (tempo ou pontuação >= 10)
      if (
        this.remainingTime <= 0 ||
        Object.values(this.score).some((v) => v >= 10)
      ) {
        this.gameOver = true;
        const winnerSide = (
          Object.entries(this.score) as [Side, number][]
        ).sort((a, b) => b[1] - a[1])[0][0];
        const winnerId = Object.keys(this.players).find(
          (id) => this.players[id].side === winnerSide,
        )!;
        this.server.emit('gameOver', {
          winner: this.players[winnerId].name,
          score: this.score,
        });
      }

      this.emitState();
    }, 1000 / 60);

    // Cronômetro de jogo
    this.timerInterval = setInterval(() => {
      if (this.remainingTime > 0 && !this.isPaused) this.remainingTime--;
    }, 1000);
  }
}
