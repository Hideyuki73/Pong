const canvas = document.getElementById('pong')
const ctx = canvas.getContext('2d')
const socket = io()

let side,
  joined = false,
  gameReady = false
let ability,
  fast = false
let timeStopped = false,
  stopperId = null
const neonTimers = { left: null, right: null, top: null, bottom: null }
const stickTimers = { left: null, right: null, top: null, bottom: null }
const telekinesisEffects = { left: null, right: null, top: null, bottom: null }
const pointEffects = { left: null, right: null, top: null, bottom: null }
const ballTrail = []
const duplicateBallTrails = []
const ballParticles = []
const MAX_TRAIL_LENGTH = 30
const shrinkBlink = { left: 0, right: 0, top: 0, bottom: 0 }
let currentBackground = { type: 'color', value: '#0a0a0a' }
let confetti = []
let flashWin = false,
  flashCount = 0

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

window.addEventListener('DOMContentLoaded', () => {
  const bgSelect = document.getElementById('bgSelect')
  const bgColorDiv = document.getElementById('bgColorDiv')
  const bgImageDiv = document.getElementById('bgImageDiv')
  const paddleGradient = document.getElementById('paddleGradient')
  const gradientColorDiv = document.getElementById('gradientColorDiv')
  const paddleGradientSecondColor = document.getElementById('paddleGradientSecondColor')
  const gradientPreview = document.getElementById('gradientPreview')

  const savedName = localStorage.getItem('pong_name') || ''
  const savedAbility = localStorage.getItem('pong_ability') || ''
  const savedColor = localStorage.getItem('pong_color') || '#ff0000'
  const savedGradientType = localStorage.getItem('pong_gradientType') || 'none'
  const savedGradientColor2 = localStorage.getItem('pong_gradientColor2') || '#ffffff'
  const savedBgType = localStorage.getItem('pong_bgType') || 'color'
  const savedBgColor = localStorage.getItem('pong_bgColor') || '#000000'
  const savedBgImage = localStorage.getItem('pong_bgImage') || ''

  document.getElementById('nameInput').value = savedName
  document.getElementById('abilitySelect').value = savedAbility
  document.getElementById('startColorPicker').value = savedColor
  document.getElementById('paddleGradient').value = savedGradientType
  document.getElementById('paddleGradientSecondColor').value = savedGradientColor2
  document.getElementById('bgSelect').value = savedBgType
  document.getElementById('bgColorPicker').value = savedBgColor
  document.getElementById('bgImageInput').value = savedBgImage

  // Mostrar/esconder inputs de cor ou imagem
  bgSelect.addEventListener('change', () => {
    if (bgSelect.value === 'color') {
      bgColorDiv.style.display = 'block'
      bgImageDiv.style.display = 'none'
    } else {
      bgColorDiv.style.display = 'none'
      bgImageDiv.style.display = 'block'
    }
  })

  // Mostrar campo de segunda cor se gradiente for diferente de "nenhum"
  paddleGradient.addEventListener('change', () => {
    if (paddleGradient.value === 'linear' || paddleGradient.value === 'radial') {
      gradientColorDiv.style.display = 'block'
    } else {
      gradientColorDiv.style.display = 'none'
    }
    updateGradientPreview()
  })

  // Atualizar preview do gradiente
  function updateGradientPreview() {
    if (paddleGradient.value === 'none') {
      gradientPreview.style.background = 'transparent'
      return
    }

    const color1 = document.getElementById('startColorPicker').value
    const color2 = paddleGradientSecondColor.value

    if (paddleGradient.value === 'linear') {
      gradientPreview.style.background = `linear-gradient(to right, ${color1}, ${color2})`
    } else if (paddleGradient.value === 'radial') {
      gradientPreview.style.background = `radial-gradient(circle, ${color1}, ${color2})`
    }
  }

  document.getElementById('startColorPicker').addEventListener('input', updateGradientPreview)
  paddleGradientSecondColor.addEventListener('input', updateGradientPreview)
  updateGradientPreview()

  // Botão de entrada
  document.getElementById('joinButton').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim() || 'Anon'
    const ability = document.getElementById('abilitySelect').value
    const color = document.getElementById('startColorPicker').value

    // Coletar valores de customização do background
    const bgSelect = document.getElementById('bgSelect')
    const bgColor = document.getElementById('bgColorPicker').value
    const bgImage = document.getElementById('bgImageInput').value.trim()

    // Coletar valores de customização do paddle (gradiente)
    const gradientType = document.getElementById('paddleGradient').value
    const gradientColor2 = document.getElementById('paddleGradientSecondColor').value

    // Aplicar fundo localmente no canvas
    if (bgImage && bgSelect.value === 'image') {
      canvas.style.background = `url('${bgImage}') center/cover no-repeat`
    } else {
      canvas.style.background = bgColor
    }

    // Armazenar configuração de gradiente para o paddle
    const customPaddleGradient = {
      type: gradientType,
      color1: color,
      color2: gradientColor2,
    }

    // Armazenar configuração do background escolhida
    // Usamos "value": pode ser a URL ou a cor, de acordo com o seletor
    const customBackground = {
      type: bgSelect.value, // 'color' ou 'image'
      value: bgSelect.value === 'image' ? bgImage : bgColor,
    }

    // Emitir join enviando nome, cor, habilidade, gradiente e background
    socket.emit('join', {
      name,
      color,
      ability,
      gradient: customPaddleGradient,
      background: customBackground,
    })

    joined = true

    localStorage.setItem('pong_name', name)
    localStorage.setItem('pong_ability', ability)
    localStorage.setItem('pong_color', color)
    localStorage.setItem('pong_gradientType', gradientType)
    localStorage.setItem('pong_gradientColor2', gradientColor2)
    localStorage.setItem('pong_bgType', bgSelect.value)
    localStorage.setItem('pong_bgColor', bgColor)
    localStorage.setItem('pong_bgImage', bgImage)

    document.getElementById('startModal').style.display = 'none'
  })
})

