/* =============================================================
   ĐẠI CHIẾN ÁP SUẤT — server game nhiều người chơi qua mạng LAN
   Chạy:  node server.js        (không cần cài thư viện nào)
   ============================================================= */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const S = require('./public/shared.js').SHARED;

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ====== CÀI ĐẶT TRẬN ĐẤU (có thể chỉnh) ======
const CFG = {
  FIRST_COMBAT: 15,   // giây chiến đấu trước sự cố đầu tiên
  COMBAT: 12,         // giây chiến đấu giữa các sự cố
  QUIZ_TIME: 30,      // giây trả lời câu hỏi
  REVEAL_TIME: 4,     // giây xem đáp án
  LOCK_PICK_TIME: 5,  // giây để người nhanh nhất chọn đối thủ khóa van
  LOCK_DURATION: 3,   // giây đối thủ bị khóa van (đứng im)
  COUNTDOWN: 2,       // đếm ngược trước mỗi hiệp
  LEAK_DAMAGE: 20,    // máu mất khi trả lời sai
  DROUGHT_DPS: 15,    // máu mất mỗi giây khi đứng trong vùng hạn hán
  MAX_PLAYERS: 4,
  MIN_PLAYERS: 2,     // tối thiểu để bấm Bắt đầu (để chạy thử). Thi thật nên đủ 4.
};
if (process.env.FAST) Object.assign(CFG, { FIRST_COMBAT: 7, COMBAT: 6, QUIZ_TIME: 6, REVEAL_TIME: 3, LOCK_PICK_TIME: 4 }); // chế độ chạy thử nhanh
const RESPAWN_TIME = 4; // giây hồi sinh khi bị hạ trước vòng cuối
const RING_STEPS =[880, 700, 520, 360, 0]; // bán kính vùng an toàn sau mỗi sự cố
const BULLET_SPEED = 640, BULLET_LIFE = 0.5, WATER_COST = 2;

const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

// ====== PHỤC VỤ FILE ======
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '/screen') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ====== WEBSOCKET TỰ VIẾT ======
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();
let clientSeq = 0;
class Client {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = [];
    this.id = ++clientSeq; this.key = null; this.screen = false; this.alive = true; this.closed = false;
    sock.on('data', d => this.onData(d)); sock.on('close', () => this.close()); sock.on('error', () => this.close());
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; if (this.buf.readUInt32BE(2)) return this.close(); len = this.buf.readUInt32BE(6); off = 10; }
      if (len > 1e6) return this.close();
      const ml = masked ? 4 : 0;
      if (this.buf.length < off + ml + len) return;
      const payload = Buffer.from(this.buf.subarray(off + ml, off + ml + len));
      if (masked) { const m = this.buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(off + ml + len);
      this.alive = true;
      if (op === 0x8) { this.frame(0x8, Buffer.alloc(0)); return this.close(); }
      if (op === 0x9) { this.frame(0xA, payload); continue; }
      if (op === 0x1 || op === 0x0) {
        this.frag.push(payload);
        if (fin) { const t = Buffer.concat(this.frag).toString('utf8'); this.frag = []; onMessage(this, t); }
      }
    }
  }
  frame(op, payload) {
    if (this.closed) return;
    const len = payload.length; let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    try { this.sock.write(Buffer.concat([h, payload])); } catch (e) { }
  }
  sendRaw(str) { this.frame(0x1, Buffer.from(str, 'utf8')); }
  send(type, data) { this.sendRaw(JSON.stringify({ type, data })); }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.sock.destroy(); } catch (e) { }
    clients.delete(this); onDisconnect(this);
  }
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if ((req.url || '').split('?')[0] !== '/ws' || !key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  clients.add(new Client(sock));
});
setInterval(() => { for (const c of clients) { if (!c.alive) { c.close(); continue; } c.alive = false; c.frame(0x9, Buffer.alloc(0)); } }, 10000);

