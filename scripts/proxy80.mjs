// 호스트 기반 리버스 프록시 (HTTPS 443 + HTTP 80).
//
// 같은 Mac 에 여러 mDNS 이름이 걸려 있고(resonance.local / train.local …) 포트는 하나뿐이므로,
// Host 헤더를 보고 각 앱으로 넘긴다. 302 리다이렉트가 아니라 프록시라서
// 주소창에 포트가 드러나지 않는다 (https://resonance.local/... 그대로 유지).
//
// ── HTTPS 인 이유 ─────────────────────────────────────────────
// 브라우저의 마이크/카메라(getUserMedia)는 "보안 컨텍스트"에서만 동작한다.
// 평문 HTTP 면 폰에서 음성·비디오 인식이 아예 시작되지 않으므로 TLS 가 필요하다.
// .local 은 공인 CA 가 인증서를 발급할 수 없어(RFC 6762) mkcert 사설 CA 를 쓴다.
// → 기기마다 rootCA.pem 을 한 번 설치해야 경고 없이 열린다.
//
// 80 / 443 은 특권 포트(<1024)라 root 가 필요하다. LaunchDaemon 으로 띄우거나:
//   sudo node scripts/proxy80.mjs
// 비특권 포트로 시험(HTTP 만, TLS 없이):
//   PROXY_PORT=8080 PROXY_TLS=off node scripts/proxy80.mjs
//
// 주의: sail_training 의 scripts/forward80.mjs 도 80 을 쓴다. 둘 중 하나만 실행할 것.

import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";

/** Host 이름 → 로컬 포트 */
const ROUTES = {
  "resonance.local": 3100, // 선박 유지보수 디스플레이 (이 프로젝트)
  "train.local": 3006, // 세일링 트레이닝 런처 (com.sail.training 의 PORT)
  "nav.local": 8000, // 항해 조종석 (Resonance chartplotter — WS/프록시 포함, 엔진은 :8001)
};

// 참고: 3000 은 Signal K Server 가 쓰고 있다. 런처는 원래 80 을 직접 잡고 있었으나
// 이 프록시가 80 을 쓰게 되면서 3006 으로 옮겼다.

/** 매칭되는 호스트가 없을 때(예: IP 로 직접 접속) — 기존처럼 런처를 보여준다 */
const FALLBACK = Number(process.env.PROXY_FALLBACK || 3006);
const HTTP_PORT = Number(process.env.PROXY_PORT || 80);
const HTTPS_PORT = Number(process.env.PROXY_HTTPS_PORT || 443);

const CERT_DIR = process.env.PROXY_CERT_DIR || "/Users/Shared/boat_maintenance/certs";
const CERT_FILE = process.env.PROXY_CERT || `${CERT_DIR}/resonance.local+5.pem`;
const KEY_FILE = process.env.PROXY_KEY || `${CERT_DIR}/resonance.local+5-key.pem`;

/** 인증서를 못 읽으면 TLS 없이 HTTP 프록시로만 동작한다(기존 동작으로 안전하게 후퇴) */
function loadTls() {
  if (process.env.PROXY_TLS === "off") return null;
  try {
    return { cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) };
  } catch (err) {
    console.error(`[proxy] 인증서를 읽지 못해 HTTP 전용으로 동작합니다: ${err.message}`);
    return null;
  }
}
const tls = loadTls();

function targetFor(hostHeader) {
  const host = String(hostHeader || "").split(":")[0].toLowerCase();
  return ROUTES[host] ?? FALLBACK;
}

function forwardHeaders(req, proto) {
  // Host 는 원본 그대로 넘긴다 — Auth.js(AUTH_TRUST_HOST)가 콜백 URL 을 올바로 만든다.
  return {
    ...req.headers,
    "x-forwarded-host": req.headers.host ?? "",
    "x-forwarded-proto": proto,
    "x-forwarded-for": req.socket.remoteAddress ?? "",
  };
}

/** 실제 프록시 핸들러 (proto 는 클라이언트가 붙은 스킴) */
function proxyHandler(proto) {
  return (req, res) => {
    const port = targetFor(req.headers.host);
    const proxyReq = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: req.method,
        path: req.url,
        headers: forwardHeaders(req, proto),
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        // SSE(/api/telemetry) 가 지연 없이 흐르도록 버퍼링을 끈다
        res.socket?.setNoDelay(true);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (err) => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`502 — 백엔드(127.0.0.1:${port}) 연결 실패: ${err.message}\n`);
    });
    req.pipe(proxyReq);
  };
}

