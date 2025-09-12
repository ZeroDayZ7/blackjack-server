import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { setupWebSocket } from "./server/ws/wsServer.js";

const PORT = env.PORT || 5000;

const server = http.createServer(app);

// konfiguracja WS
const wss = setupWebSocket(server);
app.set("wss", wss);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} [${env.NODE_ENV}]`);
});
