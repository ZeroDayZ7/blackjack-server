import { Router } from "express";
import { createLobby, getAllLobbies, joinLobby, leaveLobby } from "src/handlers/lobbyHandlers.js";

const router = Router();

// --- Lobby ---
router.get("/lobbies", getAllLobbies); // pobierz wszystkie lobby
router.post("/lobbies", createLobby); // utwórz nowe lobby
router.post("/lobbies/:name/join", joinLobby); // dołącz do lobby
router.post("/lobbies/:name/start", leaveLobby); // rozpocznij grę
// router.post("/lobbies/:name/leave"); // opuść lobby

// // --- Blackjack ---
// router.post("/lobbies/:name/deal");   // rozdanie kart
// router.post("/lobbies/:name/hit");    // dobierz kartę
// router.post("/lobbies/:name/stand");  // pas
// router.post("/lobbies/:name/reset");  // zresetuj grę

export default router;