/** WebSocket 등 Upgrade 요청 통과 (signalk, 비디오 스트림 등) */
function upgradeHandler(proto) {
  return (req, socket, head) => {
    const port = targetFor(req.headers.host);
    const proxyReq = httpRequest({
      host: "127.0.0.1",
      port,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req, proto),
    });
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      const lines = Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join("\r\n")}\r\n\r\n`);
      if (proxyHead?.length) proxySocket.unshift(proxyHead);
      proxySocket.setNoDelay(true);
      socket.setNoDelay(true);
      proxySocket.pipe(socket).pipe(proxySocket);
    });
    proxyReq.on("error", () => socket.destroy());
    if (head?.length) req.unshift(head);
    req.pipe(proxyReq);
  };
}

/**
 * HTTPS 로 올려보내면 안 되는 경로.
 *
 * 루트 CA 파일이 그렇다. 기기가 아직 이 CA 를 신뢰하지 않는 상태에서 받아야 하는데,
 * https 로 리다이렉트하면 "신뢰하려면 먼저 신뢰해야 하는" 순환에 빠진다.
 * 공개 인증서(개인키 아님)이므로 평문으로 내보내도 안전하다.
 */
const HTTP_ONLY_PATHS = new Set(["/rootCA.crt", "/rootCA.pem"]);

/** TLS 가 있을 때 80 은 443 으로 올려보낸다 (마이크/카메라를 쓰려면 https 여야 하므로) */
function redirectToHttps(req, res) {
  const host = String(req.headers.host || "").split(":")[0];
  const suffix = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
  res.writeHead(301, { Location: `https://${host}${suffix}${req.url}` });
  res.end();
}

function describe(err, port) {
  if (err.code === "EACCES") return `포트 ${port} 권한 없음 — root 로 실행해야 합니다 (sudo).`;
  if (err.code === "EADDRINUSE") return `포트 ${port} 이미 사용 중 — 다른 서버를 끄세요.`;
  return `포트 ${port}: ${err.message}`;
}

function tune(server) {
  // SSE 연결이 프록시에서 조기에 끊기지 않도록 여유를 둔다
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  server.requestTimeout = 0;
  return server;
}

// ── HTTPS (가능하면) ──────────────────────────────────────────
// 443 확보에 실패해도 프로세스를 죽이지 않는다. 죽이면 80 까지 함께 내려가
// 모든 .local 사이트가 먹통이 되기 때문이다(실제로 그런 사고가 있었다).
let tlsUp = false;
const RETRY_MS = 30_000;

function startHttps() {
  const https = tune(createHttpsServer(tls, proxyHandler("https")));
  https.on("upgrade", upgradeHandler("https"));
  https.on("error", (err) => {
    tlsUp = false;
    console.error(`[proxy] HTTPS 비활성 — ${describe(err, HTTPS_PORT)}`);
    console.error(`[proxy] HTTP :${HTTP_PORT} 로 계속 서비스하며 ${RETRY_MS / 1000}초 후 재시도합니다.`);
    // 부팅 순서에 따라 다른 서비스(예: Tailscale)가 먼저 443 을 잡을 수 있다.
    // 그 서비스가 포트를 놓으면 스스로 회복하도록 계속 재시도한다.
    setTimeout(startHttps, RETRY_MS).unref?.();
  });
  https.listen(HTTPS_PORT, "0.0.0.0", () => {
    tlsUp = true;
    console.log(`[proxy] HTTPS :${HTTPS_PORT} 에서 대기`);
    for (const [host, port] of Object.entries(ROUTES)) {
      console.log(`  https://${host}  →  127.0.0.1:${port}`);
    }
    console.log(`  (그 외)          →  127.0.0.1:${FALLBACK}`);
  });
}

if (tls) startHttps();

// ── HTTP: HTTPS 가 "실제로 떠 있을 때만" 리다이렉트 ─────────────
// 인증서 존재 여부가 아니라 443 바인딩 성공 여부로 판단해야 한다.
// 그래야 443 이 죽어도 80 이 평소처럼 사이트를 서빙한다.
const httpProxy = proxyHandler("http");
const http = tune(
  createHttpServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    // 루트 CA 는 리다이렉트하지 않고 평문으로 그대로 내보낸다 (위 주석 참고)
    if (tlsUp && !HTTP_ONLY_PATHS.has(path)) return redirectToHttps(req, res);
    return httpProxy(req, res);
  }),
);
http.on("upgrade", (req, socket, head) => {
  if (tlsUp) return socket.destroy(); // 업그레이드는 https 쪽에서 처리
  upgradeHandler("http")(req, socket, head);
});
http.on("error", (err) => {
  console.error(`[proxy] ${describe(err, HTTP_PORT)}`);
  process.exit(1); // 80 조차 못 잡으면 재시도할 수밖에 없다
});
http.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[proxy] HTTP :${HTTP_PORT} 대기 (HTTPS 준비되면 자동으로 리다이렉트)`);
});
