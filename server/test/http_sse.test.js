import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";

import { SSECapableServer, formatSseMessage } from "../http_sse.js";

function requestRaw(port, method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = Object.prototype.hasOwnProperty.call(options, "payload")
      ? options.payload
      : undefined;
    const body = payload === undefined ? null : JSON.stringify(payload);
    const requestHeaders = {
      ...(options.headers || {}),
    };

    if (body !== null && requestHeaders["Content-Type"] === undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    if (body !== null && requestHeaders["Content-Length"] === undefined) {
      requestHeaders["Content-Length"] = Buffer.byteLength(body);
    }

    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: requestHeaders,
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);

    if (body !== null) {
      req.write(body);
    }

    req.end();
  });
}

function requestJson(port, method, path, payload) {
  return requestRaw(port, method, path, { payload }).then((response) => ({
    statusCode: response.statusCode,
    headers: response.headers,
    json: response.text ? JSON.parse(response.text) : null,
  }));
}

test("route definition and JSON response", async (t) => {
  const server = new SSECapableServer();

  server.get("/health", (ctx) => {
    ctx.json(200, { ok: true, route: ctx.url.pathname });
  });

  const address = await server.listen(0, "127.0.0.1");

  t.after(async () => {
    await server.close();
  });

  const response = await requestJson(address.port, "GET", "/health");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { ok: true, route: "/health" });
});

test("POST route reads JSON body", async (t) => {
  const server = new SSECapableServer();

  server.post("/echo", async (ctx) => {
    const input = await ctx.readJson();
    ctx.json(200, { received: input });
  });

  const address = await server.listen(0, "127.0.0.1");

  t.after(async () => {
    await server.close();
  });

  const response = await requestJson(address.port, "POST", "/echo", {
    user: "Alice",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { received: { user: "Alice" } });
});

test("SSE client receives on-connect event and broadcast", async (t) => {
  const server = new SSECapableServer();

  server.sse("/events", (client) => {
    client.send({ event: "welcome", data: { connected: true } });
  });

  const address = await server.listen(0, "127.0.0.1");

  t.after(async () => {
    await server.close();
  });

  const req = httpRequest({
    host: "127.0.0.1",
    port: address.port,
    path: "/events",
    method: "GET",
    headers: {
      Accept: "text/event-stream",
    },
  });

  req.end();

  const [res] = await once(req, "response");
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"]), /text\/event-stream/u);

  const chunks = [];
  res.on("data", (chunk) => {
    chunks.push(chunk.toString("utf8"));
  });

  server.broadcast({ event: "tick", data: { n: 1 } });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for SSE payload."));
    }, 750);

    const doneIfReady = () => {
      const payload = chunks.join("");
      if (payload.includes("event: welcome") && payload.includes("event: tick")) {
        clearTimeout(timer);
        resolve();
      }
    };

    res.on("data", doneIfReady);
  });

  const fullPayload = chunks.join("");
  assert.match(fullPayload, /event: welcome/u);
  assert.match(fullPayload, /event: tick/u);
  assert.match(fullPayload, /data: \{"n":1\}/u);

  req.destroy();
  res.destroy();
});

test("formatSseMessage creates compliant SSE frames", () => {
  const message = formatSseMessage({
    id: "42",
    retry: 2000,
    event: "status",
    data: { ok: true },
  });

  assert.equal(
    message,
    "id: 42\nretry: 2000\nevent: status\ndata: {\"ok\":true}\n\n",
  );
});

test("default CORS policy allows every destination", async (t) => {
  const server = new SSECapableServer();

  server.get("/cors-default", (ctx) => {
    ctx.json(200, { ok: true });
  });

  const address = await server.listen(0, "127.0.0.1");

  t.after(async () => {
    await server.close();
  });

  const response = await requestRaw(address.port, "GET", "/cors-default");

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.equal(
    response.headers["access-control-allow-methods"],
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assert.equal(response.headers["access-control-allow-headers"], "*");
});

test("CORS options are configurable", async (t) => {
  const server = new SSECapableServer({
    cors: {
      origin: "https://example.com",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["X-Trace-Id"],
      credentials: true,
      maxAge: 600,
    },
  });

  server.get("/cors-custom", (ctx) => {
    ctx.json(200, { ok: true });
  });

  const address = await server.listen(0, "127.0.0.1");

  t.after(async () => {
    await server.close();
  });

  const response = await requestRaw(address.port, "OPTIONS", "/cors-custom", {
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://example.com",
  );
  assert.equal(response.headers["access-control-allow-methods"], "GET, POST");
  assert.equal(
    response.headers["access-control-allow-headers"],
    "Content-Type, Authorization",
  );
  assert.equal(response.headers["access-control-expose-headers"], "X-Trace-Id");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.equal(response.headers["access-control-max-age"], "600");
});
