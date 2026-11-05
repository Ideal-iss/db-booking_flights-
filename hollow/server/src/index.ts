/** Сервер кооператива THE HOLLOW (Colyseus). Запускается отдельно от Django, например на Render. */
import http from "node:http";
import express from "express";
import cors from "cors";
import RAPIER from "@dimforge/rapier3d-compat";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { HollowRoom, PARTY_SIZE } from "./room";
import { configured } from "./django";

await RAPIER.init();

const app = express();
app.use(cors());
app.get("/", (_req, res) => {
  res.json({ ok: true, name: "the-hollow-coop", partySize: PARTY_SIZE, configured: configured() });
});

const server = http.createServer(app);
const game = new Server({ transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 4 }) });
game.define("hollow", HollowRoom);

const port = Number(process.env.PORT || 2567);
await game.listen(port);
console.log(`THE HOLLOW co-op: порт ${port}, отряд до ${PARTY_SIZE}, секрет ${configured() ? "задан" : "НЕ задан"}`);
