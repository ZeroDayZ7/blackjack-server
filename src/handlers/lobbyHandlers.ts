// handlers/lobbyHandlers.ts
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Lobby } from "../types/types.js"; // zakładam, że masz typ Lobby
import logger from "src/utils/logger.js";

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
  logger.info(`${JSON.stringify(req.body)}`);
  const { nick, lobbyName, maxPlayers = 2, useBots = true } = req.body;

  if (!nick || !lobbyName) {
    return res
      .status(400)
      .json({ success: false, error: "Missing nick or lobbyName" });
  }

  // ✅ Sprawdzenie, czy lobby o tej nazwie już istnieje
  const exists = lobbies.some((l) => l.name === lobbyName);
  if (exists) {
    return res
      .status(400)
      .json({ success: false, error: "Lobby name already exists" });
  }

  // ✅ Generujemy unikalny identyfikator
  const lobbyId = uuidv4();

  const lobby: Lobby = {
    id: lobbyId, // nowy UUID
    name: lobbyName,
    players: [nick],
    maxPlayers,
    useBots,
    started: false,
    host: nick,
  };

  lobbies.push(lobby);
  logger.info(`lobby created: ${JSON.stringify(lobby)}`);

  // Wyślij aktualizację do wszystkich klientów WS
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "lobby_list_update", lobbies }));
      }
    });
  }

  // Zwracamy lobby z UUID do frontendu
  res.json({ success: true, data: lobby });
};

/**
 * Dołącz do lobby
 */
export const joinLobby = (req: Request, res: Response) => {
  const { nick } = req.body;
  const { id } = req.params; // teraz id zamiast name

  const lobby = lobbies.find((l) => l.id === id);
  if (!lobby)
    return res.status(404).json({ success: false, error: "Lobby not found" });

  let finalNick = nick?.trim();
  if (!finalNick) {
    // generowanie unikalnego guest nick w tym lobby
    let i = 1;
    do {
      finalNick = `Guest-${Math.floor(Math.random() * 10000)}`;
      i++;
    } while (lobby.players.includes(finalNick) && i < 10);
  }

  if (lobby.players.includes(finalNick))
    return res
      .status(400)
      .json({ success: false, error: "Nick already taken" });

  if (lobby.players.length >= lobby.maxPlayers)
    return res.status(400).json({ success: false, error: "Lobby full" });

  lobby.players.push(finalNick);

  // Aktualizacja WS
  // Po dodaniu gracza do lobby
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({
            type: "lobby_update",
            lobby, // tylko to jedno lobby
          })
        );
      }
    });
  }

  res.json({ success: true, data: lobby, nick: finalNick });
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


/**
 * Start gry
 */
export const startGame = (req: Request, res: Response) => {
  const { id } = req.params;
  const lobby = lobbies.find(l => l.id === id);
  if (!lobby) {
    return res.status(404).json({ success: false, error: "Lobby not found" });
  }

  // Sprawdzenie minimalnej liczby graczy
  if (!lobby.useBots && lobby.players.length < 2) {
    return res.status(400).json({ success: false, error: "Not enough players to start the game" });
  }

  lobby.started = true;

  // Wyślij aktualizację tylko graczom w tym lobby
  const wss = req.app.get("wss");
  if (wss?.clients) {
    wss.clients.forEach((client: any) => {
      if (client.readyState !== 1) return;
      if (client.lobbyId === id) {
        client.send(JSON.stringify({ type: "game_started", lobby }));
      }
    });
  }

  res.json({ success: true, lobby });
};
