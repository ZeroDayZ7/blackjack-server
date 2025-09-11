// handlers/lobbyHandlers.ts
import { Request, Response } from "express";

export interface Lobby {
  name: string;
  players: string[];
  maxPlayers: number;
  useBots: boolean;
  started: boolean;
}

// tymczasowa pamięć na lobby
const lobbies: Lobby[] = [];

/**
 * Pobierz wszystkie lobby
 */
export const getAllLobbies = (_req: Request, res: Response) => {
  res.json({ success: true, data: lobbies });
};

/**
 * Utwórz nowe lobby
 */
export const createLobby = (req: Request, res: Response) => {
  const { nick, lobbyName, maxPlayers = 2, useBots = true } = req.body;

  if (!nick || !lobbyName) {
    return res
      .status(400)
      .json({ success: false, error: "Missing nick or lobbyName" });
  }

  const lobby: Lobby = {
    name: lobbyName,
    players: [nick],
    maxPlayers,
    useBots,
    started: false,
  };

  lobbies.push(lobby);

  // Wyślij aktualizację do wszystkich klientów WS, jeśli w app ustawiono wss
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      }
    });
  }

  res.json({ success: true, data: lobby });
};

/**
 * Dołącz do lobby
 */
export const joinLobby = (req: Request, res: Response) => {
  const { nick } = req.body;
  const { name } = req.params;

  const lobby = lobbies.find((l) => l.name === name);
  if (!lobby)
    return res.status(404).json({ success: false, error: "Lobby not found" });
  if (lobby.players.includes(nick))
    return res.status(400).json({ success: false, error: "Already in lobby" });
  if (lobby.players.length >= lobby.maxPlayers)
    return res.status(400).json({ success: false, error: "Lobby full" });

  lobby.players.push(nick);

  // Aktualizacja WS
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      }
    });
  }

  res.json({ success: true, data: lobby });
};

/**
 * Opuść lobby
 */
export const leaveLobby = (req: Request, res: Response) => {
  const { nick } = req.body;
  const { name } = req.params;

  const lobby = lobbies.find((l) => l.name === name);
  if (!lobby)
    return res.status(404).json({ success: false, error: "Lobby not found" });

  lobby.players = lobby.players.filter((p) => p !== nick);

  // Jeżeli lobby puste, usuń je
  if (lobby.players.length === 0) {
    const index = lobbies.findIndex((l) => l.name === name);
    lobbies.splice(index, 1);
  }

  // Aktualizacja WS
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      }
    });
  }

  res.json({ success: true, data: lobby || null });
};
