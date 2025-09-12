export const handleGameMessage = (ws: any, wss: any, msg: any) => {
  switch (msg.type) {
    case "start_game":
      wss.clients.forEach((client: any) => {
        if (client.readyState === 1 && client.lobbyId === msg.lobbyId) {
          client.send(
            JSON.stringify({ type: "game_started", lobbyId: msg.lobbyId })
          );
        }
      });
      break;

    case "player_action":
      // logika gry, np. hit/stand
      break;
  }
};
