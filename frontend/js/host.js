/* ══════════════════════════════════════════════
   ECOFLOW — Host Logic
   ══════════════════════════════════════════════ */
(function () {
  const socket = connectSocket();

  // State
  let gamePin = '';
  let timerInterval = null;
  let currentTimeLeft = 0;
  let currentTimeLimit = 20;
  let totalPlayers = 0;
  let currentQuestionData = null;
  let isLastQuestion = false;
  let lastDistribution = null;
  let lastCorrectCount = 0;

  // ── INIT ──────────────────────────────────────
  function init() {
    showScreen('screen-host-home');
    bindEvents();
    bindSocketEvents();
  }

  // ── EVENT BINDINGS ────────────────────────────
  function bindEvents() {
    document.getElementById('btn-create-game').addEventListener('click', () => {
      socket.emit('host:create');
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      socket.emit('host:start', { gamePin });
    });

    document.getElementById('btn-cancel-game').addEventListener('click', () => {
      socket.emit('host:end', { gamePin });
      gamePin = '';
      showScreen('screen-host-home');
    });

    document.getElementById('btn-show-leaderboard').addEventListener('click', () => {
      showScreen('screen-host-leaderboard');
    });

    document.getElementById('btn-next-question').addEventListener('click', () => {
      socket.emit('host:next', { gamePin });
    });

    document.getElementById('btn-new-game').addEventListener('click', () => {
      gamePin = '';
      showScreen('screen-host-home');
    });

    document.getElementById('btn-skip-video').addEventListener('click', () => {
      const videoEl = document.getElementById('host-fullscreen-video');
      videoEl.pause();
      socket.emit('host:mediaFinished', { gamePin });
    });
  }

  // ── SOCKET EVENTS ─────────────────────────────
  function bindSocketEvents() {
    // Game created
    socket.on('game:created', ({ gamePin: pin }) => {
      gamePin = pin;
      document.getElementById('host-pin').textContent = pin;
      document.getElementById('host-player-count').textContent = '0';
      document.getElementById('host-player-list').innerHTML = '';
      showScreen('screen-host-lobby');
    });

    // Player joined
    socket.on('game:playerJoined', ({ nickname, playerCount }) => {
      totalPlayers = playerCount;
      document.getElementById('host-player-count').textContent = playerCount;
      const grid = document.getElementById('host-player-list');
      const card = document.createElement('div');
      card.className = 'player-card';
      card.dataset.nickname = nickname;

      // Random accent color per player
      const accents = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#EC4899', '#0EA5E9', '#F97316'];
      const accent = accents[Math.floor(Math.random() * accents.length)];
      card.style.setProperty('--card-accent', accent);
      card.style.animationDelay = `${(playerCount - 1) * 0.05}s`;

      card.innerHTML = `
        <div class="player-avatar">${getAvatar(nickname)}</div>
        <div class="player-name">${nickname}</div>
      `;
      grid.appendChild(card);
    });

    // Player left
    socket.on('game:playerLeft', ({ nickname, playerCount }) => {
      totalPlayers = playerCount;
      document.getElementById('host-player-count').textContent = playerCount;
      const cards = document.querySelectorAll('#host-player-list .player-card');
      cards.forEach(c => {
        if (c.dataset.nickname === nickname) c.remove();
      });
    });

    // Error
    socket.on('game:error', ({ message }) => {
      alert(message);
    });

    // Show Media (Fullscreen video before question)
    socket.on('game:showMedia', ({ mediaUrl, mediaType }) => {
      if (mediaType === 'video') {
        const videoEl = document.getElementById('host-fullscreen-video');
        videoEl.src = mediaUrl;
        showScreen('screen-host-media');
        
        videoEl.onended = () => {
          socket.emit('host:mediaFinished', { gamePin });
        };
        videoEl.play().catch(e => console.error("Auto-play prevented", e));
      }
    });

    // Question received
    socket.on('game:question', ({ questionIndex, totalQuestions, questionText, category, options, timeLimit, mediaUrl, mediaType }) => {
      currentQuestionData = { questionIndex, totalQuestions, questionText, category, options, timeLimit };
      currentTimeLimit = timeLimit;
      currentTimeLeft = timeLimit;
      lastDistribution = null;
      lastCorrectCount = 0;

      // Header
      document.getElementById('host-q-category').textContent = getCategoryLabel(category);
      document.getElementById('host-q-category').className = 'question-category ' + getCategoryClass(category);
      document.getElementById('host-q-progress').textContent = `${questionIndex + 1} / ${totalQuestions}`;
      document.getElementById('host-q-text').textContent = questionText;

      // Media (Photo)
      const mediaContainer = document.getElementById('host-q-media');
      if (mediaUrl && mediaType === 'image') {
        mediaContainer.innerHTML = `<img src="${mediaUrl}" alt="Question Image" style="max-width: 100%; max-height: 300px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.1);">`;
        mediaContainer.style.display = 'block';
      } else {
        mediaContainer.innerHTML = '';
        mediaContainer.style.display = 'none';
      }

      // Timer
      const timerEl = document.getElementById('host-timer');
      timerEl.innerHTML = createTimerSVG();
      updateTimerRing(timerEl, currentTimeLeft, currentTimeLimit);

      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        currentTimeLeft -= 1;
        updateTimerRing(timerEl, Math.max(0, currentTimeLeft), currentTimeLimit);
        if (currentTimeLeft <= 0) clearInterval(timerInterval);
      }, 1000);

      // Answer options (display only, not clickable)
      const container = document.getElementById('host-answers');
      const classes = ['opt-a', 'opt-b', 'opt-c', 'opt-d'];
      const icons = ['A', 'B', 'C', 'D'];
      container.innerHTML = options.map((opt, i) => `
        <div class="answer-btn ${classes[i]}" style="cursor:default;">
          <span class="answer-icon">${icons[i]}</span>
          <span>${opt}</span>
        </div>
      `).join('');

      // Response counter
      document.getElementById('host-answered').textContent = '0';
      document.getElementById('host-total-players').textContent = totalPlayers;

      showScreen('screen-host-question');
    });

    // Question stats update (single handler)
    socket.on('game:questionStats', ({ totalAnswered, totalPlayers: tp, correctCount, distribution }) => {
      totalPlayers = tp;
      lastDistribution = distribution;
      lastCorrectCount = correctCount;

      // Update live counter on question screen
      document.getElementById('host-answered').textContent = totalAnswered;
      document.getElementById('host-total-players').textContent = tp;

      // Also update results screen if it's visible
      document.getElementById('host-correct-count').textContent = correctCount;
      document.getElementById('host-result-total').textContent = tp;

      // Render distribution
      renderDistribution(distribution);
    });

    // Time up
    socket.on('game:timeUp', () => {
      clearInterval(timerInterval);
    });

    // Leaderboard
    socket.on('game:leaderboard', ({ rankings, isLastQuestion: lastQ, questionIndex, totalQuestions, correctAnswer, explanation }) => {
      isLastQuestion = lastQ;

      // Show results screen with cached distribution and explanation
      showResultsScreen(questionIndex, totalQuestions, correctAnswer, explanation);

      // Prepare leaderboard screen
      document.getElementById('host-lb-progress').textContent = `Pertanyaan ${questionIndex + 1} / ${totalQuestions}`;
      renderHostLeaderboard(rankings);

      // Update next button text
      const nextBtn = document.getElementById('btn-next-question');
      if (isLastQuestion) {
        nextBtn.textContent = 'Lihat Podium 🏆';
      } else {
        nextBtn.textContent = 'Pertanyaan Berikutnya ➡️';
      }
    });

    // Podium
    socket.on('game:podium', ({ top3, allRankings }) => {
      clearInterval(timerInterval);
      launchConfetti(6000);
      renderHostPodium(top3);
      renderHostFullRankings(allRankings);
      showScreen('screen-host-podium');
    });
  }

  // ── DISTRIBUTION RENDER ───────────────────────
  function renderDistribution(distribution) {
    if (!currentQuestionData || !distribution) return;
    const distEl = document.getElementById('host-distribution');
    const classes = ['opt-a', 'opt-b', 'opt-c', 'opt-d'];
    const icons = ['A', 'B', 'C', 'D'];

    distEl.innerHTML = currentQuestionData.options.map((opt, i) => `
      <div class="dist-bar ${classes[i]}">
        <span>${icons[i]}: ${opt.length > 30 ? opt.substring(0, 30) + '...' : opt}</span>
        <span class="dist-count">${distribution[i] || 0}</span>
      </div>
    `).join('');
  }

  // ── RESULTS SCREEN ────────────────────────────
  function showResultsScreen(questionIndex, totalQuestions, correctAnswerIndex, explanation) {
    document.getElementById('host-correct-count').textContent = lastCorrectCount;
    document.getElementById('host-result-total').textContent = totalPlayers;
    renderDistribution(lastDistribution);

    // Render explanation
    const correctText = currentQuestionData.options[correctAnswerIndex] || '-';
    document.getElementById('host-correct-text').textContent = correctText;
    document.getElementById('host-explanation-text').textContent = explanation || '';

    showScreen('screen-host-results');
  }

  // ── HOST LEADERBOARD ──────────────────────────
  function renderHostLeaderboard(rankings) {
    const list = document.getElementById('host-leaderboard-list');
    list.innerHTML = rankings.map((r, i) => {
      let cls = 'lb-entry';
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
  }

  // ── HOST PODIUM ───────────────────────────────
  function renderHostPodium(top3) {
    const stage = document.getElementById('host-podium-stage');
    const placeLabels = ['first', 'second', 'third'];
    const medals = ['🥇', '🥈', '🥉'];

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

  // ── FULL RANKINGS ─────────────────────────────
  function renderHostFullRankings(rankings) {
    const list = document.getElementById('host-full-rankings');
    list.innerHTML = rankings.map((r, i) => {
      let cls = 'lb-entry';
      if (i === 0) cls += ' top-1';
      else if (i === 1) cls += ' top-2';
      else if (i === 2) cls += ' top-3';
      return `
        <div class="${cls}">
          <div class="lb-rank">${r.rank}</div>
          <div class="lb-name">${getAvatar(r.nickname)} ${r.nickname}</div>
          <div class="lb-score">${formatScore(r.score)}</div>
        </div>
      `;
    }).join('');
  }

  // ── START ─────────────────────────────────────
  init();
})();