// ====== TRẠNG THÁI TRẬN ======
let game, nextId = 1, bulletSeq = 1;
function newPlayerStats(p) {
  const st = S.stats(p.char, []);
  const [sx, sy] = S.SPAWNS[p.char];
  Object.assign(p, {
    x: sx, y: sy, a: Math.atan2(S.CY - sy, S.CX - sx), hp: st.maxHp, w: st.maxWater, shield: 0,
    alive: true, lockT: 0, dashT: 0, dashCd: 0, dashDir: [1, 0], fireT: 0, sinceFire: 9,
    input: { m: 0, a: 0, f: 0, d: 0 }, lastDash: 0, kills: 0, correct: 0, gadgets: [],
    deathOrder: 0, respawnT: 0, lastHitBy: null, lastHitAt: -99, answer: null, answerTime: null, place: 0,
  });
}
function resetGame(keepPlayers) {
  const players = keepPlayers && game ? game.players : [];
  players.forEach(newPlayerStats);
  game = {
    phase: 'lobby', players, qIndex: -1, final: false, phaseEnds: 0, simTime: 0,
    bullets: [], events: [], ring: 960, ringTarget: 960, deathCount: 0,
    quiz: null, ranking: null, feed: [],
  };
}
resetGame(false);

const byKey = k => game.players.find(p => p.key === k);
const byId = id => game.players.find(p => p.id === id);
const host = () => game.players.find(p => p.connected) || game.players[0] || null;
const alive = () => game.players.filter(p => p.alive);
const now = () => Date.now();
const inMatch = () => !['lobby', 'ended'].includes(game.phase);

function setPhase(ph, ms) { game.phase = ph; game.phaseEnds = now() + ms; pushMeta(); }

function startMatch() {
  game.players.forEach(newPlayerStats);
  game.qIndex = -1; game.final = false; game.bullets = []; game.ring = 960; game.ringTarget = 960;
  game.deathCount = 0; game.ranking = null; game.quiz = null; game.feed = [];
  setPhase('countdown', CFG.COUNTDOWN * 1000);
}

function startQuiz(i) {
  game.qIndex = i; game.bullets = [];
    game.players.forEach(p => { if (!p.alive && !game.final) respawn(p); });
  game.players.forEach(p => { p.answer = null; p.answerTime = null; p.input.f = 0; });
  game.quiz = { index: i, startedAt: now(), results: null, fastestId: null, lockPicker: null, lockTarget: null, lockDone: false };
  setPhase('quiz', CFG.QUIZ_TIME * 1000);
  game.events.push({ k: 'alarm' });
}

function revealQuiz() {
  const q = QUESTIONS[game.qIndex], qz = game.quiz, g = S.GADGETS[game.qIndex % S.GADGETS.length];
  qz.results = [];
  for (const p of alive()) {
    const ok = p.answer === q.correct;
    const r = { id: p.id, answer: p.answer, correct: ok, time: p.answerTime, died: false };
    if (ok) {
      p.correct++;
      if (!p.gadgets.includes(g.id)) p.gadgets.push(g.id);
      const st = S.stats(p.char, p.gadgets);
      p.w = st.maxWater;
      if (g.id === 'valve') p.shield = 25;
    } else {
      p.hp -= CFG.LEAK_DAMAGE; p.w = 0;
      if (p.hp <= 0) { die(p, null, 'leak'); r.died = true; }
    }
    qz.results.push(r);
  }
  const fast = qz.results.filter(r => r.correct).sort((a, b) => a.time - b.time)[0];
  qz.fastestId = fast ? fast.id : null;
  game.ringTarget = RING_STEPS[Math.min(game.qIndex, RING_STEPS.length - 1)];
  const foes = fast ? alive().filter(p => p.id !== fast.id) : [];
  if (fast && foes.length && byId(fast.id).alive) {
    qz.lockPicker = fast.id;
    setPhase('reveal', CFG.LOCK_PICK_TIME * 1000);
  } else {
    qz.lockDone = true;
    setPhase('reveal', CFG.REVEAL_TIME * 1000);
  }
}

function doLock(picker, targetId) {
  const qz = game.quiz;
  if (!qz || qz.lockDone || qz.lockPicker !== picker.id) return;
  const t = byId(targetId);
  if (!t || !t.alive || t.id === picker.id) return;
  t.lockT = CFG.LOCK_DURATION;
  qz.lockTarget = t.id; qz.lockDone = true;
  game.feed.push({ k: 'lock', by: picker.id, v: t.id });
  game.phaseEnds = now() + 2000;
  pushMeta();
}

