import { GameClient } from "./game-client.js";
import { SERVER_HOST } from "../config.js";

export const client = new GameClient(SERVER_HOST);
