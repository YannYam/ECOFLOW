const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// ──────────────────────────────────────────────
// Server Setup
// ──────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// Load Questions
// ──────────────────────────────────────────────
const questionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf-8')
);

// ──────────────────────────────────────────────
// Serve Static Frontend
// ──────────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// GET / → Player join page (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// GET /host → Host dashboard (host.html)
app.get('/host', (req, res) => {
  res.sendFile(path.join(frontendPath, 'host.html'));
});

// GET /api/health → Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ──────────────────────────────────────────────
// In-Memory Game State
// ──────────────────────────────────────────────
const games = new Map();

function generatePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (games.has(pin));
  return pin;
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRankings(game) {
  const players = Array.from(game.players.values());
  players.sort((a, b) => b.score - a.score);
  return players.map((p, i) => ({
    nickname: p.nickname,
    score: p.score,
    rank: i + 1,
    streak: p.streak
  }));
}

// ──────────────────────────────────────────────
// Socket.IO Event Handling
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── HOST EVENTS ──────────────────────────────

  // Host creates a new game session
  socket.on('host:create', () => {
    const pin = generatePin();
    const questions = shuffleArray(questionsData).slice(0, 15);

    const game = {
      pin,
      hostSocketId: socket.id,
      status: 'lobby',
      currentQuestion: -1,
      questionStartTime: null,
      timerInterval: null,
      players: new Map(),
      questions
    };

    games.set(pin, game);
    socket.join(`game:${pin}`);
    socket.emit('game:created', { gamePin: pin });
    console.log(`[GAME CREATED] PIN: ${pin} by host ${socket.id}`);
  });

  // Host starts the quiz
  socket.on('host:start', ({ gamePin }) => {
    const game = games.get(gamePin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.players.size === 0) {
      socket.emit('game:error', { message: 'Tidak ada pemain yang bergabung!' });
      return;
    }

    game.status = 'playing';
    game.currentQuestion = -1;
    console.log(`[GAME STARTED] PIN: ${gamePin} with ${game.players.size} players`);

    // Send first question
    sendNextQuestion(game);
  });

  // Host advances to next question
  socket.on('host:next', ({ gamePin }) => {
    const game = games.get(gamePin);
    if (!game || game.hostSocketId !== socket.id) return;

    sendNextQuestion(game);
  });

  // Host finishes playing media
  socket.on('host:mediaFinished', ({ gamePin }) => {
    const game = games.get(gamePin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.status === 'showing_media') {
      const q = game.questions[game.currentQuestion];
      startQuestionPhase(game, q);
    }
  });

  // Host ends the game early
  socket.on('host:end', ({ gamePin }) => {
    const game = games.get(gamePin);
    if (!game || game.hostSocketId !== socket.id) return;

    endGame(game);
  });

  // ── PLAYER EVENTS ────────────────────────────

  // Player joins a game session
  socket.on('player:join', ({ gamePin, nickname }) => {
    const game = games.get(gamePin);

    if (!game) {
      socket.emit('game:joined', { success: false, message: 'Kode game tidak ditemukan!' });
      return;
    }
    if (game.status !== 'lobby') {
      socket.emit('game:joined', { success: false, message: 'Game sudah dimulai!' });
      return;
    }

    // Check duplicate nickname
    for (const [, player] of game.players) {
      if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
        socket.emit('game:joined', { success: false, message: 'Nickname sudah digunakan! Pilih yang lain.' });
        return;
      }
    }

    // Register player
    game.players.set(socket.id, {
      nickname,
      score: 0,
      answers: [],
      streak: 0,
      hasAnswered: false
    });

    socket.join(`game:${gamePin}`);
    socket.gamePin = gamePin;

    socket.emit('game:joined', { success: true, message: 'Berhasil bergabung!' });

    // Notify host
    io.to(game.hostSocketId).emit('game:playerJoined', {
      nickname,
      playerCount: game.players.size
    });

    console.log(`[PLAYER JOINED] ${nickname} → Game ${gamePin} (${game.players.size} players)`);
  });

  // Player submits an answer
  socket.on('player:answer', ({ gamePin, answerIndex, timeRemaining }) => {
    const game = games.get(gamePin);
    if (!game || game.status !== 'playing') return;

    const player = game.players.get(socket.id);
    if (!player || player.hasAnswered) return;

    player.hasAnswered = true;

    const currentQ = game.questions[game.currentQuestion];
    const isCorrect = answerIndex === currentQ.correctAnswer;

    let points = 0;
    if (isCorrect) {
      const speedBonus = Math.round(500 * (timeRemaining / currentQ.timeLimit));
      points = 1000 + speedBonus;
      player.streak += 1;
    } else {
      player.streak = 0;
    }

    player.score += points;
    player.answers.push({
      questionId: currentQ.id,
      answerIndex,
      correct: isCorrect,
      points
    });

    // Send individual result to the player
    socket.emit('game:answerResult', {
      correct: isCorrect,
      points,
      totalScore: player.score,
      streak: player.streak,
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation
    });

    // Update host with question stats
    const answeredCount = Array.from(game.players.values()).filter(p => p.hasAnswered).length;
    const correctCount = Array.from(game.players.values()).filter(p => {
      const lastAnswer = p.answers[p.answers.length - 1];
      return lastAnswer && lastAnswer.questionId === currentQ.id && lastAnswer.correct;
    }).length;

    // Answer distribution
    const distribution = [0, 0, 0, 0];
    for (const [, p] of game.players) {
      const lastAnswer = p.answers[p.answers.length - 1];
      if (lastAnswer && lastAnswer.questionId === currentQ.id) {
        distribution[lastAnswer.answerIndex]++;
      }
    }

    io.to(game.hostSocketId).emit('game:questionStats', {
      totalAnswered: answeredCount,
      totalPlayers: game.players.size,
      correctCount,
      distribution
    });

    // If all players answered, end the question early
    if (answeredCount === game.players.size) {
      clearTimerForGame(game);
      setTimeout(() => {
        showLeaderboard(game);
      }, 500);
    }
  });

  // ── DISCONNECT ───────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id}`);

    // Check if disconnected socket was a host
    for (const [pin, game] of games) {
      if (game.hostSocketId === socket.id) {
        // Host disconnected — end the game
        clearTimerForGame(game);
        io.to(`game:${pin}`).emit('game:hostDisconnected', {});
        games.delete(pin);
        console.log(`[GAME REMOVED] PIN: ${pin} (host disconnected)`);
        return;
      }

      // Check if disconnected socket was a player
      if (game.players.has(socket.id)) {
        const player = game.players.get(socket.id);
        game.players.delete(socket.id);
        io.to(game.hostSocketId).emit('game:playerLeft', {
          nickname: player.nickname,
          playerCount: game.players.size
        });
        console.log(`[PLAYER LEFT] ${player.nickname} from game ${pin}`);
        return;
      }
    }
  });
});