function afterReveal() {
  const qz = game.quiz;
  if (!qz.lockDone) { // hết giờ chọn -> tự khóa đối thủ nhiều máu nhất
    const picker = byId(qz.lockPicker);
    const t = alive().filter(p => p.id !== picker.id).sort((a, b) => b.hp - a.hp)[0];
    if (t) return doLock(picker, t.id);
    qz.lockDone = true;
  }
  if (game.final && alive().length <= 1) return endGame();
  if (game.qIndex >= QUESTIONS.length - 1) { game.players.forEach(p => { if (!p.alive) respawn(p); }); game.final = true; }
  setPhase('countdown', CFG.COUNTDOWN * 1000);
}

function die(p, killer, how) {
  if (!p.alive) return;
  p.alive = false; p.hp = 0; p.lockT = 0; p.dashT = 0;
      if (game.final) p.deathOrder = ++game.deathCount; else p.respawnT = RESPAWN_TIME;
  if (killer && killer.id !== p.id) killer.kills++;
  game.events.push({ k: 'kill', v: p.id, x: Math.round(p.x), y: Math.round(p.y) });
  game.feed.push({ k: 'kill', v: p.id, by: killer ? killer.id : null, how });
  if (game.feed.length > 30) game.feed.shift();
  pushMeta();
}

function respawn(p) {
    const st = S.stats(p.char, p.gadgets), sp = S.SPAWNS[p.char];
    Object.assign(p, { x: sp[0], y: sp[1], hp: st.maxHp, w: st.maxWater, alive: true, respawnT: 0, dashT: 0, lockT: 0 });
    game.events.push({ k: 'respawn', id: p.id });
    pushMeta();
  }
  function damage(p, amt, by) {
  if (!p.alive) return;
  if (p.shield > 0) { const a = Math.min(p.shield, amt); p.shield -= a; amt -= a; }
  p.hp -= amt;
  if (by) { p.lastHitBy = by.id; p.lastHitAt = game.simTime; }
  if (p.hp <= 0) die(p, by, 'water');
}

function endGame() {
  const rank = [...game.players].sort((a, b) =>
    (b.alive - a.alive) || (a.alive ? b.hp - a.hp : b.deathOrder - a.deathOrder) || b.kills - a.kills || b.correct - a.correct);
  rank.forEach((p, i) => { p.place = i + 1; });
  game.ranking = rank.map(p => p.id);
  game.bullets = [];
  setPhase('ended', 0);
}

// ====== VÒNG LẶP MÔ PHỎNG 30 LẦN/GIÂY ======
const TICK = 1000 / 30;
let lastTick = now(), snapCount = 0;
setInterval(() => {
  const t = now(); const dt = Math.min(0.1, (t - lastTick) / 1000); lastTick = t;
  // dọn phòng: mọi người đã thoát -> xóa trận cũ; người thoát ở phòng chờ quá 10 giây -> xóa chỗ
  if (game.players.length && !game.players.some(p => p.connected)) {
    if (!game.emptySince) game.emptySince = t;
    if (t - game.emptySince > 5000) { resetGame(false); pushMeta(); return; }
  } else game.emptySince = 0;
  if (game.phase === 'lobby') {
    const n = game.players.length;
    game.players = game.players.filter(p => p.connected || t - (p.discAt || t) < 10000);
    if (game.players.length !== n) pushMeta();
  }
  if (!inMatch()) return;

  // chuyển giai đoạn theo thời gian
  if (t >= game.phaseEnds) {
    if (game.phase === 'countdown') {
      game.phaseEnds = game.final ? Infinity : t + (game.qIndex < 0 ? CFG.FIRST_COMBAT : CFG.COMBAT) * 1000;
      game.phase = 'combat'; pushMeta();
    } else if (game.phase === 'combat') startQuiz(game.qIndex + 1);
    else if (game.phase === 'quiz') revealQuiz();
    else if (game.phase === 'reveal') afterReveal();
  }
  if (game.phase === 'combat') simulate(dt);
  if (!inMatch()) return;
  broadcastSnap();
}, TICK);

