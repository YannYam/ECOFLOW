/* ══════════════════════════════════════════════
   ECOFLOW — Player Logic
   ══════════════════════════════════════════════ */
(function () {
  const socket = connectSocket();
  const STORAGE_KEY = 'ecoflow_nickname';

  // State
  let nickname = '';
  let gamePin = '';
  let currentTimeLeft = 0;
  let timerInterval = null;
  let currentTimeLimit = 20;
  let hasAnswered = false;
  let playerTotalScore = 0;

  // ── INIT ──────────────────────────────────────
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      nickname = saved.trim();
      showJoinScreen();
    } else {
      showScreen('screen-nickname');
    }
    bindEvents();
    bindSocketEvents();
  }

  // ── NICKNAME SCREEN ───────────────────────────
  function showJoinScreen() {
    document.getElementById('join-avatar').textContent = getAvatar(nickname);
    document.getElementById('join-nickname-display').textContent = nickname;
    showScreen('screen-join');
    document.getElementById('pin-input').focus();
  }

  // ── EVENT BINDINGS ────────────────────────────
  function bindEvents() {
    // Save nickname
    document.getElementById('btn-save-nickname').addEventListener('click', () => {
      const input = document.getElementById('nickname-input');
      const val = input.value.trim();
      if (!val || val.length < 2) {
        input.style.borderColor = 'var(--danger)';
        input.focus();
        return;
      }
      nickname = val;
      localStorage.setItem(STORAGE_KEY, nickname);
      showJoinScreen();
    });

    // Enter key on nickname
    document.getElementById('nickname-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-save-nickname').click();
      e.target.style.borderColor = '';
    });

    // Edit nickname
    document.getElementById('btn-edit-nickname').addEventListener('click', () => {
      document.getElementById('nickname-input').value = nickname;
      showScreen('screen-nickname');
      document.getElementById('nickname-input').focus();
    });

    // Join game
    document.getElementById('btn-join').addEventListener('click', joinGame);
    document.getElementById('pin-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinGame();
    });

    // PIN input — numbers only
    document.getElementById('pin-input').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    // Play again
    document.getElementById('btn-play-again').addEventListener('click', () => {
      gamePin = '';
      showJoinScreen();
    });

    // Back home from disconnect
    document.getElementById('btn-back-home').addEventListener('click', () => {
      gamePin = '';
      showJoinScreen();
    });
  }

  // ── JOIN GAME ─────────────────────────────────
  function joinGame() {
    const pinInput = document.getElementById('pin-input');
    const pin = pinInput.value.trim();
    const errorEl = document.getElementById('join-error');

    if (pin.length !== 6) {
      errorEl.textContent = 'Masukkan 6 digit kode game!';
      errorEl.style.display = 'block';
      pinInput.style.borderColor = 'var(--danger)';
      return;
    }

    errorEl.style.display = 'none';
    pinInput.style.borderColor = '';
    gamePin = pin;

    socket.emit('player:join', { gamePin: pin, nickname });
  }

  // ── SOCKET EVENTS ─────────────────────────────
  function bindSocketEvents() {
    // Join result
    socket.on('game:joined', ({ success, message }) => {
      if (success) {
        showScreen('screen-lobby');
      } else {
        const errorEl = document.getElementById('join-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }
    });

    // Show Media (Video phase)
    socket.on('game:showMedia', () => {
      showScreen('screen-media-wait');
    });

    // Question received
    socket.on('game:question', ({ questionIndex, totalQuestions, questionText, category, options, timeLimit }) => {
      hasAnswered = false;
      currentTimeLimit = timeLimit;
      currentTimeLeft = timeLimit;

      // Update header
      document.getElementById('q-category').textContent = getCategoryLabel(category);
      document.getElementById('q-category').className = 'question-category ' + getCategoryClass(category);
      document.getElementById('q-progress').textContent = `${questionIndex + 1} / ${totalQuestions}`;
      // Player does not see question text; they look at host screen
      // document.getElementById('q-text').textContent = questionText;

      // Timer
      const timerEl = document.getElementById('player-timer');
      timerEl.innerHTML = createTimerSVG();
      updateTimerRing(timerEl, currentTimeLeft, currentTimeLimit);

      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        currentTimeLeft -= 1;
        updateTimerRing(timerEl, Math.max(0, currentTimeLeft), currentTimeLimit);
        if (currentTimeLeft <= 0) clearInterval(timerInterval);
      }, 1000);

      // Answer buttons
      const container = document.getElementById('answers-container');
      const classes = ['opt-a', 'opt-b', 'opt-c', 'opt-d'];
      const icons = ['A', 'B', 'C', 'D'];
      container.innerHTML = options.map((opt, i) => `
        <button class="answer-btn player-only-btn ${classes[i]}" data-index="${i}">
          <span class="answer-icon-large">${icons[i]}</span>
        </button>
      `).join('');

      // Bind answer clicks
      container.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (hasAnswered) return;
          hasAnswered = true;
          clearInterval(timerInterval);

          const idx = parseInt(btn.dataset.index);
          btn.classList.add('selected');
          container.querySelectorAll('.answer-btn').forEach(b => b.classList.add('disabled'));

          socket.emit('player:answer', {
            gamePin,
            answerIndex: idx,
            timeRemaining: Math.max(0, currentTimeLeft)
          });
        });
      });

      showScreen('screen-question');
    });

    // Time up
    socket.on('game:timeUp', () => {
      clearInterval(timerInterval);
      if (!hasAnswered) {
        hasAnswered = true;
        document.querySelectorAll('.answer-btn').forEach(b => b.classList.add('disabled'));
        // Show result for no answer — use tracked total score
        showResult(false, 0, playerTotalScore, 0);
      }
    });

    // Answer result
    socket.on('game:answerResult', ({ correct, points, totalScore, streak, correctAnswer }) => {
      playerTotalScore = totalScore;
      showResult(correct, points, totalScore, streak);
    });

    // Leaderboard
    socket.on('game:leaderboard', ({ rankings, questionIndex, totalQuestions }) => {
      document.getElementById('lb-progress').textContent = `Pertanyaan ${questionIndex + 1} / ${totalQuestions}`;
      const list = document.getElementById('leaderboard-list');
      list.innerHTML = rankings.map((r, i) => {
        const isSelf = r.nickname.toLowerCase() === nickname.toLowerCase();
        let cls = 'lb-entry';
        if (isSelf) cls += ' self';
        if (i === 0) cls += ' top-1';
        else if (i === 1) cls += ' top-2';
        else if (i === 2) cls += ' top-3';
        return `
          <div class="${cls}">
            <div class="lb-rank">${r.rank}</div>
            <div class="lb-name">${getAvatar(r.nickname)} ${r.nickname}${r.streak >= 3 ? ' <span class="lb-streak">🔥' + r.streak + '</span>' : ''}</div>
            <div class="lb-score">${formatScore(r.score)}</div>
          </div>
        `;
      }).join('');
      showScreen('screen-leaderboard');
    });

    // Podium
    socket.on('game:podium', ({ top3, allRankings }) => {
      launchConfetti(5000);
      renderPodium(top3);
      // Show player's own rank
      const myRank = allRankings.find(r => r.nickname.toLowerCase() === nickname.toLowerCase());
      if (myRank) {
        document.getElementById('final-rank').textContent = `#${myRank.rank}`;
        document.getElementById('final-score').textContent = `${formatScore(myRank.score)} poin`;
      }
      showScreen('screen-podium');
    });

    // Host disconnected
    socket.on('game:hostDisconnected', () => {
      clearInterval(timerInterval);
      showScreen('screen-disconnected');
    });
  }

  // ── RESULT DISPLAY ────────────────────────────
  function showResult(correct, points, totalScore, streak) {
    document.getElementById('result-icon').textContent = correct ? '✅' : '❌';
    document.getElementById('result-text').textContent = correct ? 'Benar! 🎉' : 'Salah! 😅';
    document.getElementById('result-text').className = 'result-text ' + (correct ? 'correct' : 'incorrect');
    document.getElementById('result-points').textContent = correct ? `+${formatScore(points)}` : '+0';
    document.getElementById('result-total').textContent = `Total Skor: ${formatScore(totalScore)}`;

    const streakEl = document.getElementById('result-streak');
    if (streak >= 3) {
      streakEl.style.display = 'flex';
      streakEl.querySelector('span').textContent = streak;
    } else {
      streakEl.style.display = 'none';
    }

    if (!correct) {
      const screen = document.getElementById('screen-result');
      screen.classList.add('shake');
      setTimeout(() => screen.classList.remove('shake'), 500);
    }

    showScreen('screen-result');
  }

  // ── PODIUM RENDER ─────────────────────────────
  function renderPodium(top3) {
    const stage = document.getElementById('podium-stage');
    const placeLabels = ['first', 'second', 'third'];
    const medals = ['🥇', '🥈', '🥉'];

    // Ensure 3 entries (fill with empty if needed)
    while (top3.length < 3) {
      top3.push({ nickname: '—', score: 0, rank: top3.length + 1 });
    }

    stage.innerHTML = top3.map((p, i) => `
      <div class="podium-place">
        <div class="podium-avatar">${p.nickname !== '—' ? getAvatar(p.nickname) : '❓'}</div>
        <div class="podium-name">${p.nickname}</div>
        <div class="podium-score">${formatScore(p.score)} pts</div>
        <div class="podium-block ${placeLabels[i]}">${medals[i]}</div>
      </div>
    `).join('');
  }

  // ── START ─────────────────────────────────────
  init();
})();
