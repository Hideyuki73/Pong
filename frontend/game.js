const canvas = document.getElementById('pong')
const ctx = canvas.getContext('2d')
const socket = io(`http://${window.location.hostname}:3001`)

let side,
  joined = false,
  gameReady = false
let ability,
  fast = false
let timeStopped = false,
  stopperId = null
const neonTimers = { left: null, right: null, top: null, bottom: null }
const stickTimers = { left: null, right: null, top: null, bottom: null }
const ballTrail = []
const MAX_TRAIL_LENGTH = 30

let gameState = {
  players: {},
  positions: { left: 250, right: 250, top: 350, bottom: 350 },
  ball: { x: 400, y: 300, size: 10, color: 'white' },
  score: { left: 0, right: 0, top: 0, bottom: 0 },
  remainingTime: 0,
  padSize: { left: 100, right: 100, top: 100, bottom: 100 },
}

const wins = { left: 0, right: 0, top: 0, bottom: 0 }
let gameOver = false

// DOM refs
const resetButton = document.getElementById('resetButton')
const winnerMessage = document.getElementById('winnerMessage')
const scoreTableBody = document.getElementById('scoreTableBody')
const lojaButton = document.getElementById('lojaButton')
const fecharLojaButton = document.getElementById('fecharLojaButton')

resetButton.addEventListener('click', () => {
  socket.emit('resetGame')
  joined = false
})

document.getElementById('joinButton').addEventListener('click', () => {
  const name = document.getElementById('nameInput').value.trim() || 'Anon'
  ability = document.getElementById('abilitySelect').value
  const color = document.getElementById('startColorPicker').value
  socket.emit('join', { name, color, ability })
  joined = true
  document.getElementById('startModal').style.display = 'none'
})

function updateScoreTable() {
  const sides = ['top', 'right', 'bottom', 'left'] // todos os possíveis lados
  scoreTableBody.innerHTML = sides
    .map((side) => {
      const player = Object.values(gameState.players).find((p) => p.side === side)
      const name = player ? player.name : '--'
      const color = player ? player.color : '#888'
      const victories = wins[side] || 0
      const points = gameState.score[side] || 0

      return `<tr>
        <td style="color:${color}">${name}</td>
        <td style="text-align:center">${victories}</td>
        <td style="text-align:center">${points}</td>
      </tr>`
    })
    .join('')
}

// Socket events
socket.on('side', (s) => (side = s))
socket.on('resetToJoin', () => {
  gameOver = false
  timeStopped = false
  stopperId = null
  document.getElementById('startModal').style.display = 'flex'
  winnerMessage.textContent = ''
  ballTrail.length = 0
})

socket.on('playersReady', () => {
  gameReady = true
  document.getElementById('startModal').style.display = 'none'
  updateScoreTable()
})
socket.on('ballReset', () => (ballTrail.length = 0))
socket.on('state', (state) => {
  if (!timeStopped && (gameState.ball.x !== state.ball.x || gameState.ball.y !== state.ball.y)) {
    ballTrail.push({ x: state.ball.x, y: state.ball.y, color: state.ball.color })
    if (ballTrail.length > MAX_TRAIL_LENGTH) ballTrail.shift()
  }

  // atualiza o gameState
  gameState = state

  // Atualiza timer
  document.getElementById('timer').innerText = `Tempo: ${state.remainingTime}s`

  const players = state.players
  const scores = state.score

  // Atualiza placar da esquerda (4 lados sempre mostrando nome e pontos)
  const sides = ['left', 'top', 'right', 'bottom']

  sides.forEach((side) => {
    const player = Object.values(players).find((p) => p.side === side)
    const name = player ? player.name : '--'
    const score = scores[side] || 0
    document.getElementById(`score-${side}`).innerText = `${name}: ${score}`
  })

  if (!gameOver) updateScoreTable()
})

socket.on('pointEffect', ({ side: s, color }) => {
  neonTimers[s] = () => {}
  setTimeout(() => (neonTimers[s] = null), 1000)
})
socket.on('abilityEffect', ({ side: s, type }) => {
  switch (type) {
    case 'force':
      neonTimers[s] = () => {}
      setTimeout(() => (neonTimers[s] = null), 1000)
      break
    case 'stickOn':
      stickTimers[s] = () => {}
      break
    case 'stickOff':
      stickTimers[s] = null
      break
    case 'timeStopOn':
      timeStopped = true
      stopperId = s
      break
    case 'timeStopOff':
      if (stopperId === s) {
        timeStopped = false
        stopperId = null
      }
      break
  }
})
socket.on('gameOver', ({ winner, score }) => {
  gameOver = true
  winnerMessage.textContent = `Fim de jogo! Vencedor: ${winner}`
  const p = Object.values(gameState.players).find((p) => p.name === winner)
  if (p) {
    wins[p.side]++ // incrementa o contador
    updateScoreTable() // redesenha a tabela já com o +1
  }
  updateScoreTable()
})
socket.on('resetToJoin', () => {
  gameOver = false
  timeStopped = false
  stopperId = null
  document.getElementById('startModal').style.display = 'flex'
  winnerMessage.textContent = ''
  ballTrail.length = 0
})
socket.on('gameReset', ({ remainingTime }) => {
  ballTrail.length = 0
  gameState.remainingTime = remainingTime
  gameState.score = { left: 0, right: 0, top: 0, bottom: 0 }
  gameOver = false
})