function simulate(dt) {
  game.simTime += dt;
  // thu hẹp vùng an toàn
  const ringSpeed = game.final ? 30 : 30;
  if (game.ring > game.ringTarget) game.ring = Math.max(game.ringTarget, game.ring - ringSpeed * dt);

  for (const p of game.players) if (!p.alive && p.respawnT > 0 && !game.final) { p.respawnT -= dt; if (p.respawnT <= 0) respawn(p); }
  for (const p of game.players) {
    if (!p.alive) continue;
    const st = S.stats(p.char, p.gadgets);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.fireT = Math.max(0, p.fireT - dt);
    p.sinceFire += dt;
    if (p.lockT > 0) { p.lockT = Math.max(0, p.lockT - dt); p.dashT = 0; continue; }

    const m = p.input.m;
    let mx = ((m & 8) ? 1 : 0) - ((m & 4) ? 1 : 0), my = ((m & 2) ? 1 : 0) - ((m & 1) ? 1 : 0);
    const ml = Math.hypot(mx, my); if (ml) { mx /= ml; my /= ml; }
    p.a = p.input.a;

    // lướt
    if (p.input.d !== p.lastDash) {
      p.lastDash = p.input.d;
      if (p.dashCd <= 0) {
        p.dashT = S.MOVE.DASH_TIME; p.dashCd = st.dashCd;
        p.dashDir = ml ? [mx, my] : [Math.cos(p.a), Math.sin(p.a)];
        game.events.push({ k: 'dash', id: p.id });
      }
    }
    let vx = mx * st.speed, vy = my * st.speed;
    if (p.dashT > 0) { p.dashT -= dt; vx = p.dashDir[0] * st.speed * S.MOVE.DASH_MULT; vy = p.dashDir[1] * st.speed * S.MOVE.DASH_MULT; }
    p.x += vx * dt; p.y += vy * dt;
    S.resolve(p, S.PR);

    // phun nước
    if (p.input.f && p.fireT <= 0 && p.w >= WATER_COST) {
      p.fireT = st.fireMs / 1000; p.w -= WATER_COST; p.sinceFire = 0;
      const angles = st.spread ? [-0.17, 0, 0.17] : [0];
      for (const da of angles) {
        const a = p.a + da + (Math.random() - 0.5) * 0.07;
        const nx = p.x + Math.cos(p.a) * 30, ny = p.y + Math.sin(p.a) * 30;
        if (S.blocked(nx, ny)) { game.events.push({ k: 'splash', x: Math.round(nx), y: Math.round(ny) }); continue; }
        game.bullets.push({ id: bulletSeq++, x: nx, y: ny, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED,
          life: BULLET_LIFE, owner: p.id, dmg: st.dmg });
      }
    }
    // hồi nước: tự hồi chậm, đứng ở trạm bơm hồi rất nhanh
    const atPump = Math.hypot(p.x - S.CX, p.y - S.CY) < S.PUMP_R;
    if (atPump) p.w += 70 * dt; else if (p.sinceFire > 0.5) p.w += st.regen * dt;
    p.w = Math.min(p.w, st.maxWater);
    p.atPump = atPump;

    // vùng hạn hán
    if (Math.hypot(p.x - S.CX, p.y - S.CY) > game.ring) {
      p.hp -= CFG.DROUGHT_DPS * dt;
      if (p.hp <= 0) {
        const k = p.lastHitBy && game.simTime - p.lastHitAt < 6 ? byId(p.lastHitBy) : null;
        die(p, k, 'drought');
      }
    }
  }

  // đẩy các nhân vật không chồng lên nhau
  const al = alive();
  for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
    const a = al[i], b = al[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, m = S.PR * 2;
    if (d < m) { const push = (m - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; S.resolve(a, S.PR); S.resolve(b, S.PR); }
  }

  // tia nước
  const keep = [];
  for (const b of game.bullets) {
    b.life -= dt;
    const steps = 2; let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (S.blocked(b.x, b.y)) { game.events.push({ k: 'splash', x: Math.round(b.x), y: Math.round(b.y) }); dead = true; break; }
      for (const p of al) {
        if (!p.alive || p.id === b.owner) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (S.PR + 5) * (S.PR + 5)) {
          const shielded = p.shield > 0;
          damage(p, b.dmg, byId(b.owner));
          game.events.push({ k: 'hit', id: p.id, by: b.owner, x: Math.round(b.x), y: Math.round(b.y), s: shielded ? 1 : 0 });
          dead = true; break;
        }
      }
    }
    if (!dead && b.life <= 0) { game.events.push({ k: 'drip', x: Math.round(b.x), y: Math.round(b.y) }); dead = true; }
    if (!dead) keep.push(b);
  }
  game.bullets = keep;

  if (game.final && alive().length <= 1 && game.players.length > 1) endGame();
}

