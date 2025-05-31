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
    {
      side: Side;
      color: string;
      name: string;
      ability?: string;
      gradient?: string;
      background?: any;
    }
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

  duplicateBalls: Array<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    size: number;
    color: string;
    lastHit: Side | null;
    isStuck: boolean;
  }> = [];

  // Cronômetro e flags
  gameDuration = 300;
  remainingTime = this.gameDuration;
  gameOver = false;
  isPaused = false;
  ballFrozenUntil: number | null = null;

  // Habilidades
  stopperSide: Side | null = null;
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
  stickTimeouts: Record<Side, NodeJS.Timeout | null> = {
    left: null,
    right: null,
    top: null,
    bottom: null,
  };
  duplicateBallCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  ballIsStuck: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  telekinesisActive: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  telekinesisCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  };
  telekinesisTimeouts: Record<Side, NodeJS.Timeout | null> = {
    left: null,
    right: null,
    top: null,
    bottom: null,
  };
  desconcentrarCooldown: Record<Side, boolean> = {
    left: false,
    right: false,
    top: false,
    bottom: false,
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
    @MessageBody()
    data: {
      name: string;
      color: string;
      ability: string;
      gradient: any;
      background: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.players[client.id]) {
      const used = Object.values(this.players).map((p) => p.side);
      const all: Side[] = ['left', 'right', 'top', 'bottom'];
      const available = all.filter((s) => !used.includes(s));
      const side = available[0];
      this.players[client.id] = {
        side,
        color: data.color || 'white',
        name: data.name || '',
        ability: data.ability,
        gradient: data.gradient,
        background: data.background,
      };
    }
    console.log('Jogador conectado: ', this.players);
    const p = this.players[client.id];
    if (!p) return;
    p.name = data.name;
    p.color = data.color;
    p.ability = data.ability;
    p.gradient = data.gradient;
    p.background = data.background;

    if (Object.values(this.players).length >= 2) {
      console.log('Está enviando playersReady');
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
    if (this.isPaused && p.side !== this.stopperSide) return;

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
    // Verifica se a bola está realmente grudada na raquete deste jogador
    if (this.ballIsStuck[s]) {
      if (s === 'left' || s === 'right') {
        this.ball.y = this.positions[s] + this.padSize[s] / 2;
      } else {
        this.ball.x = this.positions[s] + this.padSize[s] / 2;
      }
    }

    if (this.duplicateBalls && this.duplicateBalls.length > 0) {
      for (const b of this.duplicateBalls) {
        if (b.isStuck) {
          if (s === 'left' || s === 'right') {
            b.y = this.positions[s] + this.padSize[s] / 2;
          } else {
            b.x = this.positions[s] + this.padSize[s] / 2;
          }
        }
      }
    }
  }

  @SubscribeMessage('useAbility')
  handleUseAbility(@ConnectedSocket() client: Socket) {
    const p = this.players[client.id];
    if (!p || !p.ability) return;
    const s = p.side;

    if (p.ability === 'desconcentrar') {
      // Envie o efeito para todos, menos quem ativou
      Object.entries(this.players).forEach(([id, player]) => {
        if (player.side !== s) {
          this.server.to(id).emit('abilityEffect', {
            side: s,
            type: 'desconcentrar',
          });
        }
      });
      // Cooldown opcional (exemplo: 8s)
      this.desconcentrarCooldown[s] = true;
      setTimeout(() => (this.desconcentrarCooldown[s] = false), 8000);
      return;
    }

    // Telecinese (rebate todas as bolas de longe, sem acelerar)
    if (p.ability === 'telekinesis') {
      // Ativar
      if (!this.telekinesisActive[s] && !this.telekinesisCooldown[s]) {
        this.telekinesisActive[s] = true;
        this.lastHitter = s;
        this.server.emit('abilityEffect', {
          side: s,
          type: 'telekinesisOn',
          effect: 'wave', // ou 'glow', 'shock', etc.
          color:
            this.players[
              Object.keys(this.players).find(
                (id) => this.players[id].side === s,
              )!
            ].color,
        });

        // Inverta todas as bolas (sem alterar lastHitter)
        if (s === 'left' || s === 'right') this.ball.dx *= -1;
        else this.ball.dy *= -1;
        this.ball.color =
          this.players[
            Object.keys(this.players).find((id) => this.players[id].side === s)!
          ].color;

        if (this.duplicateBalls && this.duplicateBalls.length > 0) {
          for (const b of this.duplicateBalls) {
            if (s === 'left' || s === 'right') b.dx *= -1;
            else b.dy *= -1;
            b.color =
              this.players[
                Object.keys(this.players).find(
                  (id) => this.players[id].side === s,
                )!
              ].color;
          }
        }

        // Desativa após 2 segundos e inicia cooldown
        this.telekinesisTimeouts[s] = setTimeout(() => {
          this.telekinesisActive[s] = false;
          this.telekinesisCooldown[s] = true;
          this.server.emit('abilityEffect', {
            side: s,
            type: 'telekinesisOff',
            effect: 'wave', // mesmo efeito para desativar
            color:
              this.players[
                Object.keys(this.players).find(
                  (id) => this.players[id].side === s,
                )!
              ].color,
          });
          setTimeout(() => (this.telekinesisCooldown[s] = false), 5000);
        }, 2000);

        return;
      }

      // Desativar manualmente (antes do timeout)
      if (this.telekinesisActive[s]) {
        if (this.telekinesisTimeouts[s]) {
          clearTimeout(this.telekinesisTimeouts[s]!);
          this.telekinesisTimeouts[s] = null;
        }
        this.telekinesisActive[s] = false;
        this.telekinesisCooldown[s] = true;
        this.server.emit('abilityEffect', {
          side: s,
          type: 'telekinesisOff',
          effect: 'wave',
          color:
            this.players[
              Object.keys(this.players).find(
                (id) => this.players[id].side === s,
              )!
            ].color,
        });
        setTimeout(() => (this.telekinesisCooldown[s] = false), 5000);
        return;
      }

      // Desativar manualmente (antes do timeout)
      if (this.telekinesisActive[s]) {
        if (this.telekinesisTimeouts[s]) {
          clearTimeout(this.telekinesisTimeouts[s]!);
          this.telekinesisTimeouts[s] = null;
        }
        this.telekinesisActive[s] = false;
        this.telekinesisCooldown[s] = true;
        this.server.emit('abilityEffect', { side: s, type: 'telekinesisOff' });
        setTimeout(() => (this.telekinesisCooldown[s] = false), 5000);
        return;
      }
    }

    // Force (Neon)
    if (p.ability === 'force' && !this.neonActive[s] && !this.neonCooldown[s]) {
      this.neonActive[s] = true;
      this.server.emit('abilityEffect', { side: s, type: 'force' }); // Emitir o evento correto
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

    // Grudar (Godmode)
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

    // Parar o tempo (paddles continuam mexendo)
    if (p.ability === 'stop' && !this.isPaused && !this.timeStopCooldown[s]) {
      this.isPaused = true;
      this.stopperSide = s; // <-- Adicione esta linha
      this.timeStopCooldown[s] = true;
      this.server.emit('abilityEffect', { side: s, type: 'timeStopOn' });
      setTimeout(() => {
        this.isPaused = false;
        this.stopperSide = null; // <-- E limpe aqui
        this.server.emit('abilityEffect', { side: s, type: 'timeStopOff' });
      }, 2000);
      setTimeout(() => (this.timeStopCooldown[s] = false), 10000);
      return;
    }

    // Duplicar bola
    if (p.ability === 'duplicateBall' && !this.duplicateBallCooldown?.[s]) {
      const newBall = {
        ...this.ball,
        dx: -this.ball.dx,
        dy: -this.ball.dy,
        lastHit: this.lastHitter,
        isStuck: false,
      };
      this.server.emit('abilityEffect', { side: s, type: 'duplicateBall' });
      if (!this.duplicateBalls) this.duplicateBalls = [];
      this.duplicateBalls.push(newBall);

      // Defina o cooldown
      if (!this.duplicateBallCooldown)
        this.duplicateBallCooldown = {
          left: false,
          right: false,
          top: false,
          bottom: false,
        };
      this.duplicateBallCooldown[s] = true;
      setTimeout(() => (this.duplicateBallCooldown[s] = false), 8000); // 8 segundos de cooldown

      // Envie o estado completo!
      this.emitState();
      return;
    }
  }

  private releaseStick(s: Side) {
    if (this.stickTimeouts[s]) {
      clearTimeout(this.stickTimeouts[s]!);
      this.stickTimeouts[s] = null;
    }
    this.stickActive[s] = false;
    this.stickCooldown[s] = true;

    if (this.ballIsStuck[s]) {
      this.ballIsStuck[s] = false;
      this.ball.dx = (s === 'left' ? 1 : s === 'right' ? -1 : this.ball.dx) * 4;
      this.ball.dy = (s === 'top' ? 1 : s === 'bottom' ? -1 : this.ball.dy) * 4;
    }

    if (this.duplicateBalls && this.duplicateBalls.length > 0) {
      for (const b of this.duplicateBalls) {
        if (b.isStuck) {
          b.isStuck = false;
          // Dê uma direção para a bola duplicada ao soltar
          if (s === 'left') {
            b.dx = 4;
            b.dy = (Math.random() < 0.5 ? 1 : -1) * 4;
          } else if (s === 'right') {
            b.dx = -4;
            b.dy = (Math.random() < 0.5 ? 1 : -1) * 4;
          } else if (s === 'top') {
            b.dy = 4;
            b.dx = (Math.random() < 0.5 ? 1 : -1) * 4;
          } else if (s === 'bottom') {
            b.dy = -4;
            b.dx = (Math.random() < 0.5 ? 1 : -1) * 4;
          }
        }
      }
    }

    this.server.emit('abilityEffect', { side: s, type: 'stickOff' });
    setTimeout(() => (this.stickCooldown[s] = false), 10000);
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
      duplicateBalls: this.duplicateBalls,
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
      let jaEmitiuBallHitEsteFrame = false;
      if (this.gameOver) return;
      if (!this.isPaused && this.ballFrozenUntil === null) {
        this.ball.x += this.ball.dx;
        this.ball.y += this.ball.dy;
        // Atualiza bolas duplicadas
        if (this.duplicateBalls && this.duplicateBalls.length > 0) {
          for (const b of this.duplicateBalls) {
            b.x += b.dx;
            b.y += b.dy;
          }
        }
      }

      // Contagem de quantos jogadores estão conectados
      const numPlayers = Object.keys(this.players).length;

      // Colisão com raquetes: define lastHitter, reposiciona bola e dá o “rebate”
      (['left', 'right', 'top', 'bottom'] as Side[]).forEach((s) => {
        if (!sideHasPlayer(s)) return;

        const pos = this.positions[s];
        const sz = this.padSize[s];
        let hit = false;

        // Verifica colisão com a paddle
        if (s === 'left') {
          hit =
            this.ball.x - this.ball.size <= 20 &&
            this.ball.y > pos &&
            this.ball.y < pos + sz;
        }
        if (s === 'right') {
          hit =
            this.ball.x + this.ball.size >= 780 &&
            this.ball.y > pos &&
            this.ball.y < pos + sz;
        }
        if (s === 'top') {
          hit =
            this.ball.y - this.ball.size <= 20 &&
            this.ball.x > pos &&
            this.ball.x < pos + sz;
        }
        if (s === 'bottom') {
          hit =
            this.ball.y + this.ball.size >= 580 &&
            this.ball.x > pos &&
            this.ball.x < pos + sz;
        }

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

        // Aplica o “stick”
        if (this.stickActive[s]) {
          this.ballIsStuck[s] = true;
          if (s === 'left' || s === 'right') {
            this.ball.y = this.positions[s] + this.padSize[s] / 2;
            this.ball.dx = 0;
            this.ball.dy = 0;
          } else {
            this.ball.x = this.positions[s] + this.padSize[s] / 2;
            this.ball.dx = 0;
            this.ball.dy = 0;
          }
          return; // Não rebate enquanto grudado
        }

        if (this.duplicateBalls && this.duplicateBalls.length > 0) {
          (['left', 'right', 'top', 'bottom'] as Side[]).forEach((s) => {
            if (!sideHasPlayer(s)) return;
            const pos = this.positions[s];
            const sz = this.padSize[s];
            for (const b of this.duplicateBalls) {
              let hit = false;
              if (s === 'left') {
                hit = b.x - b.size <= 20 && b.y > pos && b.y < pos + sz;
              }
              if (s === 'right') {
                hit = b.x + b.size >= 780 && b.y > pos && b.y < pos + sz;
              }
              if (s === 'top') {
                hit = b.y - b.size <= 20 && b.x > pos && b.x < pos + sz;
              }
              if (s === 'bottom') {
                hit = b.y + b.size >= 580 && b.x > pos && b.x < pos + sz;
              }
              if (!hit) continue;
              if (this.stickActive[s]) {
                b.isStuck = true;
                if (s === 'left' || s === 'right') {
                  b.y = this.positions[s] + this.padSize[s] / 2;
                  b.dx = 0;
                  b.dy = 0;
                } else {
                  b.x = this.positions[s] + this.padSize[s] / 2;
                  b.dx = 0;
                  b.dy = 0;
                }
                continue; // Não rebate enquanto grudado
              }
            }
          });
        }

        // Aplicar “neon” (se ativo) para aumentar velocidade
        if (this.neonActive[s]) {
          this.ball.dx *= 1.5;
          this.ball.dy *= 1.5;
        }

        // Atualiza cor da bola de acordo com o jogador que rebateu
        const pid = Object.keys(this.players).find(
          (id) => this.players[id].side === s,
        )!;
        if (this.players?.[pid]) {
          this.ball.color = this.players[pid].color;
        }

        // Inverte a direção da bola
        let impact = 0;
        if (s === 'left' || s === 'right') {
          // Para raquetes verticais, calcula o impacto na vertical
          impact = (this.ball.y - (pos + sz / 2)) / (sz / 2);
          // Limita o valor para [-1, 1]
          impact = Math.max(-1, Math.min(1, impact));
          // Ajusta o ângulo: quanto mais longe do centro, mais inclinado
          const speed = Math.sqrt(
            this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy,
          );
          this.ball.dy = speed * impact;
          // Inverte a direção horizontal
          this.ball.dx =
            (s === 'left' ? 1 : -1) *
            Math.sqrt(Math.max(1, speed * speed - this.ball.dy * this.ball.dy));
        } else {
          // Para raquetes horizontais, calcula o impacto na horizontal
          impact = (this.ball.x - (pos + sz / 2)) / (sz / 2);
          impact = Math.max(-1, Math.min(1, impact));
          const speed = Math.sqrt(
            this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy,
          );
          this.ball.dx = speed * impact;
          // Inverte a direção vertical
          this.ball.dy =
            (s === 'top' ? 1 : -1) *
            Math.sqrt(Math.max(1, speed * speed - this.ball.dx * this.ball.dx));
        }

        // Pequeno fator aleatório para imprevisibilidade extra
        this.ball.dx += (Math.random() - 0.5) * 0.5;
        this.ball.dy += (Math.random() - 0.5) * 0.5;

        if (!jaEmitiuBallHitEsteFrame) {
          this.server.emit('ballHit');
          jaEmitiuBallHitEsteFrame = true;
        }
      });

      // Colisão com raquetes para bolas duplicadas
      if (this.duplicateBalls && this.duplicateBalls.length > 0) {
        (['left', 'right', 'top', 'bottom'] as Side[]).forEach((s) => {
          if (!sideHasPlayer(s)) return;
          const pos = this.positions[s];
          const sz = this.padSize[s];
          for (const b of this.duplicateBalls) {
            let hit = false;
            if (s === 'left') {
              hit = b.x - b.size <= 20 && b.y > pos && b.y < pos + sz;
            }
            if (s === 'right') {
              hit = b.x + b.size >= 780 && b.y > pos && b.y < pos + sz;
            }
            if (s === 'top') {
              hit = b.y - b.size <= 20 && b.x > pos && b.x < pos + sz;
            }
            if (s === 'bottom') {
              hit = b.y + b.size >= 580 && b.x > pos && b.x < pos + sz;
            }
            if (!hit) continue;

            const goingToward =
              (s === 'left' && b.dx < 0) ||
              (s === 'right' && b.dx > 0) ||
              (s === 'top' && b.dy < 0) ||
              (s === 'bottom' && b.dy > 0);
            if (!goingToward) continue;

            if (!jaEmitiuBallHitEsteFrame) {
              this.server.emit('ballHit');
              jaEmitiuBallHitEsteFrame = true;
            }

            b.lastHit = s;
            if (s === 'left') b.x = 20 + b.size + 1;
            if (s === 'right') b.x = 780 - b.size - 1;
            if (s === 'top') b.y = 20 + b.size + 1;
            if (s === 'bottom') b.y = 580 - b.size - 1;

            // Aplica o “stick” somente se houve colisão
            if (this.stickActive[s]) {
              b.isStuck = true;
              if (s === 'left' || s === 'right') {
                b.y = this.positions[s] + this.padSize[s] / 2;
                b.dx = 0;
                b.dy = 0;
              } else {
                b.x = this.positions[s] + this.padSize[s] / 2;
                b.dx = 0;
                b.dy = 0;
              }
              continue;
            }

            if (this.neonActive[s]) {
              b.dx *= 1.5;
              b.dy *= 1.5;
            }

            const pid = Object.keys(this.players).find(
              (id) => this.players[id].side === s,
            )!;
            if (this.players?.[pid]) {
              b.color = this.players[pid].color;
            }

            let impact = 0;
            if (s === 'left' || s === 'right') {
              impact = (b.y - (pos + sz / 2)) / (sz / 2);
              impact = Math.max(-1, Math.min(1, impact));
              const speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
              b.dy = speed * impact;
              b.dx =
                (s === 'left' ? 1 : -1) *
                Math.sqrt(Math.max(1, speed * speed - b.dy * b.dy));
            } else {
              impact = (b.x - (pos + sz / 2)) / (sz / 2);
              impact = Math.max(-1, Math.min(1, impact));
              const speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
              b.dx = speed * impact;
              b.dy =
                (s === 'top' ? 1 : -1) *
                Math.sqrt(Math.max(1, speed * speed - b.dx * b.dx));
            }
            b.dx += (Math.random() - 0.5) * 0.5;
            b.dy += (Math.random() - 0.5) * 0.5;
          }
        });
      }

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

      // Bola principal
      if (this.ball.y < 0) {
        if (numPlayers < 2) {
          bounceOffWall('y', 0);
        } else if (sideHasPlayer('top')) {
          // Só pontua se o último a bater NÃO for 'top'
          if (this.lastHitter && this.lastHitter !== 'top') {
            scored = this.lastHitter;
          } else {
            this.ball.dy *= -1;
            this.ball.y = 0;
          }
        } else {
          bounceOffWall('y', 0);
        }
      } else if (this.ball.y > 600) {
        if (numPlayers < 2) {
          bounceOffWall('y', 600);
        } else if (sideHasPlayer('bottom')) {
          if (this.lastHitter && this.lastHitter !== 'bottom') {
            scored = this.lastHitter;
          } else {
            this.ball.dy *= -1;
            this.ball.y = 600;
          }
        } else {
          bounceOffWall('y', 600);
        }
      }

      if (this.ball.x < 0) {
        if (numPlayers < 2) {
          bounceOffWall('x', 0);
        } else if (sideHasPlayer('left')) {
          if (this.lastHitter && this.lastHitter !== 'left') {
            scored = this.lastHitter;
          } else {
            this.ball.dx *= -1;
            this.ball.x = 0;
          }
        } else {
          bounceOffWall('x', 0);
        }
      } else if (this.ball.x > 800) {
        if (numPlayers < 2) {
          bounceOffWall('x', 800);
        } else if (sideHasPlayer('right')) {
          if (this.lastHitter && this.lastHitter !== 'right') {
            scored = this.lastHitter;
          } else {
            this.ball.dx *= -1;
            this.ball.x = 800;
          }
        } else {
          bounceOffWall('x', 800);
        }
      }
      if (this.duplicateBalls && this.duplicateBalls.length > 0) {
        for (const b of this.duplicateBalls) {
          if (b.y < 0) {
            b.y = 0;
            b.dy *= -1;
          } else if (b.y > 600) {
            b.y = 600;
            b.dy *= -1;
          }
          if (b.x < 0) {
            b.x = 0;
            b.dx *= -1;
          } else if (b.x > 800) {
            b.x = 800;
            b.dx *= -1;
          }
        }
      }

      // Paredes para bolas duplicadas
      if (this.duplicateBalls && this.duplicateBalls.length > 0) {
        for (const b of this.duplicateBalls) {
          if (b.y < 0) {
            b.y = 0;
            b.dy *= -1;
          } else if (b.y > 600) {
            b.y = 600;
            b.dy *= -1;
          }
          if (b.x < 0) {
            b.x = 0;
            b.dx *= -1;
          } else if (b.x > 800) {
            b.x = 800;
            b.dx *= -1;
          }
        }
      }

      if (scored) {
        this.score[scored]++;
        const pid = Object.keys(this.players).find(
          (id) => this.players[id].side === scored,
        )!;
        if (this.players?.[pid]) {
          this.server.emit('pointEffect', {
            side: scored,
            color: this.players[pid].color,
            background: this.players[pid].background,
          });
        }
        this.server.emit('ballReset');
        this.resetBall();
        this.duplicateBalls = [];
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
