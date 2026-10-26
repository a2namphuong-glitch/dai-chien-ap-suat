/* =============================================================
   ĐẠI CHIẾN ÁP SUẤT — vẽ đồ họa (canvas 2D, tự vẽ hoàn toàn)
   ============================================================= */
(function () {
  const { W, H, CX, CY, FENCE, PR, PUMP_R, CHARS, OBS } = window.SHARED;
  const INK = '#1b2420';

  // RNG cố định để bản đồ giống nhau trên mọi máy
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const TAU = Math.PI * 2;
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function shade(hex, f) { // f<0 tối hơn, f>0 sáng hơn
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }

  // ================= NỀN ĐẤT (vẽ sẵn 1 lần) =================
  let groundCanvas = null, crackPattern = null;
  function buildGround() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rng(7);
    // cỏ
    g.fillStyle = '#76a944'; g.fillRect(0, 0, W, H);
    const greens = ['#6d9f3e', '#80b34b', '#7aad46', '#689a3a', '#86b950'];
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = greens[(r() * greens.length) | 0];
      g.globalAlpha = 0.35 + r() * 0.4;
      ell(g, r() * W, r() * H, 6 + r() * 26, 4 + r() * 14, r() * 3); g.fill();
    }
    g.globalAlpha = 1;
    // ngọn cỏ
    g.strokeStyle = 'rgba(40,80,25,.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 1800; i++) {
      const x = r() * W, y = r() * H;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 + r() * 4, y - 4 - r() * 4); g.stroke();
    }
    // đường đất từ nhà kho vào trạm bơm
    g.lineCap = 'round'; g.lineJoin = 'round';
    const paths = [[[196, 178], [330, 330], [520, 500], [746, 500]], [[1404, 178], [1270, 330], [1080, 500], [854, 500]],
      [[196, 822], [330, 670], [520, 500]], [[1404, 822], [1270, 670], [1080, 500]], [[800, 140], [800, 462]], [[800, 860], [800, 538]]];
    for (const [w, col] of [[54, '#b48b55'], [44, '#c9a46b']]) {
      g.strokeStyle = col; g.lineWidth = w;
      for (const pth of paths) { g.beginPath(); pth.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    }
    for (let i = 0; i < 500; i++) { // sỏi
      g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,.5)' : 'rgba(230,210,170,.5)';
      const pth = paths[(r() * paths.length) | 0], k = (r() * (pth.length - 1)) | 0, t = r();
      const x = pth[k][0] + (pth[k + 1][0] - pth[k][0]) * t + (r() - 0.5) * 34, y = pth[k][1] + (pth[k + 1][1] - pth[k][1]) * t + (r() - 0.5) * 34;
      circ(g, x, y, 1 + r() * 2); g.fill();
    }
    // luống đất trồng cà phê
    for (const y of [270, 730]) for (const [x0, x1] of [[270, 690], [910, 1330]]) {
      g.fillStyle = '#7a5130'; rrect(g, x0, y - 26, x1 - x0, 52, 10); g.fill();
      g.strokeStyle = '#64411f'; g.lineWidth = 2;
      for (let k = -18; k <= 18; k += 9) { g.beginPath(); g.moveTo(x0 + 8, y + k); g.lineTo(x1 - 8, y + k); g.stroke(); }
      // ống tưới nhỏ giọt dọc luống
      g.strokeStyle = '#1d1f22'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0 + 4, y + 22); g.lineTo(x1 - 4, y + 22); g.stroke();
      for (let x = x0 + 20; x < x1; x += 30) { g.fillStyle = '#3fa2e6'; circ(g, x, y + 22, 2.6); g.fill(); g.fillStyle = 'rgba(63,162,230,.35)'; ell(g, x, y + 28, 7, 4); g.fill(); }
    }
    // ống chính từ trạm bơm
    g.lineCap = 'butt';
    const mains = [[[800, 462], [800, 296], [690, 296]], [[800, 296], [910, 296]], [[800, 538], [800, 756], [690, 756]], [[800, 756], [910, 756]]];
    for (const pth of mains) {
      for (const [w, col] of [[11, '#0f1112'], [7, '#2b6fb0'], [2, '#6fb6f0']]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pth.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
    }
    // bệ bê tông trạm bơm
    g.fillStyle = '#9da39b'; rrect(g, CX - 92, CY - 74, 184, 148, 10); g.fill();
    g.strokeStyle = '#7d847b'; g.lineWidth = 2;
    for (let x = CX - 92; x < CX + 92; x += 46) { g.beginPath(); g.moveTo(x, CY - 74); g.lineTo(x, CY + 74); g.stroke(); }
    g.beginPath(); g.moveTo(CX - 92, CY); g.lineTo(CX + 92, CY); g.stroke();
    // hoa dại
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H;
      g.fillStyle = ['#f6e27a', '#ffffff', '#f19ac0', '#c7a0f2'][(r() * 4) | 0]; circ(g, x, y, 1.8); g.fill();
    }
    // hàng rào
    g.fillStyle = '#5b3a1c'; g.fillRect(0, 0, W, FENCE); g.fillRect(0, H - FENCE, W, FENCE); g.fillRect(0, 0, FENCE, H); g.fillRect(W - FENCE, 0, FENCE, H);
    g.fillStyle = '#8b5a2b';
    for (let x = 0; x < W; x += 22) { g.fillRect(x + 2, 3, 16, FENCE - 6); g.fillRect(x + 2, H - FENCE + 3, 16, FENCE - 6); }
    for (let y = 0; y < H; y += 22) { g.fillRect(3, y + 2, FENCE - 6, 16); g.fillRect(W - FENCE + 3, y + 2, FENCE - 6, 16); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(FENCE, FENCE, W - FENCE * 2, H - FENCE * 2);
    groundCanvas = c;

    // họa tiết đất nứt nẻ cho vùng hạn hán
    const pc = document.createElement('canvas'); pc.width = pc.height = 256;
    const p = pc.getContext('2d'), r2 = rng(42);
    p.fillStyle = '#c48a46'; p.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) { p.fillStyle = r2() < 0.5 ? 'rgba(160,100,45,.4)' : 'rgba(220,170,100,.35)'; ell(p, r2() * 256, r2() * 256, 8 + r2() * 30, 6 + r2() * 18, r2() * 3); p.fill(); }
    p.strokeStyle = '#6e3f17'; p.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      let x = r2() * 256, y = r2() * 256; p.beginPath(); p.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r2() - 0.5) * 60; y += (r2() - 0.5) * 60; p.lineTo(x, y); }
      p.stroke();
    }
    crackPattern = pc;
  }

  // ================= CHƯỚNG NGẠI VẬT =================
  function drawShadowFor(ctx, o) {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    if (o.t === 'c') { ell(ctx, o.x + 6, o.y + 8, o.r * 1.02, o.r * 0.9); ctx.fill(); }
    else { rrect(ctx, o.x + 6, o.y + 8, o.w, o.h, 6); ctx.fill(); }
  }
  function drawBush(ctx, o, t) {
    const r = rng(o.s * 97 + 3);
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    circ(ctx, o.x, o.y, o.r); ctx.fillStyle = '#2f6b2a'; ctx.fill(); ctx.stroke();
    // các cụm lá
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + r(), d = o.r * 0.45;
      circ(ctx, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d - 1, o.r * 0.5); ctx.fillStyle = i % 2 ? '#3d8634' : '#367a2f'; ctx.fill();
    }
    circ(ctx, o.x - 4, o.y - 5, o.r * 0.45); ctx.fillStyle = '#4c9c3e'; ctx.fill();
    circ(ctx, o.x - 7, o.y - 8, o.r * 0.2); ctx.fillStyle = '#6bb653'; ctx.fill();
    // quả cà phê chín đỏ
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = r() * o.r * 0.75;
      circ(ctx, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 2.6); ctx.fillStyle = r() < 0.7 ? '#d2302a' : '#e98b2a'; ctx.fill();
    }
  }
  function drawTank(ctx, o) {
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    circ(ctx, o.x, o.y, o.r); ctx.fillStyle = '#2f7dc6'; ctx.fill(); ctx.stroke();
    circ(ctx, o.x, o.y, o.r - 6); ctx.strokeStyle = '#1d5a94'; ctx.lineWidth = 2; ctx.stroke();
    circ(ctx, o.x, o.y, o.r - 12); ctx.fillStyle = '#3d93de'; ctx.fill();
    circ(ctx, o.x, o.y, 6); ctx.fillStyle = '#d7dde0'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ell(ctx, o.x - 8, o.y - 9, 7, 4, -0.7); ctx.fill();
  }
  function drawRock(ctx, o) {
    const r = rng(o.s * 31 + 9);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, d = o.r * (0.85 + r() * 0.25); const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fillStyle = '#8d948f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#b3b9b4'; ell(ctx, o.x - 3, o.y - 4, o.r * 0.5, o.r * 0.32, -0.4); ctx.fill();
  }
  function drawSensor(ctx, o, t) {
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    circ(ctx, o.x, o.y, o.r); ctx.fillStyle = '#c9ced1'; ctx.fill(); ctx.stroke();
    rrect(ctx, o.x - 7, o.y - 20, 14, 10, 2); ctx.fillStyle = '#e9ecee'; ctx.fill(); ctx.stroke();
    const on = Math.sin(t * 5 + o.x) > 0;
    circ(ctx, o.x + 3, o.y - 15, 2.4); ctx.fillStyle = on ? '#4dff7a' : '#1e5a2f'; ctx.fill();
    if (on) { circ(ctx, o.x + 3, o.y - 15, 6); ctx.fillStyle = 'rgba(77,255,122,.25)'; ctx.fill(); }
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o.x - 4, o.y - 20); ctx.lineTo(o.x - 8, o.y - 30); ctx.stroke();
  }
  function drawSolar(ctx, o) {
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    rrect(ctx, o.x, o.y, o.w, o.h, 3); ctx.fillStyle = '#9aa3a8'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f3c6e'; ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    ctx.strokeStyle = '#4f78b8'; ctx.lineWidth = 1;
    for (let x = o.x + 4; x < o.x + o.w - 4; x += 16) { ctx.beginPath(); ctx.moveTo(x, o.y + 4); ctx.lineTo(x, o.y + o.h - 4); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(o.x + 4, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 4, o.y + o.h / 2); ctx.stroke();
    const gr = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,.28)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
  }
  function drawShed(ctx, o) {
    const ch = CHARS[o.c];
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    rrect(ctx, o.x, o.y, o.w, o.h, 4); ctx.fillStyle = '#a8adb0'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7f8689'; ctx.lineWidth = 2;
    for (let x = o.x + 8; x < o.x + o.w; x += 9) { ctx.beginPath(); ctx.moveTo(x, o.y + 3); ctx.lineTo(x, o.y + o.h - 3); ctx.stroke(); }
    ctx.fillStyle = ch.color; ctx.fillRect(o.x + 3, o.y + o.h / 2 - 7, o.w - 6, 14);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(o.x + 3, o.y + o.h / 2 - 7, o.w - 6, 14);
  }
  function drawPump(ctx, o, t) {
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fillStyle = '#d4d8d2'; ctx.fill(); ctx.stroke();
    // sọc cảnh báo
    ctx.save(); rrect(ctx, o.x + 4, o.y + o.h - 14, o.w - 8, 10, 2); ctx.clip();
    for (let x = o.x - 10; x < o.x + o.w + 10; x += 12) { ctx.fillStyle = '#f2b01e'; ctx.beginPath(); ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + 6, o.y + o.h); ctx.lineTo(x + 12, o.y + o.h - 16); ctx.lineTo(x + 6, o.y + o.h - 16); ctx.fill(); }
    ctx.restore();
    // bồn tròn + quạt
    const tx = o.x + 32, ty = o.y + 32;
    circ(ctx, tx, ty, 24); ctx.fillStyle = '#2f7dc6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    circ(ctx, tx, ty, 16); ctx.fillStyle = '#18476f'; ctx.fill();
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(t * 7);
    ctx.fillStyle = '#9fd0f5';
    for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ell(ctx, 7, 0, 7, 3); ctx.fill(); }
    ctx.restore();
    circ(ctx, tx, ty, 3.5); ctx.fillStyle = '#ddd'; ctx.fill();
    // động cơ
    rrect(ctx, o.x + 62, o.y + 10, 38, 24, 4); ctx.fillStyle = '#4a5459'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#2b3236'; for (let x = o.x + 67; x < o.x + 98; x += 6) { ctx.beginPath(); ctx.moveTo(x, o.y + 13); ctx.lineTo(x, o.y + 31); ctx.stroke(); }
    // đèn báo
    const on = Math.sin(t * 4) > 0;
    circ(ctx, o.x + 96, o.y + 46, 4.5); ctx.fillStyle = on ? '#4dff7a' : '#1f5c33'; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = 'bold 10px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText('TRẠM BƠM', o.x + 66, o.y + 61);
  }
  function drawObstacles(ctx, t, view) {
    for (const o of OBS) if (inView(o, view)) drawShadowFor(ctx, o);
    for (const o of OBS) {
      if (!inView(o, view)) continue;
      if (o.kind === 'bush') drawBush(ctx, o, t);
      else if (o.kind === 'tank') drawTank(ctx, o);
      else if (o.kind === 'rock') drawRock(ctx, o);
      else if (o.kind === 'sensor') drawSensor(ctx, o, t);
      else if (o.kind === 'solar') drawSolar(ctx, o);
      else if (o.kind === 'shed') drawShed(ctx, o);
      else if (o.kind === 'pump') drawPump(ctx, o, t);
    }
  }
  function inView(o, v) {
    if (!v) return true;
    const x0 = o.t === 'c' ? o.x - o.r : o.x, y0 = o.t === 'c' ? o.y - o.r : o.y, x1 = o.t === 'c' ? o.x + o.r : o.x + o.w, y1 = o.t === 'c' ? o.y + o.r : o.y + o.h;
    return x1 > v.x0 - 40 && x0 < v.x1 + 40 && y1 > v.y0 - 40 && y0 < v.y1 + 40;
  }

  // ================= NHÂN VẬT =================
  // o: { walk, flash, locked, shield, water(0..1), dash, scale, t }
  function drawTech(ctx, x, y, ang, charId, o) {
    o = o || {};
    const ch = CHARS[charId] || CHARS[0], s = o.scale || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(ctx, 3, 7, 21, 14); ctx.fill();
    if (o.dash) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ell(ctx, -Math.cos(ang) * 16, -Math.sin(ang) * 16, 18, 18); ctx.fill(); }
    ctx.rotate(ang);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // chân
    const sw = Math.sin(o.walk || 0) * 7;
    ctx.fillStyle = '#2b2b2b'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ell(ctx, sw + 2, -8, 7, 5); ctx.fill(); ctx.stroke();
    ell(ctx, -sw + 2, 8, 7, 5); ctx.fill(); ctx.stroke();
    // bình nước sau lưng
    rrect(ctx, -27, -12, 14, 24, 4); ctx.fillStyle = '#cfd8dc'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    const wv = Math.max(0, Math.min(1, o.water == null ? 1 : o.water));
    if (wv > 0) { ctx.fillStyle = '#3a9cf0'; ctx.fillRect(-25, 10 - 20 * wv, 10, 20 * wv); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-27, -4); ctx.lineTo(-13, -4); ctx.moveTo(-27, 4); ctx.lineTo(-13, 4); ctx.stroke();
    // ống mềm
    ctx.strokeStyle = '#1d5d9a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-18, -12); ctx.bezierCurveTo(-14, -26, 6, -20, 14, -7); ctx.stroke();
    // thân
    ell(ctx, -1, 0, 15, 17.5); ctx.fillStyle = ch.color; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    // phụ kiện theo nhân vật
    if (charId === 0) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(-6, 15); ctx.stroke(); }
    if (charId === 1) { ctx.fillStyle = '#e6eef2'; rrect(ctx, -8, 8, 9, 7, 1); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (charId === 3) { ctx.fillStyle = '#5a3e12'; ctx.fillRect(-10, -17, 4, 34); }
    // tay + vòi phun
    ctx.fillStyle = ch.color; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    circ(ctx, 7, -12, 5.5); ctx.fill(); ctx.stroke();
    circ(ctx, 7, 12, 5.5); ctx.fill(); ctx.stroke();
    rrect(ctx, 12, -4.5, 22, 9, 2); ctx.fillStyle = '#4f5b63'; ctx.fill(); ctx.stroke();
    rrect(ctx, 30, -5.5, 7, 11, 2); ctx.fillStyle = '#d9a441'; ctx.fill(); ctx.stroke();
    circ(ctx, 16, -6, 4); ctx.fillStyle = '#f1c08a'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    circ(ctx, 16, 6, 4); ctx.fill(); ctx.stroke();
    // đầu + mũ bảo hộ
    if (charId === 2) {
      circ(ctx, 1, 0, 10.5); ctx.fillStyle = ch.hat; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ell(ctx, 10, 0, 6, 9); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#9aa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-14, -16); ctx.stroke();
      const on = Math.sin((o.t || 0) * 6) > 0; circ(ctx, -14, -16, 2.4); ctx.fillStyle = on ? '#4dff7a' : '#1e5a2f'; ctx.fill();
    } else {
      ell(ctx, 3, 0, 13, 12.5); ctx.fillStyle = ch.hat; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      circ(ctx, 1, 0, 10); ctx.fillStyle = shade(ch.hat === '#f4f4ee' ? '#e2e2da' : ch.hat, 0.12); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(10, 0); ctx.stroke();
      if (charId === 3) { ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(-3, 1); ctx.lineTo(1, 1); ctx.lineTo(-2, 7); ctx.lineTo(5, -1); ctx.lineTo(1, -1); ctx.closePath(); ctx.fill(); }
      if (charId === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(-4, -10, 3, 20); }
    }
    ctx.restore();
    // khiên van điện từ
    if (o.shield) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.strokeStyle = 'rgba(120,230,255,.85)'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + (o.t || 0) * 0.8; const px = Math.cos(a) * 29, py = Math.sin(a) * 29; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.fillStyle = 'rgba(120,230,255,.12)'; ctx.fill(); ctx.restore();
    }
    if (o.flash) { ctx.save(); ctx.globalAlpha = Math.min(1, o.flash) * 0.6; ctx.fillStyle = '#fff'; circ(ctx, x, y, 19 * s); ctx.fill(); ctx.restore(); }
    // bị khóa van
    if (o.locked) {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -(o.t || 0) * 30;
      circ(ctx, 0, 0, 30); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(0, -40); ctx.rotate((o.t || 0) * 2);
      ctx.strokeStyle = '#b81d15'; ctx.lineWidth = 4; circ(ctx, 0, 0, 11); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); } ctx.stroke();
      circ(ctx, 0, 0, 3.5); ctx.fillStyle = '#b81d15'; ctx.fill();
      ctx.restore();
    }
  }

  // ảnh chân dung cho thẻ nhân vật
  function portrait(canvas, charId, opts) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, ch = CHARS[charId];
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = shade(ch.color, -0.62); ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = shade(ch.color, -0.45); ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const sc = Math.min(w, h) / 62;
    if (!(opts && opts.noSpray)) { // tia nước minh họa
      ctx.fillStyle = 'rgba(120,200,255,.9)';
      for (let i = 0; i < 5; i++) { ell(ctx, w * 0.5 + (40 + i * 13) * sc * 0.32, h * 0.52 - (i * 9) * sc * 0.32, 4 * sc * 0.4, 2.6 * sc * 0.4, -0.55); ctx.fill(); }
    }
    drawTech(ctx, w * 0.42, h * 0.56, -0.55, charId, { scale: sc * 0.95, walk: 0.8, water: 0.8, t: 0.3 });
  }

  // ================= HIỆU ỨNG =================
  const particles = [], puddles = [];
  function spawn(type, x, y, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (opt.speed || 120) * (0.4 + Math.random() * 0.8);
      particles.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: (opt.life || 0.45) * (0.6 + Math.random() * 0.6), max: opt.life || 0.45,
        size: (opt.size || 3) * (0.6 + Math.random() * 0.8), color: opt.color || '#8fd3ff' });
    }
  }
  function splash(x, y, big) {
    spawn('drop', x, y, big ? 10 : 6, { speed: big ? 170 : 110, life: 0.4, size: big ? 3.5 : 2.6 });
    puddles.push({ x, y, r: (big ? 14 : 8) + Math.random() * 6, life: 5, max: 5, rot: Math.random() * 3 });
    if (puddles.length > 140) puddles.shift();
  }
  function burst(x, y, color) {
    spawn('drop', x, y, 26, { speed: 260, life: 0.8, size: 4 });
    spawn('smoke', x, y, 12, { speed: 60, life: 1.2, size: 14, color: 'rgba(200,210,215,' });
    spawn('chunk', x, y, 10, { speed: 220, life: 0.9, size: 5, color });
    puddles.push({ x, y, r: 34, life: 9, max: 9, rot: 0 });
  }
  function dust(x, y) { spawn('smoke', x, y, 5, { speed: 40, life: 0.5, size: 8, color: 'rgba(214,190,140,' }); }
  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt;
    }
    for (let i = puddles.length - 1; i >= 0; i--) { puddles[i].life -= dt; if (puddles[i].life <= 0) puddles.splice(i, 1); }
  }
  function drawPuddles(ctx) {
    for (const p of puddles) {
      const a = Math.min(1, p.life / p.max * 1.5) * 0.35;
      ctx.fillStyle = `rgba(52,120,180,${a})`; ell(ctx, p.x, p.y, p.r, p.r * 0.7, p.rot); ctx.fill();
      ctx.fillStyle = `rgba(160,215,255,${a * 0.6})`; ell(ctx, p.x - p.r * 0.25, p.y - p.r * 0.2, p.r * 0.35, p.r * 0.2, p.rot); ctx.fill();
    }
  }
  function drawParticles(ctx) {
    for (const p of particles) {
      const k = p.life / p.max;
      if (p.type === 'drop') { ctx.fillStyle = `rgba(143,211,255,${Math.min(1, k * 1.6)})`; circ(ctx, p.x, p.y, p.size * (0.5 + k * 0.5)); ctx.fill(); }
      else if (p.type === 'smoke') { ctx.fillStyle = p.color + (k * 0.45) + ')'; circ(ctx, p.x, p.y, p.size * (1.6 - k * 0.6)); ctx.fill(); }
      else if (p.type === 'chunk') { ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, k * 2); ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); ctx.globalAlpha = 1; }
    }
  }

  function drawBullet(ctx, x, y, vx, vy) {
    const a = Math.atan2(vy, vx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(120,200,255,.35)'; ell(ctx, -12, 0, 14, 3.5); ctx.fill();
    ctx.fillStyle = '#7cc8ff'; ell(ctx, 0, 0, 7, 4.5); ctx.fill();
    ctx.strokeStyle = '#1e6db5'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e9f7ff'; ell(ctx, 2, -1.5, 2.5, 1.4); ctx.fill();
    ctx.restore();
  }

  function drawPumpZone(ctx, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(110,200,255,.75)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 20;
    circ(ctx, CX, CY, PUMP_R); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(80,170,255,.07)'; circ(ctx, CX, CY, PUMP_R); ctx.fill();
    ctx.fillStyle = 'rgba(200,235,255,.9)'; ctx.font = 'bold 11px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('▼ NẠP NƯỚC ▼', CX, CY - PUMP_R + 18);
    ctx.restore();
  }

  function drawDrought(ctx, ring, t) {
    if (ring >= 950) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(-200, -200, W + 400, H + 400); ctx.arc(CX, CY, Math.max(0, ring), 0, TAU, true);
    ctx.clip('evenodd');
    if (crackPattern) { ctx.globalAlpha = 0.7; ctx.fillStyle = ctx.createPattern(crackPattern, 'repeat'); ctx.fillRect(-200, -200, W + 400, H + 400); }
    ctx.globalAlpha = 0.18 + Math.sin(t * 3) * 0.05; ctx.fillStyle = '#ff7a1a'; ctx.fillRect(-200, -200, W + 400, H + 400);
    ctx.restore();
    if (ring > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff8c2a'; ctx.lineWidth = 6; ctx.setLineDash([22, 12]); ctx.lineDashOffset = t * 30;
      circ(ctx, CX, CY, ring); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,140,42,.25)'; ctx.lineWidth = 18; ctx.setLineDash([]); circ(ctx, CX, CY, ring + 4); ctx.stroke();
      ctx.restore();
    }
  }

  function drawTargetRing(ctx, r) {
    if (r == null || r >= 1100) return;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
    circ(ctx, CX, CY, Math.max(1, r)); ctx.stroke(); ctx.restore();
  }

  function drawMinimap(mc, players, ring, myId) {
    const g = mc.getContext('2d'), sx = mc.width / W, sy = mc.height / H;
    g.fillStyle = '#4d7a32'; g.fillRect(0, 0, mc.width, mc.height);
    g.save(); g.scale(sx, sy);
    g.fillStyle = '#244a1f';
    for (const o of OBS) { if (o.t === 'c') { circ(g, o.x, o.y, o.r); g.fill(); } else g.fillRect(o.x, o.y, o.w, o.h); }
    g.fillStyle = 'rgba(100,190,255,.5)'; circ(g, CX, CY, PUMP_R); g.fill();
    if (ring < 1100) {
      g.beginPath(); g.rect(0, 0, W, H); g.arc(CX, CY, Math.max(0, ring), 0, TAU, true); g.fillStyle = 'rgba(210,130,40,.65)'; g.fill('evenodd');
      g.strokeStyle = '#ffb04d'; g.lineWidth = 10; circ(g, CX, CY, Math.max(1, ring)); g.stroke();
    }
    for (const p of players) {
      if (!p.alive) continue;
      g.fillStyle = CHARS[p.char].color; circ(g, p.x, p.y, p.id === myId ? 34 : 26); g.fill();
      g.strokeStyle = p.id === myId ? '#fff' : '#000'; g.lineWidth = 8; g.stroke();
    }
    g.restore();
  }

  window.R = { buildGround, get ground() { return groundCanvas; }, drawObstacles, drawTech, portrait, spawn, splash, burst, dust, updateFx,
    drawPuddles, drawParticles, drawBullet, drawPumpZone, drawDrought, drawTargetRing, drawMinimap, shade };
})();