resetButton.addEventListener('click', () => {
  socket.emit('resetGame')
  joined = false
})

function updateScoreTable() {
  const sides = ['top', 'right', 'bottom', 'left'] // todos os possíveis lados
  scoreTableBody.innerHTML = sides
    .map((side) => {
      const player = Object.values(gameState.players).find((p) => p.side === side)
      const name = player ? player.name : '--'
      const color = player ? player.color : '#888'
      const victories = wins[side] || 0

      return `<tr>
          <td style="color:${color}; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${name}
          </td>
          <td style="text-align:center">${victories}</td>
        </tr>`
    })
    .join('')
}

function applyPaddleGradient(ctx, gradConf, s, pos, sz) {
  if (!gradConf || !gradConf.type || gradConf.type === 'none') {
    return null
  }

  if (gradConf.type === 'linear') {
    if (s === 'left' || s === 'right') {
      const grad = ctx.createLinearGradient(0, pos, 0, pos + sz)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    } else {
      // top ou bottom
      const grad = ctx.createLinearGradient(pos, 0, pos + sz, 0)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    }
  } else if (gradConf.type === 'radial') {
    if (s === 'left') {
      const centerX = 15
      const centerY = pos + sz / 2
      const radius = Math.min(50, sz / 2)
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    } else if (s === 'right') {
      const centerX = 785
      const centerY = pos + sz / 2
      const radius = Math.min(50, sz / 2)
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    } else if (s === 'top') {
      const centerX = pos + sz / 2
      const centerY = 15
      const radius = Math.min(50, sz / 2)
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    } else {
      const centerX = pos + sz / 2
      const centerY = 585
      const radius = Math.min(50, sz / 2)
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
      grad.addColorStop(0, gradConf.color1)
      grad.addColorStop(1, gradConf.color2)
      return grad
    }
  }
  return null
}

