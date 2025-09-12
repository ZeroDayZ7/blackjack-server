import { Router } from "express";
import { 
  createLobby, 
  getAllLobbies, 
  joinLobby, 
  leaveLobby, 
  startGame 
} from "src/handlers/lobbyHandlers.js";

const router = Router();

// --- Lobby ---
router.get("/lobbies", getAllLobbies);          // pobierz wszystkie lobby
router.post("/lobbies", createLobby);           // utwórz nowe lobby
router.post("/lobbies/:id/join", joinLobby);    // dołącz do lobby
router.post("/lobbies/:id/start", startGame);   // rozpocznij grę
router.post("/lobbies/:id/leave", leaveLobby);  // opuść lobby

// --- Blackjack / przyszłe endpointy ---
// router.post("/lobbies/:id/deal");
// router.post("/lobbies/:id/hit");
// router.post("/lobbies/:id/stand");
// router.post("/lobbies/:id/reset");

export default router;
