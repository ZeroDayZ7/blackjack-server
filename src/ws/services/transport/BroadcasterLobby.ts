import { Server } from 'ws';
import { MyWebSocket, Lobby } from '@types';
import { dataStore } from '@ws/data/data.js';
import logger from '@logger';

/**
 * BroadcasterLobby
 * ----------------
 * Odpowiada wyłącznie za zarządzanie lobby i listą lobby:
 * - broadcast pojedynczego lobby
 * - broadcast całej listy lobby
 * - obsługa disconnect gracza
 */

/** Wysyła dowolną wiadomość do wszystkich graczy w konkretnym lobby */
export function broadcastToLobby(wss: Server, lobby: Lobby, data: any) {
  wss.clients.forEach((client) => {
    const ws = client as MyWebSocket;
    if (ws.readyState === 1 && ws.lobbyId === lobby.id) {
      ws.send(JSON.stringify(data));
    }
  });
}

/** Wysyła aktualny stan lobby do wszystkich połączeń w tym lobby */
export function broadcastLobby(wss: Server, lobbyId: string) {
  const lobby = dataStore.getLobbies().find((l) => l.id === lobbyId);
  if (!lobby) return;

  wss.clients.forEach((client: MyWebSocket) => {
    if (client.readyState === 1 && client.lobbyId === lobbyId) {
      client.send(JSON.stringify({ type: 'lobby_update', lobby }));
    }
  });
}

/** Wysyła aktualny stan lobby do wszystkich połączeń w tym lobby */
export function broadcastLobbyUpdate(wss: Server, lobby: Lobby) {
  wss.clients.forEach((client: MyWebSocket) => {
    if (client.readyState === 1 && client.nick && lobby.players.includes(client.nick)) {
      client.send(JSON.stringify({ type: 'lobby_update', lobby }));
    }
  });
}

export function sendLobbyListTo(ws: MyWebSocket) {
  const lobbyList = dataStore.getLobbies().map((l) => ({
    id: l.id,
    name: l.name,
    players: l.players,
    host: l.host,
    maxPlayers: l.maxPlayers,
    useBots: l.useBots,
  }));

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'lobbies_updated', lobbies: lobbyList }));
  }
}

export function broadcastLobbyList(wss: Server) {
  dataStore.withLock(() => {
    const lobbyList = dataStore.getLobbies().map((l) => ({
      id: l.id,
      name: l.name,
      players: l.players,
      host: l.host,
      maxPlayers: l.maxPlayers,
      useBots: l.useBots,
    }));

    wss.clients.forEach((client: MyWebSocket) => {
      if (client.readyState === 1 && !client.inGame) {
        client.send(JSON.stringify({ type: 'lobby_list_update', lobbies: lobbyList }));
      }
    });

    logger.info('[BROADCAST] Lobby list sent to all clients');
  });
}

/** Obsługuje disconnect klienta z lobby (usuwanie, zmiana hosta, timeout) */
export async function handleDisconnect(ws: MyWebSocket, wss: Server) {
  // Guard clause – jeśli brak lobbyId lub nick, kończymy
  if (!ws.lobbyId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing lobbyId' }));
    return;
  }

  if (!ws.nick) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing nick' }));
    return;
  }

  // Bezpieczne przypisanie nicka do zmiennej typu string
  const nick: string = ws.nick;

  // Ignorujemy boty
  if (nick.startsWith('Bot')) return;

  await dataStore.withLock(() => {
    const lobby = dataStore.getLobbies().find((l) => l.id === ws.lobbyId);
    if (!lobby) return;

    // Usuń gracza z lobby
    lobby.players = lobby.players.filter((p) => p !== nick);

    // Jeśli host odłączył się, wybierz nowego hosta spośród ludzi
    if (lobby.host === nick) {
      const humanPlayers = lobby.players.filter((p) => !p.startsWith('Bot'));
      lobby.host = humanPlayers[0] || null;
    }

    // Broadcast aktualnego stanu lobby
    broadcastLobby(wss, lobby.id);

    // Timeout 15 sekund – jeśli gracz nie wróci, usuń go na stałe
    setTimeout(() => {
      if (!lobby.players.includes(nick)) return;

      lobby.players = lobby.players.filter((p) => p !== nick);
      logger.info(`[LOBBY] Gracz ${nick} nie wrócił, usunięto z lobby ${lobby.id}`);
      broadcastLobby(wss, lobby.id);
    }, 15000);
  });
}
