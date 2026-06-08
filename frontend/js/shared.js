/* ══════════════════════════════════════════════
   ECOFLOW — Shared Utilities
   ══════════════════════════════════════════════ */

/**
 * Initialize Socket.IO connection
 */
function connectSocket() {
  const socket = io();
  socket.on('connect', () => console.log('[SOCKET] Connected:', socket.id));
  socket.on('disconnect', () => console.log('[SOCKET] Disconnected'));
  return socket;
}

/**
 * Show a specific screen and hide all others
 */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    // Re-trigger animation
    target.style.animation = 'none';
    target.offsetHeight; // reflow
    target.style.animation = '';
  }
}

/**
 * Create confetti effect
 */
function launchConfetti(duration = 4000) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#FFD700', '#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#EC4899', '#0EA5E9'];
  const shapes = ['square', 'circle'];
  const count = 80;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const size = Math.random() * 8 + 6;
    const left = Math.random() * 100;
    const animDuration = Math.random() * 2 + 2;
    const delay = Math.random() * 2;

    piece.style.cssText = `
      left: ${left}%;
      width: ${size}px; height: ${size}px;
      background: ${color};
      border-radius: ${shape === 'circle' ? '50%' : '2px'};
      animation-duration: ${animDuration}s;
      animation-delay: ${delay}s;
    `;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), duration + 3000);
}

/**
 * Format score with commas
 */
function formatScore(score) {
  return score.toLocaleString('id-ID');
}

/**
 * Get avatar emoji based on nickname
 */
function getAvatar(nickname) {
  const avatars = ['🦊', '🐸', '🐢', '🦋', '🐬', '🌿', '🌊', '🐠', '🦎', '🌺', '🍀', '🐋', '🦈', '🌻', '🐙', '🦩'];
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  return avatars[Math.abs(hash) % avatars.length];
}

/**
 * Category label helpers
 */
function getCategoryLabel(category) {
  return category === 'flood_control' ? 'Pengendalian Banjir' : 'Pencemaran Limbah';
}

function getCategoryClass(category) {
  return category === 'flood_control' ? 'flood' : 'waste';
}

/**
 * Create timer ring SVG
 */
function createTimerSVG() {
  return `
    <svg viewBox="0 0 100 100">
      <circle class="bg" cx="50" cy="50" r="44"/>
      <circle class="progress" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="0"/>
    </svg>
    <div class="time-text">0</div>
  `;
}

/**
 * Update timer ring
 */
function updateTimerRing(container, timeLeft, totalTime) {
  const circumference = 2 * Math.PI * 44; // 276.46
  const progress = container.querySelector('.progress');
  const text = container.querySelector('.time-text');
  const fraction = timeLeft / totalTime;
  const offset = circumference * (1 - fraction);

  progress.style.strokeDashoffset = offset;
  text.textContent = timeLeft;

  // Color transitions
  progress.classList.remove('warning', 'danger');
  if (fraction <= 0.25) {
    progress.classList.add('danger');
  } else if (fraction <= 0.5) {
    progress.classList.add('warning');
  }
}
