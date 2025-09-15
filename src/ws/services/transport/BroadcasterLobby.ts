// src/ws/transport/BroadcasterLobby.ts
import { Server } from 'ws';
import { MyWebSocket } from '@types';
import { dataStore } from '@ws/data/data.js';
import logger from '@logger';

/** Wysyła aktualny stan lobby do wszystkich połączeń w lobby */
export function broadcastLobby(wss: Server, lobbyId: string) {
  const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
  if (!lobby) return;

  wss.clients.forEach((client: MyWebSocket) => {
    if (client.readyState === 1 && client.lobbyId === lobbyId) {
      client.send(JSON.stringify({ type: 'lobby_update', lobby }));
    }
  });
}

/** Obsługuje disconnect klienta */
export async function handleDisconnect(ws: MyWebSocket, wss: Server) {
  if (!ws.lobbyId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId' }));
    return;
  }

  if (!ws.nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick' }));
    return;
  }

  await dataStore.withLock(() => {
    const lobby = dataStore.getLobbies().find((l) => l.id === ws.lobbyId);
    if (!lobby) {
      ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
      return;
    }

    const nick = ws.nick;
    if (!nick) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing nick' }));
      return;
    }
    // ignorujemy boty
    if (nick.startsWith('Bot')) return;

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
      logger.info(`[LOBBY] Gracz ${nick} nie wrócił, usunięto z lobby ${lobby.id}`);

      broadcastLobby(wss, lobby.id);
    }, 15000);
  });
}
