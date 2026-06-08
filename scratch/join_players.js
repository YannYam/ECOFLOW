const { io } = require('socket.io-client');

const pin = process.argv[2];
if (!pin) {
  console.error("Please provide a PIN");
  process.exit(1);
}

const players = ['Budi', 'Siti', 'Joko', 'Dewi', 'Ayu', 'Rizky', 'Putri', 'Toni'];

async function joinPlayers() {
  // Join 6 players with a small delay
  for (let i = 0; i < 6; i++) {
    const socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
      socket.emit('player:join', { gamePin: pin, nickname: players[i] });
    });
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log("6 players joined!");
  
  // Keep alive for a bit to let host render
  setTimeout(() => process.exit(0), 3000);
}

joinPlayers();