function broadcastSnap() {
  const t = now();
  const snap = {
    ph: game.phase, pr: game.phaseEnds === Infinity ? -1 : Math.max(0, game.phaseEnds - t), ring: Math.round(game.ring), rt: game.ringTarget,
    p: game.players.map(p => [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.a * 100) / 100,
      Math.max(0, Math.round(p.hp)), Math.round(p.w), Math.round(p.shield),
      (p.alive ? 1 : 0) | (p.lockT > 0 ? 2 : 0) | (p.dashT > 0 ? 4 : 0) | (p.sinceFire < 0.15 ? 8 : 0) | (p.atPump ? 16 : 0),
      Math.round(p.dashCd * 10) / 10, Math.round(p.lockT * 10) / 10, Math.ceil(p.respawnT)]),
    b: game.bullets.map(b => [b.id, Math.round(b.x), Math.round(b.y), b.owner]),
    e: game.events,
  };
  game.events = [];
  const str = JSON.stringify({ type: 'snap', data: snap });
  for (const c of clients) c.sendRaw(str);
}

// ====== THÔNG TIN CHUNG (gửi khi có thay đổi) ======
function metaFor(c) {
  const me = c.key ? byKey(c.key) : null, h = host();
  const q = game.qIndex >= 0 ? QUESTIONS[game.qIndex] : null;
  const showQ = game.phase === 'quiz' || game.phase === 'reveal';
  const reveal = game.phase === 'reveal';
  return {
    phase: game.phase, myId: me ? me.id : null, hostId: h ? h.id : null, isScreen: c.screen,
    addresses: lanAddresses(), qIndex: game.qIndex, total: QUESTIONS.length, final: game.final, cfg: CFG,
    players: game.players.map(p => ({
      id: p.id, name: p.name, team: p.team, char: p.char, connected: p.connected, kills: p.kills, correct: p.correct,
      gadgets: p.gadgets, alive: p.alive, place: p.place, answered: p.answer !== null,
      answer: reveal || (me && me.id === p.id) ? p.answer : null,
    })),
    quiz: showQ && q ? {
      text: q.question, options: q.options, topic: q.topic || '', gadget: S.GADGETS[game.qIndex % S.GADGETS.length],
      correct: reveal ? q.correct : null, explain: reveal ? q.explain : null,
      results: reveal ? game.quiz.results : null, fastestId: reveal ? game.quiz.fastestId : null,
      lockPicker: reveal ? game.quiz.lockPicker : null, lockTarget: game.quiz.lockTarget, lockDone: game.quiz.lockDone,
    } : null,
    feed: game.feed.slice(-6),
    ranking: game.ranking,
  };
}
function pushMeta() { for (const c of clients) c.send('meta', metaFor(c)); }

