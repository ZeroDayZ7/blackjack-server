import { lobbies } from '@ws/data/data.js';

export function broadcastLobbyList(wss: any) {
  const lobbyList = lobbies.map((l) => ({
    id: l.id,
    players: l.players,
    host: l.host,
    maxPlayers: l.maxPlayers,
    useBots: l.useBots,
  }));

  wss.clients.forEach((c: any) => {
    if (c.readyState === 1) {
      c.send(JSON.stringify({ type: 'lobby_list_update', lobbies: lobbyList }));
    }
  });
}