// ──────────────────────────────────────────────
// Game Logic Functions
// ──────────────────────────────────────────────

function sendNextQuestion(game) {
  game.currentQuestion += 1;

  // Check if all questions are done
  if (game.currentQuestion >= game.questions.length) {
    endGame(game);
    return;
  }

  const q = game.questions[game.currentQuestion];

  // Reset player answer state
  for (const [, player] of game.players) {
    player.hasAnswered = false;
  }

  if (q.mediaType === 'video') {
    game.status = 'showing_media';
    io.to(`game:${game.pin}`).emit('game:showMedia', {
      mediaUrl: q.mediaUrl,
      mediaType: q.mediaType
    });
  } else {
    startQuestionPhase(game, q);
  }
}

function startQuestionPhase(game, q) {
  game.status = 'playing';
  game.questionStartTime = Date.now();

  // Send question to all clients (without correct answer)
  io.to(`game:${game.pin}`).emit('game:question', {
    questionIndex: game.currentQuestion,
    totalQuestions: game.questions.length,
    questionText: q.question,
    category: q.category,
    options: q.options,
    timeLimit: q.timeLimit,
    mediaUrl: q.mediaUrl,
    mediaType: q.mediaType
  });

  // Start server-side timer
  let timeLeft = q.timeLimit;
  clearTimerForGame(game);

  game.timerInterval = setInterval(() => {
    timeLeft -= 1;
    if (timeLeft <= 0) {
      clearTimerForGame(game);
      io.to(`game:${game.pin}`).emit('game:timeUp', {});

      // Brief delay then show leaderboard
      setTimeout(() => {
        showLeaderboard(game);
      }, 2000);
    }
  }, 1000);
}

function clearTimerForGame(game) {
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
}

function showLeaderboard(game) {
  const rankings = getRankings(game);
  const isLastQuestion = game.currentQuestion >= game.questions.length - 1;
  const currentQ = game.questions[game.currentQuestion];

  io.to(`game:${game.pin}`).emit('game:leaderboard', {
    rankings: rankings.slice(0, 10),
    isLastQuestion,
    questionIndex: game.currentQuestion,
    totalQuestions: game.questions.length,
    correctAnswer: currentQ.correctAnswer,
    explanation: currentQ.explanation
  });
}

function endGame(game) {
  clearTimerForGame(game);
  game.status = 'finished';

  const rankings = getRankings(game);
  const top3 = rankings.slice(0, 3).map((p, i) => ({
    ...p,
    rank: i + 1
  }));

  io.to(`game:${game.pin}`).emit('game:podium', {
    top3,
    allRankings: rankings
  });

  console.log(`[GAME ENDED] PIN: ${game.pin}`);

  // Clean up game after a delay
  setTimeout(() => {
    games.delete(game.pin);
    console.log(`[GAME REMOVED] PIN: ${game.pin}`);
  }, 60000);
}

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🌊 ECOFLOW Server running!`);
  console.log(`   Player page : http://localhost:${PORT}`);
  console.log(`   Host page   : http://localhost:${PORT}/host\n`);
});