// ====== NHẬN TIN TỪ CÁC MÁY ======
function onMessage(c, text) {
  let msg; try { msg = JSON.parse(text); } catch (e) { return; }
  const { type, data = {} } = msg || {};
  const me = c.key ? byKey(c.key) : null;
  const isHost = me && host() && host().id === me.id;
  const err = t => c.send('error', t);
  switch (type) {
    case 'hello': {
      if (typeof data.key === 'string' && data.key.length <= 64) {
        c.key = data.key; const p = byKey(c.key);
        if (p) { p.connected = true; p.clientId = c.id; }
      }
      c.screen = !!data.screen;
      return pushMeta();
    }
    case 'join': {
      if (!c.key) return err('Lỗi kết nối, hãy tải lại trang.');
      if (byKey(c.key)) return pushMeta();
      const name = String(data.name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
      const team = Number(data.team), ch = Number(data.char);
      if (game.phase !== 'lobby') { // vào lại sau khi lỡ đóng tab
        const old = game.players.find(p => !p.connected && p.team === team && p.name.toLowerCase() === name.toLowerCase());
        if (old) { old.key = c.key; old.connected = true; old.clientId = c.id; c.screen = false; return pushMeta(); }
        return err('Trận đấu đang diễn ra, hãy chờ trận sau.');
      }
      if (!name) return err('Hãy nhập tên của bạn.');
      if (!(team >= 1 && team <= 4)) return err('Hãy chọn tổ.');
      if (!(ch >= 0 && ch <= 3)) return err('Hãy chọn nhân vật.');
      // chỗ của người đã mất kết nối thì cho người mới thay
      game.players = game.players.filter(p => p.connected || (p.team !== team && p.char !== ch));
      if (game.players.find(p => p.team === team)) return err(`${S.TEAMS[team - 1]} đã có người vào rồi.`);
      if (game.players.find(p => p.char === ch)) return err(`Nhân vật ${S.CHARS[ch].name} đã có người chọn.`);
      if (game.players.length >= CFG.MAX_PLAYERS) return err('Phòng đã đủ 4 người.');
      const p = { id: nextId++, key: c.key, name, team, char: ch, connected: true, clientId: c.id };
      newPlayerStats(p); game.players.push(p); c.screen = false;
      return pushMeta();
    }
    case 'leave': if (me && game.phase === 'lobby') { game.players.splice(game.players.indexOf(me), 1); pushMeta(); } return;
    case 'start':
      if (!isHost) return err('Chỉ chủ phòng mới bấm Bắt đầu được.');
      if (game.phase !== 'lobby') return;
      if (game.players.length < CFG.MIN_PLAYERS) return err(`Cần ít nhất ${CFG.MIN_PLAYERS} người.`);
      return startMatch();
    case 'input': {
      if (!me) return;
      const i = me.input;
      i.m = Number(data.m) & 15; i.f = data.f ? 1 : 0;
      if (Number.isFinite(data.a)) i.a = data.a;
      if (Number.isInteger(data.d)) i.d = data.d;
      return;
    }
    case 'answer': {
      if (game.phase !== 'quiz' || !me || !me.alive || me.answer !== null) return;
      const idx = Number(data.i);
      if (!Number.isInteger(idx) || idx < 0 || idx >= QUESTIONS[game.qIndex].options.length) return;
      me.answer = idx; me.answerTime = now() - game.quiz.startedAt;
      pushMeta();
      if (alive().every(p => !p.connected || p.answer !== null)) game.phaseEnds = now() + 400;
      return;
    }
    case 'lock': if (me && game.phase === 'reveal') doLock(me, Number(data.target)); return;
    case 'restart':
      if (game.phase === 'ended') { resetGame(true); pushMeta(); }
      return;
    case 'resetAll':
      if (c.screen) { resetGame(false); pushMeta(); }
      return;
  }
}
function onDisconnect(c) {
  if (!c.key) return;
  const p = byKey(c.key);
  if (!p || p.clientId !== c.id) return;
  p.connected = false; p.discAt = now(); p.input = { m: 0, a: p.input.a, f: 0, d: p.input.d };
  pushMeta();
  if (game.phase === 'quiz' && alive().every(q => !q.connected || q.answer !== null)) game.phaseEnds = now() + 400;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`\n[LỖI] Cổng ${PORT} đang bị dùng. Có thể server đã bật ở cửa sổ khác.\n`);
  else console.log(e);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  const addrs = lanAddresses();
  console.log('\n================================================');
  console.log('      ĐẠI CHIẾN ÁP SUẤT — SERVER ĐÃ CHẠY');
  console.log('================================================');
  console.log(`  Máy này mở:       http://localhost:${PORT}`);
  if (addrs.length) { console.log('  Các máy khác mở:'); addrs.forEach(a => console.log('     ' + a)); }
  else console.log('  (Chưa thấy mạng LAN — hãy kết nối Wi-Fi/dây mạng)');
  console.log(`  Màn hình chiếu:   http://localhost:${PORT}/screen`);
  console.log('  Tắt server: bấm Ctrl + C');
  console.log('================================================\n');
});
