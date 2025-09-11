import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { WebSocketServer } from "ws";

const PORT = env.PORT || 5000;

// Tworzymy serwer HTTP
const server = http.createServer(app);

// Tworzymy WS na tym samym serwerze
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("New WS connection");

  ws.on("message", (msg) => {
    console.log("Received:", msg.toString());
    // broadcast do wszystkich
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(msg.toString());
    });
  });

  ws.on("close", () => console.log("Client disconnected"));
});

// Tutaj uruchamiasz **server**, a nie app.listen
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} [${env.NODE_ENV}]`);
});

// Możesz też trzymać w app referencję do WS, jeśli handlery będą broadcastować:
app.set("wss", wss);