// Controls
let moveDirection = null,
  moveInterval = null

document.addEventListener('keydown', (e) => {
  if (!joined || !gameReady) return
  if (e.code.startsWith('Shift')) {
    fast = true
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    socket.emit('useAbility')
    return
  }
  if (timeStopped && side !== stopperId) return

  const key = e.key.toLowerCase()
  let dir = null
  // paddles verticais (left/right) usam W/S ou ↑/↓
  if (side === 'left' || side === 'right') {
    if (key === 'w' || key === 'arrowup') dir = 'up'
    if (key === 's' || key === 'arrowdown') dir = 'down'
  }
  // paddles horizontais (top/bottom) usam A/D ou ←/→
  if (side === 'top' || side === 'bottom') {
    if (key === 'a' || key === 'arrowleft') dir = 'left'
    if (key === 'd' || key === 'arrowright') dir = 'right'
  }

  if (dir && !moveInterval) {
    e.preventDefault()
    moveDirection = dir
    moveInterval = setInterval(() => socket.emit('move', { direction: moveDirection, fast }), 1000 / 60)
  }
})

document.addEventListener('keyup', (e) => {
  if (e.code.startsWith('Shift')) {
    fast = false
    return
  }
  if (!moveInterval) return
  const key = e.key.toLowerCase()

  if ((side === 'left' || side === 'right') && ['w', 's', 'arrowup', 'arrowdown'].includes(key)) {
    e.preventDefault()
    clearInterval(moveInterval)
    moveInterval = null
  }
  if ((side === 'top' || side === 'bottom') && ['a', 'd', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault()
    clearInterval(moveInterval)
    moveInterval = null
  }
})

// Drawing
const sides = ['left', 'right', 'top', 'bottom']
function draw() {
  if (!gameReady) {
    ctx.clearRect(0, 0, 800, 600)
    ctx.fillStyle = '#fff'
    ctx.font = '36px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Aguardando...', 400, 300)
    return
  }
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, 800, 600)
  if (!timeStopped) {
    ballTrail.forEach((pt, i) => {
      const alpha = (i / ballTrail.length) * 0.7,
        size = gameState.ball.size * (i / ballTrail.length)
      ctx.globalAlpha = alpha
      ctx.fillStyle = pt.color
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, size, 0, 2 * Math.PI)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }
  sides.forEach((s) => {
    const p = Object.values(gameState.players).find((x) => x.side === s)
    if (!p) return
    const pos = gameState.positions[s],
      sz = gameState.padSize[s]
    ctx.fillStyle = p.color
    if (s === 'left') ctx.fillRect(10, pos, 10, sz)
    if (s === 'right') ctx.fillRect(780, pos, 10, sz)
    if (s === 'top') ctx.fillRect(pos, 10, sz, 10)
    if (s === 'bottom') ctx.fillRect(pos, 580, sz, 10)
    if (neonTimers[s]) {
      ctx.save()
      ctx.strokeStyle = p.color
      ctx.lineWidth = 4
      if (s === 'left') ctx.strokeRect(8, pos - 2, 14, sz + 4)
      if (s === 'right') ctx.strokeRect(778, pos - 2, 14, sz + 4)
      if (s === 'top') ctx.strokeRect(pos - 2, 8, sz + 4, 14)
      if (s === 'bottom') ctx.strokeRect(pos - 2, 578, sz + 4, 14)
      ctx.restore()
    }
    if (stickTimers[s]) {
      ctx.save()
      ctx.strokeStyle = 'yellow'
      ctx.lineWidth = 4
      if (s === 'left') ctx.strokeRect(20, pos, 4, sz)
      if (s === 'right') ctx.strokeRect(776, pos, 4, sz)
      if (s === 'top') ctx.strokeRect(pos, 20, sz, 4)
      if (s === 'bottom') ctx.strokeRect(pos, 572, sz, 4)
      ctx.restore()
    }
    ctx.fillStyle = p.color
    ctx.font = '16px Arial'
    if (s === 'left') {
      ctx.textAlign = 'left'
      ctx.fillText(p.name, 15, pos - 10)
    }
    if (s === 'right') {
      ctx.textAlign = 'right'
      ctx.fillText(p.name, 785, pos - 10)
    }
    if (s === 'top') {
      ctx.textAlign = 'center'
      ctx.fillText(p.name, pos, 5)
    }
    if (s === 'bottom') {
      ctx.textAlign = 'center'
      ctx.fillText(p.name, pos, 595)
    }
  })
  const b = gameState.ball
  ctx.fillStyle = b.color
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.size, 0, 2 * Math.PI)
  ctx.fill()
}
;(function loop() {
  draw()
  requestAnimationFrame(loop)
})()