// Socket events
socket.on('side', (s) => (side = s))

socket.on('playersReady', () => {
  console.log('playersReady recebido')
  gameReady = true
  updateScoreTable()
})

socket.on('ballReset', () => (ballTrail.length = 0))

socket.on('state', (state) => {
  if (!timeStopped) {
    ballParticles.push({
      x: gameState.ball.x,
      y: gameState.ball.y,
      alpha: 1,
      radius: 2 + Math.random() * 2,
      color: gameState.ball.color || 'white',
    })
    if (ballParticles.length > 50) ballParticles.shift()
  }

  // Atualiza o estado do jogo
  gameState = state

  const sides = ['left', 'right', 'top', 'bottom']
  sides.forEach((side) => {
    const prev = gameState['prevScore_' + side]
    if (typeof prev === 'number' && gameState.score && gameState.score[side] > prev) {
      const player = Object.values(gameState.players || {}).find((p) => p.side === side)
      if (player) {
        pointEffects[side] = {
          name: player.name,
          color: player.color,
          start: performance.now(),
          duration: 1500,
        }
      }
    }
    gameState['prevScore_' + side] = gameState.score ? gameState.score[side] : 0
  })

  // Atualiza as bolas duplicadas
  gameState.duplicateBalls = state.duplicateBalls || []

  if (gameState.duplicateBalls) {
    // Atualize o trail de cada bola duplicada
    duplicateBallTrails.length = gameState.duplicateBalls.length
    gameState.duplicateBalls.forEach((b, i) => {
      if (!duplicateBallTrails[i]) duplicateBallTrails[i] = []
      duplicateBallTrails[i].push({ x: b.x, y: b.y, color: b.color })
      if (duplicateBallTrails[i].length > MAX_TRAIL_LENGTH) duplicateBallTrails[i].shift()
    })
  }
  // Atualiza timer
  document.getElementById('timer').innerText = `Tempo: ${state.remainingTime}s`

  const players = state.players
  const scores = state.score

  // Atualiza placar da esquerda (4 lados sempre mostrando nome e pontos)
  sides.forEach((side) => {
    const player = Object.values(players).find((p) => p.side === side)
    const name = player ? player.name : '--'
    const score = scores[side] || 0
    document.getElementById(`score-${side}`).innerText = `${name}: ${score}`
  })

  if (!gameOver) updateScoreTable()
})

socket.on('pointEffect', (data) => {
  if (data && data.background) {
    currentBackground = data.background

    if (currentBackground.type === 'image') {
      // Cria o objeto de imagem e adiciona os listeners
      const img = new Image()

      img.onload = () => {
        // Só depois de carregada, atribuímos ao currentBackground
        currentBackground.img = img
      }

      img.onerror = () => {
        console.error('Erro ao carregar a imagem de background:', currentBackground.value)
        // Se ocorrer erro, define um fallback (ex: cor preta)
        currentBackground = { type: 'color', value: '#000' }
      }

      img.src = currentBackground.value
    }
    // Dispara o efeito de texto de pontuação
    if (data && data.side && data.color) {
      const player = Object.values(gameState.players).find((p) => p.side === data.side)
      pointEffects[data.side] = {
        name: player ? player.name : data.side,
        color: data.color,
        start: performance.now(),
        duration: 1500,
      }
    }
  }
})

