import type { Server } from 'ws';
import { dataStore } from '@ws/data/data.js';
import type { MyWebSocket } from '@types';

export async function handlePingLobbies(ws: MyWebSocket, wss: Server) {
  await dataStore.withLock(async () => {
    const lobbyList = dataStore.getLobbies().map((l) => ({
      id: l.id,
      players: l.players,
      host: l.host,
      maxPlayers: l.maxPlayers,
      useBots: l.useBots,
    }));

    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'lobby_list_update', lobbies: lobbyList }));
      }
    });
  });
}
