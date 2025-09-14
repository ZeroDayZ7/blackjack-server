import { MyWebSocket } from '@types';
import { lobbies } from '../data/data.js';
import { Server } from 'ws';
import logger from '../../utils/logger.js';

export function broadcastLobby(wss: Server, lobbyId: string) {
  const lobby = lobbies.find((l) => l.id === lobbyId);
  if (!lobby) return;

  wss.clients.forEach((c: any) => {
    if (c.readyState === 1 && c.lobbyId === lobbyId) {
      c.send(JSON.stringify({ type: 'lobby_update', lobby }));
    }
  });
}

export function handleDisconnect(ws: MyWebSocket, wss: Server) {
  if (!ws.lobbyId || !ws.nick) return;
  const lobby = lobbies.find((l) => l.id === ws.lobbyId);
  if (!lobby) return;

  const nick = ws.nick;
  if (nick.startsWith('Bot')) return; // ignorujemy boty

  // Usuń gracza z lobby
  lobby.players = lobby.players.filter((p) => p !== nick);

  // Jeśli host odłączył się, wybierz nowego hosta spośród ludzi
  if (lobby.host === nick) {
    const humanPlayers = lobby.players.filter((p) => !p.startsWith('Bot'));
    lobby.host = humanPlayers[0] || null;
  }

  broadcastLobby(wss, lobby.id);

  // Odliczanie 15 sekund – jeśli gracz nie wróci, usuń go na stałe
  setTimeout(() => {
    const stillInLobby = lobby.players.includes(nick);
    if (!stillInLobby) return;
    lobby.players = lobby.players.filter((p) => p !== nick);
    logger.info(
      `[LOBBY] Gracz ${nick} nie wrócił, usunięto z lobby ${lobby.id}`,
    );
    broadcastLobby(wss, lobby.id);
  }, 15000);
}