socket.on('abilityEffect', ({ side: s, type, color, effect }) => {
  switch (type) {
    case 'telekinesisOn':
      telekinesisEffects[s] = {
        start: performance.now(),
        duration: 1000,
        color: color || 'cyan',
        effect: effect || 'wave',
      }
      break

    case 'zigzagBall':
      if (!window.zigzagActive) window.zigzagActive = {}
      window.zigzagActive[s] = true
      setTimeout(() => (window.zigzagActive[s] = false), 3000)
      break

    case 'invertControls':
      window.invertControlsActive = true
      const invertFlash = document.createElement('div')
      invertFlash.style.position = 'fixed'
      invertFlash.style.left = 0
      invertFlash.style.top = 0
      invertFlash.style.width = '100vw'
      invertFlash.style.height = '100vh'
      invertFlash.style.background = 'rgba(255,0,0,0.15)'
      invertFlash.style.zIndex = 9999
      invertFlash.style.pointerEvents = 'none'
      document.body.appendChild(invertFlash)
      setTimeout(() => document.body.removeChild(invertFlash), 200)
      setTimeout(() => (window.invertControlsActive = false), 4000)
      break

    case 'ghostPaddle':
      if (!window.ghostPaddle) window.ghostPaddle = {}
      window.ghostPaddle[s] = true
      setTimeout(() => (window.ghostPaddle[s] = false), 4000)
      break

    case 'explosiveBall':
      flashWin = true
      flashCount = 0
      let waveFrame = 0
      const bx = gameState.ball.x
      const by = gameState.ball.y
      function drawWave() {
        if (waveFrame > 20) return
        ctx.save()
        ctx.globalAlpha = 0.25 * (1 - waveFrame / 20)
        ctx.strokeStyle = '#ff0'
        ctx.lineWidth = 8 + 8 * (1 - waveFrame / 20)
        ctx.beginPath()
        ctx.arc(bx, by, 30 + waveFrame * 8, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.restore()
        waveFrame++
        requestAnimationFrame(drawWave)
      }
      drawWave()
      for (let i = 0; i < 50; i++) {
        ballParticles.push({
          x: bx,
          y: by,
          alpha: 1,
          radius: 8 + Math.random() * 10,
          color: `hsl(${Math.random() * 60 + 20}, 100%, 60%)`,
          dx: Math.cos((i / 50) * 2 * Math.PI) * (4 + Math.random() * 3),
          dy: Math.sin((i / 50) * 2 * Math.PI) * (4 + Math.random() * 3),
        })
      }
      break

    case 'shrinkPaddle':
      shrinkBlink[s] = 60
      break

    case 'telekinesisOff':
      telekinesisEffects[s] = null
      break

    case 'magnet':
      if (!window.magnetActive) window.magnetActive = {}
      window.magnetActive[s] = true
      setTimeout(() => (window.magnetActive[s] = false), 3000)
      break
    case 'magnetOff':
      if (window.magnetActive) window.magnetActive[s] = false
      break

    case 'force':
      neonTimers[s] = (() => {
        const start = performance.now()
        const duration = 1000
        return function forceRay() {
          const now = performance.now()
          const progress = Math.min((now - start) / duration, 1)
          ctx.save()
          ctx.globalAlpha = 0.7 * (1 - progress)
          ctx.strokeStyle = 'magenta'
          ctx.lineWidth = 12 * (1 - progress) + 4
          ctx.shadowColor = 'magenta'
          ctx.shadowBlur = 60 * (1 - progress)
          const pos = gameState.positions[s]
          const sz = gameState.padSize[s]
          if (s === 'left') {
            ctx.beginPath()
            ctx.moveTo(25, pos)
            ctx.lineTo(60, pos + sz / 2)
            ctx.lineTo(25, pos + sz)
            ctx.stroke()
          }
          if (s === 'right') {
            ctx.beginPath()
            ctx.moveTo(775, pos)
            ctx.lineTo(740, pos + sz / 2)
            ctx.lineTo(775, pos + sz)
            ctx.stroke()
          }
          if (s === 'top') {
            ctx.beginPath()
            ctx.moveTo(pos, 25)
            ctx.lineTo(pos + sz / 2, 60)
            ctx.lineTo(pos + sz, 25)
            ctx.stroke()
          }
          if (s === 'bottom') {
            ctx.beginPath()
            ctx.moveTo(pos, 575)
            ctx.lineTo(pos + sz / 2, 540)
            ctx.lineTo(pos + sz, 575)
            ctx.stroke()
          }
          ctx.restore()
          if (progress >= 1) neonTimers[s] = null
        }
      })()
      break

    case 'grow':
      neonTimers[s] = (() => {
        const start = performance.now()
        const duration = 1000
        return function growPulse() {
          const now = performance.now()
          const progress = Math.min((now - start) / duration, 1)
          ctx.save()
          ctx.globalAlpha = 0.5 * (1 - progress)
          ctx.strokeStyle = 'lime'
          ctx.lineWidth = 16 * (1 - progress) + 4
          ctx.shadowColor = 'lime'
          ctx.shadowBlur = 40 * (1 - progress)
          const pos = gameState.positions[s]
          const sz = gameState.padSize[s]
          if (s === 'left')
            ctx.strokeRect(0 - 10 * progress, pos - 10 * progress, 30 + 20 * progress, sz + 20 * progress)
          if (s === 'right')
            ctx.strokeRect(770 - 10 * progress, pos - 10 * progress, 30 + 20 * progress, sz + 20 * progress)
          if (s === 'top')
            ctx.strokeRect(pos - 10 * progress, 0 - 10 * progress, sz + 20 * progress, 30 + 20 * progress)
          if (s === 'bottom')
            ctx.strokeRect(pos - 10 * progress, 570 - 10 * progress, sz + 20 * progress, 30 + 20 * progress)
          ctx.restore()
          if (progress >= 1) neonTimers[s] = null
        }
      })()
      break

    case 'stickOn':
      stickTimers[s] = () => {
        ctx.save()
        ctx.shadowColor = 'yellow'
        ctx.shadowBlur = 20
        ctx.strokeStyle = 'yellow'
        ctx.lineWidth = 8
        if (s === 'left') ctx.strokeRect(10, gameState.positions[s], 10, gameState.padSize[s])
        if (s === 'right') ctx.strokeRect(780, gameState.positions[s], 10, gameState.padSize[s])
        if (s === 'top') ctx.strokeRect(gameState.positions[s], 10, gameState.padSize[s], 10)
        if (s === 'bottom') ctx.strokeRect(gameState.positions[s], 580, gameState.padSize[s], 10)
        ctx.restore()
      }
      break

    case 'stickOff':
      stickTimers[s] = null
      break

    case 'timeStopOn':
      // Tela azulada para todos menos o que ativou
      if (side !== s) {
        document.body.style.filter = 'blur(2px) brightness(0.7) hue-rotate(180deg)'
      }
      timeStopped = true
      stopperId = s
      break

    case 'timeStopOff':
      document.body.style.filter = ''
      if (stopperId === s) {
        timeStopped = false
        stopperId = null
      }
      break

    case 'duplicateBall':
      const flash = document.createElement('div')
      flash.style.position = 'fixed'
      flash.style.left = 0
      flash.style.top = 0
      flash.style.width = '100vw'
      flash.style.height = '100vh'
      flash.style.background = 'rgba(255,255,255,0.2)'
      flash.style.zIndex = 9999
      flash.style.pointerEvents = 'none'
      document.body.appendChild(flash)
      setTimeout(() => document.body.removeChild(flash), 150)

      if (typeof multiplier !== 'undefined') {
        const msg = document.createElement('div')
        msg.textContent = `Multiplicou em ${multiplier} bolas!`
        msg.style.position = 'fixed'
        msg.style.top = '50%'
        msg.style.left = '50%'
        msg.style.transform = 'translate(-50%, -50%)'
        msg.style.fontSize = '2em'
        msg.style.color = '#fff'
        msg.style.textShadow = '2px 2px 8px #000'
        msg.style.zIndex = 10000
        document.body.appendChild(msg)
        setTimeout(() => document.body.removeChild(msg), 1000)
      }
      break

    case 'desconcentrar':
      document.body.classList.remove('shake')
      void document.body.offsetWidth
      document.body.classList.add('shake')
      setTimeout(() => document.body.classList.remove('shake'), 800)
      break
  }
})

socket.on('gameOver', ({ winner, score }) => {
  gameOver = true
  currentBackground = { type: 'color', value: '#0a0a0a' }
  winnerMessage.textContent =
    winner && winner !== '--' ? `Fim de jogo! Vencedor: ${winner}` : 'Fim de jogo! Nenhum vencedor (jogador saiu)'
  const p = Object.values(gameState.players).find((p) => p.name === winner)
  if (p) {
    wins[p.side]++
    updateScoreTable()
  }
  confetti = []
  for (let i = 0; i < 100; i++) {
    confetti.push({
      x: Math.random() * 800,
      y: Math.random() * 600,
      dx: (Math.random() - 0.5) * 4,
      dy: Math.random() * 3 + 2,
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      size: Math.random() * 6 + 4,
    })
  }
})

socket.on('resetToJoin', () => {
  gameOver = false
  timeStopped = false
  currentBackground = { type: 'color', value: '#0a0a0a' }
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
  currentBackground = { type: 'color', value: '#0a0a0a' }
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

  if (window.invertControlsActive) {
    if (dir === 'up') dir = 'down'
    else if (dir === 'down') dir = 'up'
    else if (dir === 'left') dir = 'right'
    else if (dir === 'right') dir = 'left'
  }

  // para garantir que o movimento seja iniciado corretamente
  if ((side === 'top' || side === 'bottom') && ['a', 'd', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault()
  }

  if (dir && !moveInterval) {
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
  const zigzagActive = window.zigzagActive && Object.values(window.zigzagActive).some(Boolean)

  if (flashWin && flashCount < 20) {
    ctx.fillStyle = flashCount % 2 === 0 ? '#fff' : '#000'
    ctx.fillRect(0, 0, 800, 600)
    flashCount++
    if (flashCount >= 20) flashWin = false
  }

  // Desenha o background conforme o estado atual
  if (!currentBackground) {
    currentBackground = { type: 'color', value: '#0a0a0a' }
  }
  if (currentBackground.type === 'image' && currentBackground.img) {
    if (currentBackground.img.complete) {
      ctx.drawImage(currentBackground.img, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  } else {
    ctx.fillStyle = currentBackground.value
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Se o game não estiver pronto, mostra mensagem de aguardo
  if (!gameReady) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, 800, 600)
    ctx.font = '36px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Aguardando...', 400, 300)
    return
  }

  // Trail da bola principal
  if (!timeStopped && ballTrail.length > 1) {
    for (let i = 1; i < ballTrail.length; i++) {
      const pt1 = ballTrail[i - 1]
      const pt2 = ballTrail[i]
      const t = i / ballTrail.length
      const alpha = 0.2 + 0.4 * t
      const width = gameState.ball.size * (0.5 + 0.7 * t)
      const grad = ctx.createLinearGradient(pt1.x, pt1.y, pt2.x, pt2.y)
      grad.addColorStop(0, pt1.color)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = grad
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(pt1.x, pt1.y)
      ctx.lineTo(pt2.x, pt2.y)
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  // Trail das bolas duplicadas
  if (!timeStopped && duplicateBallTrails.length > 0) {
    duplicateBallTrails.forEach((trail) => {
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const pt1 = trail[i - 1]
          const pt2 = trail[i]
          const t = i / trail.length
          const alpha = 0.2 + 0.4 * t
          const width = gameState.ball.size * (0.5 + 0.7 * t)
          const grad = ctx.createLinearGradient(pt1.x, pt1.y, pt2.x, pt2.y)
          grad.addColorStop(0, pt1.color)
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.strokeStyle = grad
          ctx.lineWidth = width
          ctx.beginPath()
          ctx.moveTo(pt1.x, pt1.y)
          ctx.lineTo(pt2.x, pt2.y)
          ctx.stroke()
          ctx.restore()
        }
      }
    })
    ctx.globalAlpha = 1
  }

  Object.entries(telekinesisEffects).forEach(([s, eff]) => {
    if (!eff) return
    const now = performance.now()
    const elapsed = now - eff.start
    if (elapsed > eff.duration) {
      telekinesisEffects[s] = null
      return
    }
    const pos = gameState.positions[s]
    const sz = gameState.padSize[s]
    const progress = elapsed / eff.duration
    ctx.save()
    ctx.globalAlpha = 1 - progress
    ctx.strokeStyle = eff.color
    ctx.lineWidth = 8 + 16 * (1 - progress)
    ctx.shadowColor = eff.color
    ctx.shadowBlur = 40 * (1 - progress)
    if (s === 'left') ctx.strokeRect(-10 + 30 * progress, pos - 20 * progress, 30 + 40 * progress, sz + 40 * progress)
    if (s === 'right') ctx.strokeRect(770 - 40 * progress, pos - 20 * progress, 30 + 40 * progress, sz + 40 * progress)
    if (s === 'top') ctx.strokeRect(pos - 20 * progress, -10 + 30 * progress, sz + 40 * progress, 30 + 40 * progress)
    if (s === 'bottom') ctx.strokeRect(pos - 20 * progress, 570 - 40 * progress, sz + 40 * progress, 30 + 40 * progress)
    ctx.restore()
  })

  // Desenha os paddles e demais detalhes
  sides.forEach((s) => {
    const p = Object.values(gameState.players).find((x) => x.side === s)
    if (!p) return
    const pos = gameState.positions[s],
      sz = gameState.padSize[s]

    // Aplica o gradiente do paddle
    const gradient = applyPaddleGradient(ctx, p.gradient, s, pos, sz)
    if (gradient) {
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = p.color
    }

    if (window.magnetActive && window.magnetActive[s]) {
      ctx.save()
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(performance.now() / 200)
      ctx.strokeStyle = '#00f6'
      ctx.lineWidth = 6
      const pos = gameState.positions[s],
        sz = gameState.padSize[s]
      let cx, cy
      if (s === 'left') {
        cx = 15
        cy = pos + sz / 2
      }
      if (s === 'right') {
        cx = 785
        cy = pos + sz / 2
      }
      if (s === 'top') {
        cx = pos + sz / 2
        cy = 15
      }
      if (s === 'bottom') {
        cx = pos + sz / 2
        cy = 585
      }
      for (let r = 30; r <= 60; r += 15) {
        ctx.beginPath()
        ctx.arc(cx, cy, r + 5 * Math.sin(performance.now() / 100 + r), 0, 2 * Math.PI)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Desenha a raquete conforme o side
    if (window.ghostPaddle && window.ghostPaddle[s]) {
      ctx.save()
      ctx.strokeStyle = 'rgba(200,200,255,' + (0.5 + 0.5 * Math.sin(performance.now() / 100)) + ')'
      ctx.lineWidth = 4
      if (s === 'left') ctx.strokeRect(10, pos, 10, sz)
      if (s === 'right') ctx.strokeRect(780, pos, 10, sz)
      if (s === 'top') ctx.strokeRect(pos, 10, sz, 10)
      if (s === 'bottom') ctx.strokeRect(pos, 580, sz, 10)
      ctx.restore()
    } else {
      // Desenho normal da raquete
      ctx.fillRect(
        s === 'left' ? 10 : s === 'right' ? 780 : gameState.positions[s],
        s === 'top' ? 10 : s === 'bottom' ? 580 : gameState.positions[s],
        s === 'left' || s === 'right' ? 10 : gameState.padSize[s],
        s === 'top' || s === 'bottom' ? 10 : gameState.padSize[s],
      )
    }

    if (neonTimers[s]) neonTimers[s]()
    if (stickTimers[s]) stickTimers[s]()

    if (shrinkBlink[s] > 0) {
      ctx.save()
      ctx.globalAlpha = 0.7
      ctx.strokeStyle = 'yellow'
      ctx.lineWidth = 6
      const pos = gameState.positions[s],
        sz = gameState.padSize[s]
      if (s === 'left') ctx.strokeRect(10, pos, 10, sz)
      if (s === 'right') ctx.strokeRect(780, pos, 10, sz)
      if (s === 'top') ctx.strokeRect(pos, 10, sz, 10)
      if (s === 'bottom') ctx.strokeRect(pos, 580, sz, 10)
      ctx.restore()
      shrinkBlink[s]--
    }

    // Desenha o nome do jogador
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

  // Efeito de partículas da bola principal
  for (const p of ballParticles) {
    ctx.save()
    ctx.globalAlpha = p.alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
    if (p.dx !== undefined) p.x += p.dx
    if (p.dy !== undefined) p.y += p.dy
    p.alpha *= 0.93
  }

  // Efeito de ponto marcado para cada jogador
  Object.entries(pointEffects).forEach(([side, eff]) => {
    if (!eff) return
    const now = performance.now()
    const elapsed = now - eff.start
    const progress = Math.min(elapsed / eff.duration, 1)
    if (progress < 1) {
      ctx.save()
      ctx.globalAlpha = 1 - progress
      ctx.font = `bold ${48 + 24 * (1 - progress)}px Arial`
      ctx.textAlign = 'center'
      ctx.shadowColor = eff.color
      ctx.shadowBlur = 40 * (1 - progress)
      ctx.fillStyle = eff.color
      // Posição do texto para cada lado
      let x = 400,
        y = 200
      if (side === 'left') {
        x = 180
        y = 200
      }
      if (side === 'right') {
        x = 620
        y = 200
      }
      if (side === 'top') {
        x = 400
        y = 100
      }
      if (side === 'bottom') {
        x = 400
        y = 350
      }
      ctx.fillText(`${eff.name} fez 1 ponto!`, x, y - 60 * progress)
      ctx.restore()
    } else {
      pointEffects[side] = null
    }
  })

  // Glow dinâmico e contorno neon nas bolas
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() / 150)
  const balls = [gameState.ball, ...(gameState.duplicateBalls || [])]
  balls.forEach((b) => {
    // Glow
    ctx.save()
    ctx.shadowColor = b.color || 'white'
    ctx.shadowBlur = 25 + 25 * glowPulse
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.size + 2, 0, 2 * Math.PI)
    ctx.fillStyle = b.color || 'white'
    ctx.fill()
    ctx.restore()

    // Contorno neon (agora usando a cor da bola)
    ctx.save()
    ctx.strokeStyle = b.color || 'white'
    ctx.lineWidth = 3 + 2 * glowPulse
    ctx.shadowColor = b.color || 'white'
    ctx.shadowBlur = 15 + 10 * glowPulse
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.size + 4, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.restore()

    // Bola (por cima dos efeitos)
    ctx.save()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.size, 0, 2 * Math.PI)
    ctx.fillStyle = b.color || 'white'
    ctx.fill()
    ctx.restore()

    // No draw das bolas, dentro do balls.forEach
    if (zigzagActive) {
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = `hsl(${Math.floor(performance.now() / 5) % 360}, 100%, 60%)`
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.size + 10, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.restore()
    }
  })

  confetti.forEach((c) => {
    ctx.save()
    ctx.fillStyle = c.color
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.size, 0, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
    c.x += c.dx
    c.y += c.dy
    c.dy += 0.1 // gravidade
  })
  confetti = confetti.filter((c) => c.y < 600)
}
;(function loop() {
  draw()
  requestAnimationFrame(loop)
})()
