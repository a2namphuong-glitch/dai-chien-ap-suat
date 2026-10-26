/* =============================================================
   ĐẠI CHIẾN ÁP SUẤT — client: kết nối, điều khiển, giao diện
   ============================================================= */
(function () {
  const SH = window.SHARED, { W, H, CX, CY, PR, CHARS, GADGETS, TEAMS } = SH;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LET = ['A', 'B', 'C', 'D'];

  // ---------- danh tính của tab này ----------
  const KEY = (() => { let k = sessionStorage.getItem('dcas_key'); if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('dcas_key', k); } return k; })();
  let isScreen = location.pathname === '/screen' || sessionStorage.getItem('dcas_screen') === '1';

  // ---------- trạng thái ----------
  let M = null;              // thông tin chung (meta)
  const snaps = [];          // các ảnh chụp vị trí từ server
  let latest = null;
  const events = [];
  const INTERP = 70;         // ms trễ nội suy cho người chơi khác
  let selTeam = null, selChar = null, typedName = '';

  // ---------- kết nối ----------
  let ws = null;
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { $('conn').classList.add('hidden'); send('hello', { key: KEY, screen: isScreen }); };
    ws.onclose = () => { $('conn').classList.remove('hidden'); setTimeout(connect, 1200); };
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snap') onSnap(msg.data);
      else if (msg.type === 'meta') onMeta(msg.data);
      else if (msg.type === 'error') toast(msg.data);
    };
  }
  function send(type, data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, data })); }

  const me = () => (M && M.players.find(p => p.id === M.myId)) || null;
  const pById = id => M && M.players.find(p => p.id === id);
  const inMatch = () => M && ['countdown', 'combat', 'quiz', 'reveal'].includes(M.phase);
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('toasts').appendChild(d); setTimeout(() => d.remove(), 3000); }

  // ================= ÂM THANH (tự tổng hợp) =================
  let AC = null, noiseBuf = null;
  function ac() {
    if (!AC) {
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { AC = null; }
    }
    return AC;
  }
  function noise(dur, f0, f1, vol, type) {
    const a = ac(); if (!a) return; const t = a.currentTime;
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); f.Q.value = 1.2;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }
  function tone(f0, f1, dur, vol, type, when) {
    const a = ac(); if (!a) return; const t = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
  }
  const SFX = {
    spray: v => noise(0.07, 2600, 1500, 0.05 * v),
    hit: () => { tone(160, 50, 0.18, 0.25, 'sine'); noise(0.12, 900, 300, 0.12); },
    mark: () => tone(1500, 1300, 0.05, 0.06, 'square'),
    kill: () => { noise(0.5, 1200, 120, 0.25, 'lowpass'); tone(400, 60, 0.6, 0.15, 'sawtooth'); },
    dash: () => noise(0.18, 500, 2500, 0.08),
    beep: () => tone(880, 880, 0.12, 0.12, 'square'),
    go: () => { tone(660, 660, 0.1, 0.12, 'square'); tone(990, 990, 0.25, 0.12, 'square', 0.1); },
    alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 880, i % 2 ? 620 : 880, 0.22, 0.09, 'square', i * 0.24); },
    ok: () => { tone(660, 660, 0.1, 0.12, 'triangle'); tone(990, 990, 0.25, 0.12, 'triangle', 0.1); },
    bad: () => { tone(220, 140, 0.4, 0.14, 'sawtooth'); noise(0.4, 3000, 400, 0.08); },
    lock: () => { tone(300, 280, 0.08, 0.2, 'square'); tone(180, 170, 0.2, 0.2, 'square', 0.08); },
    win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, 0.3, 0.12, 'triangle', i * 0.13)),
    click: () => tone(700, 700, 0.03, 0.05, 'square'),
  };

  // ================= NHẬN DỮ LIỆU =================
  function onSnap(s) {
    const t = performance.now();
    const players = new Map();
    for (const a of s.p) players.set(a[0], { id: a[0], x: a[1], y: a[2], a: a[3], hp: a[4], w: a[5], sh: a[6], fl: a[7], dcd: a[8], lk: a[9] });
    const bullets = new Map();
    for (const b of s.b) bullets.set(b[0], b);
    const snap = { t, ph: s.ph, pr: s.pr, ring: s.ring, rt: s.rt, players, bullets };
    snaps.push(snap); if (snaps.length > 40) snaps.shift();
    latest = snap;
    for (const e of s.e) events.push({ t, e });
  }

  let prevMeta = null;
  function onMeta(m) {
    const prev = M; M = m; prevMeta = prev;
    const prevPh = prev ? prev.phase : null;
    if (m.phase !== prevPh) onPhaseChange(prevPh, m.phase, prev);
    if (prev && me()) {
      const pm = prev.players.find(p => p.id === m.myId), nm = me();
      if (pm && pm.alive && !nm.alive) announce('BẠN ĐÃ BỊ HẠ', 'Vẫn có thể xem trận đấu tới hết', 2600, '#ff4f43');
    }
    renderUI();
  }

  function onPhaseChange(from, to, prev) {
    if (to === 'countdown') { lastCount = null; }
    if (to === 'combat') {
      SFX.go();
      if (M.final) announce('VÒNG CUỐI', 'Hạn hán thu hẹp tới tâm · người cuối cùng còn đứng sẽ thắng', 2600, '#ff8c2a');
      else if (M.qIndex >= 1) announce('CHIẾN!', 'Hạn hán đang lan rộng · hãy ở trong vùng an toàn', 2000);
      else announce('CHIẾN!', 'Trạm bơm ở giữa bản đồ để nạp nước', 1800);
    }
    if (to === 'quiz') { SFX.alarm(); mouse.down = false; }
    if (to === 'reveal') {
      const mm = me(), r = M.quiz && M.quiz.results && mm ? M.quiz.results.find(x => x.id === mm.id) : null;
      if (r) (r.correct ? SFX.ok : SFX.bad)(); else SFX.ok();
    }
    if (to === 'ended') SFX.win();
    if (to === 'lobby') { snaps.length = 0; latest = null; pred.init = false; }
  }

  // ================= GIAO DIỆN DOM =================
  function renderUI() {
    const lobby = M.phase === 'lobby';
    $('lobby').classList.toggle('hidden', !lobby);
    $('hud').classList.toggle('hidden', lobby || M.phase === 'ended');
    $('quiz').classList.toggle('hidden', !(M.phase === 'quiz' || M.phase === 'reveal'));
    $('ended').classList.toggle('hidden', M.phase !== 'ended');
    renderScreenTools();
    if (lobby) return renderLobby();
    renderHudStatic();
    if (M.phase === 'quiz' || M.phase === 'reveal') renderQuiz();
    if (M.phase === 'ended') renderEnded();
  }

  function renderScreenTools() {
    let el = $('screenTools');
    if (!isScreen) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'screenTools'; el.className = 'screen-tools'; document.body.appendChild(el); }
    el.innerHTML = `${M.phase !== 'lobby' ? '<button class="btn red small" data-act="resetall">HỦY TRẬN</button>' : ''}<button class="btn small" data-act="unscreen">THOÁT MÀN HÌNH CHIẾU</button>`;
  }

  function charStats(c) {
    const dps = c.dmg * 1000 / c.fireMs;
    return [['MÁU', c.hp / 130], ['TỐC ĐỘ', c.speed / 240], ['SÁT THƯƠNG', dps / 80], ['BÌNH NƯỚC', c.water / 135]];
  }
  const cssVars = c => `--cc:${c.color};--cbg:${R.shade(c.color, -0.62)}`;

  function renderLobby() {
    const body = $('lobbyBody');
    const focused = document.activeElement && document.activeElement.id;
    const m = me();
    let html = '<div class="lobby-wrap">';
    if (isScreen) html += lobbyScreen();
    else if (m) html += lobbyWaiting(m);
    else html += lobbyJoin();
    html += howTo() + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('canvas[data-portrait]').forEach(c => R.portrait(c, Number(c.dataset.portrait)));
    if (focused === 'nameInput') { const el = $('nameInput'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  }
  function lobbyJoin() {
    const takenTeam = t => M.players.find(p => p.team === t && p.connected);
    const takenChar = c => M.players.find(p => p.char === c && p.connected);
    return `<div class="plate">
      <div class="plate-title">HỒ SƠ KỸ THUẬT VIÊN</div>
      <div class="join-grid">
        <div>
          <label class="field-label" for="nameInput">TÊN CỦA BẠN</label>
          <input id="nameInput" class="name-input" maxlength="16" placeholder="VD: Minh Anh" value="${esc(typedName)}" autocomplete="off">
          <span class="field-label" style="margin-top:16px">ĐẠI DIỆN CHO</span>
          <div class="teams">${TEAMS.map((t, i) => { const tk = takenTeam(i + 1);
            return `<button class="team-chip ${selTeam === i + 1 ? 'sel' : ''}" data-act="team" data-v="${i + 1}" ${tk ? 'disabled title="Đã có người"' : ''}>${esc(t)}</button>`; }).join('')}</div>
          <p class="field-label" style="margin-top:16px;line-height:1.6">ĐÃ VÀO PHÒNG: ${M.players.length}/4</p>
          <div style="margin-top:14px"><button class="btn" data-act="join" style="width:100%">VÀO PHÒNG CHỜ ▶</button></div>
        </div>
        <div>
          <span class="field-label">CHỌN NHÂN VẬT</span>
          <div class="chars">${CHARS.map(c => { const tk = takenChar(c.id);
            return `<button class="char ${selChar === c.id ? 'sel' : ''}" style="${cssVars(c)}" data-act="char" data-v="${c.id}" ${tk ? 'disabled' : ''}>
              ${tk ? `<span class="taken">ĐÃ CHỌN: ${esc(tk.name)}</span>` : ''}
              <canvas width="240" height="196" data-portrait="${c.id}"></canvas>
              <div class="cn">${c.name}</div><div class="cr">${c.role.toUpperCase()}</div>
              <div class="perk">${esc(c.perk)}</div>
              ${charStats(c).map(([k, v]) => `<div class="stat">${k}<b><i style="width:${Math.round(v * 100)}%"></i></b></div>`).join('')}
            </button>`; }).join('')}</div>
        </div>
      </div>
    </div>
    <p class="center"><button class="link" data-act="screen">Dùng máy này làm màn hình chiếu (chỉ xem, không chơi)</button></p>`;
  }
  function slotsHTML() {
    return `<div class="slots">${[0, 1, 2, 3].map(i => {
      const p = M.players[i];
      if (!p) return `<div class="slot empty">ĐANG CHỜ NGƯỜI CHƠI…</div>`;
      const c = CHARS[p.char];
      return `<div class="slot" style="${cssVars(c)}"><canvas width="240" height="188" data-portrait="${c.id}"></canvas>
        <div class="si">${M.hostId === p.id ? '<span class="host">★ CHỦ PHÒNG</span>' : ''}<b>${esc(p.name)}${p.id === M.myId ? ' (bạn)' : ''}</b>
        <span>${esc(TEAMS[p.team - 1])} · ${c.name}</span>${p.connected ? '' : '<div class="off">● MẤT KẾT NỐI</div>'}</div></div>`;
    }).join('')}</div>`;
  }
  function lobbyWaiting(m) {
    const isHost = M.hostId === m.id, n = M.players.length, h = pById(M.hostId);
    return `<div class="plate"><div class="plate-title">PHÒNG CHỜ · ${n}/4 KỸ THUẬT VIÊN</div>
      ${slotsHTML()}
      <div class="center" style="margin-top:20px">
        ${isHost ? `<button class="btn" data-act="start" ${n < M.cfg.MIN_PLAYERS ? 'disabled' : ''}>BẮT ĐẦU TRẬN ĐẤU (${n}/4)</button>
          ${n < 4 ? `<p class="field-label" style="margin-top:12px">NÊN CHỜ ĐỦ 4 TỔ RỒI MỚI BẮT ĐẦU</p>` : ''}`
        : `<p style="font-family:var(--mono);color:var(--amber)">ĐANG CHỜ ${esc(h ? h.name : 'CHỦ PHÒNG').toUpperCase()} BẮT ĐẦU…</p>`}
        <div><button class="link" data-act="leave">Rời phòng / đổi nhân vật</button></div>
      </div></div>`;
  }
  function lobbyScreen() {
    const addrs = M.addresses.length ? M.addresses : [location.origin];
    return `<div class="plate center"><div class="plate-title">MỞ TRÌNH DUYỆT VÀ VÀO ĐỊA CHỈ</div>
      <div>${addrs.map(a => `<span class="addr">${esc(a)}</span>`).join('')}</div>
      <div style="margin-top:18px;text-align:left">${slotsHTML()}</div></div>`;
  }
  function howTo() {
    return `<div class="how">
      <div class="plate"><div class="plate-title">LUẬT CHƠI</div><ul>
        <li>4 kỹ thuật viên đấu nhau bằng <b>súng phun nước áp suất cao</b>. Hết máu là bị loại.</li>
        <li>Mỗi phát phun tốn nước. Hết nước thì chạy về <b>TRẠM BƠM</b> ở giữa bản đồ để nạp.</li>
        <li>Cứ ${M.cfg.COMBAT} giây lại có một <b>SỰ CỐ HỆ THỐNG</b> (5 câu hỏi). Trận đấu dừng lại để mọi người trả lời.</li>
        <li>Trả lời <b>đúng</b>: nhận một linh kiện nâng cấp. Trả lời <b>sai</b>: rò rỉ, mất ${M.cfg.LEAK_DAMAGE} máu và hết nước.</li>
        <li>Người <b>đúng nhanh nhất</b> được <b>KHÓA VAN</b> một đối thủ, làm họ đứng im ${String(M.cfg.LOCK_DURATION).replace('.', ',')} giây.</li>
        <li><b>Hạn hán</b> thu hẹp dần sau mỗi sự cố. Đứng ngoài vùng an toàn sẽ mất máu.</li>
        <li>Người <b>cuối cùng còn đứng</b> là nhà vô địch!</li></ul></div>
      <div class="plate"><div class="plate-title">ĐIỀU KHIỂN</div><ul style="list-style:none;padding:0;line-height:2.3">
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> hoặc phím mũi tên: di chuyển</li>
        <li><kbd>CHUỘT</kbd> ngắm · <kbd>GIỮ CHUỘT TRÁI</kbd> phun nước</li>
        <li><kbd>SPACE</kbd> hoặc <kbd>SHIFT</kbd>: lướt nhanh để né</li>
        <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> hoặc click: trả lời câu hỏi</li></ul>
        <div class="plate-title" style="margin-top:12px">LINH KIỆN NÂNG CẤP</div>
        <ul style="list-style:none;padding:0">${GADGETS.map(g => `<li style="display:flex;gap:8px;align-items:center;margin:4px 0">${gIcon(g.id, true)}<b>${g.name}</b>&nbsp;<span style="color:var(--dim)">${g.desc}</span></li>`).join('')}</ul>
      </div></div>`;
  }

  // biểu tượng linh kiện (SVG tự vẽ)
  const GICON = {
    pump: '<circle cx="12" cy="12" r="8"/><path d="M12 12l5-3M12 12l-3 5M12 12l-2-6M12 12l6 3"/>',
    tank: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 13c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    valve: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6M12 14v6M4 12h6M14 12h6"/>',
    spr: '<path d="M12 20v-6"/><circle cx="12" cy="12" r="2"/><path d="M6 8a8 8 0 0 1 12 0M3 5a12 12 0 0 1 18 0"/>',
    ctrl: '<rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  };
  function gIcon(id, on) { return `<span class="gslot ${on ? 'on' : ''}" title="${(GADGETS.find(g => g.id === id) || {}).name || ''}"><svg viewBox="0 0 24 24">${GICON[id]}</svg></span>`; }

  // ---------- HUD ----------
  let hudCharDrawn = null;
  function renderHudStatic() {
    const m = me();
    $('meCard').classList.toggle('hidden', !m || isScreen);
    $('keysHint').classList.toggle('hidden', !m || isScreen);
    if (m) {
      const c = CHARS[m.char];
      $('meCard').setAttribute('style', cssVars(c));
      $('meName').textContent = m.name; $('meChar').textContent = c.name;
      if (hudCharDrawn !== m.char) { R.portrait($('mePortrait'), m.char, { noSpray: true }); hudCharDrawn = m.char; }
      $('gadgets').innerHTML = GADGETS.map(g => gIcon(g.id, m.gadgets.includes(g.id))).join('');
    }
    // bảng tỉ số
    $('board').innerHTML = [...M.players].sort((a, b) => a.team - b.team).map(p => {
      const c = CHARS[p.char];
      return `<div class="brow ${p.alive ? '' : 'dead'} ${p.id === M.myId ? 'me' : ''}" style="--cc:${c.color}" data-pid="${p.id}">
        <span class="c"></span><div class="n">${esc(p.name)}<small>${esc(TEAMS[p.team - 1])} · ${c.name}</small><div class="mini"><i></i></div></div>
        <div class="s">${p.kills} HẠ<br>${p.correct}/${M.total} ĐÚNG</div></div>`;
    }).join('');
    // bảng tin
    $('feed').innerHTML = (M.feed || []).slice(-5).map(f => {
      const v = pById(f.v), b = f.by ? pById(f.by) : null;
      const n = p => p ? `<b style="color:${CHARS[p.char].color}">${esc(p.name)}</b>` : '';
      if (f.k === 'lock') return `<div>${n(b)} khóa van ${n(v)}</div>`;
      if (b) return `<div>${n(b)} hạ gục ${n(v)}</div>`;
      if (f.how === 'leak') return `<div>${n(v)} gục vì rò rỉ</div>`;
      return `<div>${n(v)} gục vì hạn hán</div>`;
    }).join('');
    let w = $('watchBanner');
    const watching = !isScreen && (!m || !m.alive) && inMatch();
    if (watching && !w) { w = document.createElement('div'); w.id = 'watchBanner'; w.className = 'watch'; $('hud').appendChild(w); }
    if (w) {
      if (!watching) w.remove();
      else {
        const off = !m ? M.players.filter(p => !p.connected) : [];
        w.innerHTML = m ? 'BẠN ĐÃ BỊ LOẠI · ĐANG XEM TRẬN' : 'TRẬN ĐANG DIỄN RA · BẠN ĐANG XEM' +
          (off.length ? `<div style="margin-top:6px">${off.map(p => `<button class="btn small" data-act="rejoin" data-v="${p.id}">VÀO LẠI: ${esc(p.name)}</button>`).join(' ')}</div>` : '');
      }
    }
  }

  let announceTimer = null;
  function announce(text, sub, ms, color) {
    const el = $('announce');
    el.innerHTML = `<span style="color:${color || '#fff'}">${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(announceTimer); announceTimer = setTimeout(() => { el.innerHTML = ''; }, ms || 1500);
  }

  // ---------- TERMINAL CÂU HỎI ----------
  function renderQuiz() {
    const q = M.quiz; if (!q) return;
    const m = me(), reveal = M.phase === 'reveal';
    const canAns = !reveal && m && m.alive && m.answer === null;
    const alivePl = M.players.filter(p => p.alive || (q.results && q.results.find(r => r.id === p.id)));
    const opts = q.options.map((o, i) => {
      let cls = 't-opt';
      if (reveal) cls += i === q.correct ? ' ok' : (m && m.answer === i ? ' bad' : ' dim');
      else if (m && m.answer !== null) cls += m.answer === i ? ' chosen' : ' dim';
      const who = reveal ? M.players.filter(p => p.answer === i).map(p => `<i style="--cc:${CHARS[p.char].color}" title="${esc(p.name)}"></i>`).join('') : '';
      return `<button class="${cls}" data-act="ans" data-v="${i}" ${canAns ? '' : 'disabled'}><span class="key">${i + 1}</span><span>${LET[i]}. ${esc(o)}</span><span class="who">${who}</span></button>`;
    }).join('');

    let foot = '', extra = '';
    if (!reveal) {
      foot = `<div class="t-time"><i id="qTimeBar"></i></div>
        <div class="t-foot"><div class="t-leds">${alivePl.map(p => `<span class="${p.answered ? 'on' : ''}"><i></i>${esc(p.name)}</span>`).join('')}</div>
        <span style="color:var(--amber)">${m && m.alive ? (m.answer === null ? 'BẤM PHÍM 1–4 HOẶC CLICK ĐỂ TRẢ LỜI' : `ĐÃ CHỐT ĐÁP ÁN ${LET[m.answer]} · CHỜ NGƯỜI KHÁC`) : 'BẠN ĐANG XEM'}</span></div>
        <div class="t-stake"><div class="g">✔ ĐÚNG → nhận <b>${esc(q.gadget.name)}</b><br>${esc(q.gadget.desc)} + nạp đầy nước</div>
        <div class="b">✘ SAI / HẾT GIỜ → RÒ RỈ<br>−${M.cfg.LEAK_DAMAGE} máu và mất hết nước</div></div>`;
    } else {
      extra += `<div class="t-res">${(q.results || []).map(r => {
        const p = pById(r.id); if (!p) return ''; const c = CHARS[p.char];
        return `<div><i style="--cc:${c.color}"></i><div><b>${esc(p.name)}</b><br>${r.correct
          ? `<span class="ok">✔ ĐÚNG ${(r.time / 1000).toFixed(1).replace('.', ',')}s · +${esc(q.gadget.name)}</span>`
          : `<span class="bad">✘ ${r.answer === null ? 'HẾT GIỜ' : 'SAI'} · RÒ RỈ −${M.cfg.LEAK_DAMAGE} MÁU${r.died ? ' · GỤC NGÃ' : ''}</span>`}</div></div>`;
      }).join('')}</div>`;
      extra += `<div class="t-explain"><b>ĐÁP ÁN ${LET[q.correct]}.</b> ${esc(q.explain || '')}</div>`;
      if (q.lockPicker) {
        const pk = pById(q.lockPicker);
        if (!q.lockDone && m && m.id === q.lockPicker) {
          const foes = M.players.filter(p => p.alive && p.id !== m.id);
          extra += `<div class="t-lock"><h3>BẠN SỬA NHANH NHẤT! CHỌN ĐỐI THỦ ĐỂ KHÓA VAN</h3>
            <div style="font-family:var(--mono);font-size:13px;color:#ffb3ad">Đối thủ sẽ đứng im ${String(M.cfg.LOCK_DURATION).replace('.', ',')} giây khi trận đấu tiếp tục · còn <b id="lockClock"></b>s</div>
            <div class="row">${foes.map(f => `<button class="btn red" data-act="lock" data-v="${f.id}">${esc(f.name)} · ${CHARS[f.char].name}</button>`).join('')}</div></div>`;
        } else if (!q.lockDone) {
          extra += `<div class="t-wait">⏳ ${esc(pk ? pk.name : '')} TRẢ LỜI NHANH NHẤT · ĐANG CHỌN ĐỐI THỦ ĐỂ KHÓA VAN… (<b id="lockClock"></b>s)</div>`;
        } else if (q.lockTarget) {
          const tg = pById(q.lockTarget);
          extra += `<div class="t-lock"><h3>${esc(pk ? pk.name : '')} ĐÃ KHÓA VAN ${esc(tg ? tg.name : '')}!</h3>
            <div style="font-family:var(--mono);font-size:13px;color:#ffb3ad">${esc(tg ? tg.name : '')} sẽ đứng im ${String(M.cfg.LOCK_DURATION).replace('.', ',')} giây khi trận đấu tiếp tục.</div></div>`;
        }
      }
    }
    $('terminal').innerHTML = `
      <div class="t-head"><span class="led"></span><span class="ti">SỰ CỐ HỆ THỐNG ${M.qIndex + 1}/${M.total}</span>
        <span class="tn">${reveal ? 'KẾT QUẢ CHẨN ĐOÁN' : 'CÒN <b id="qClock"></b> GIÂY'}</span></div>
      <div class="t-body"><div class="t-mod">&gt; MODULE: ${esc(q.topic.toUpperCase())}</div>
        <div class="t-q">${esc(q.text)}</div><div class="t-opts">${opts}</div>${foot}${extra}</div>`;
  }

  // ---------- KẾT THÚC ----------
  function renderEnded() {
    if (!M.ranking) return;
    const ranked = M.ranking.map(pById).filter(Boolean), w = ranked[0], c = CHARS[w.char], m = me();
    const canRestart = isScreen || (m && M.hostId === m.id);
    $('endBody').innerHTML = `<div class="plate" style="${cssVars(c)}">
      <div class="winner"><canvas width="520" height="520" id="winCanvas"></canvas>
        <div><div class="k">NHÀ VÔ ĐỊCH ĐẠI CHIẾN ÁP SUẤT</div><h2 style="color:${c.color}">${esc(w.name)}</h2>
        <p><b>${esc(TEAMS[w.team - 1])}</b> · ${c.name} · ${w.kills} lần hạ gục · ${w.correct}/${M.total} câu đúng</p>
        ${m ? `<p style="font-family:var(--mono);color:var(--amber)">${m.id === w.id ? 'CHÚC MỪNG! BẠN LÀ KỸ THUẬT VIÊN XUẤT SẮC NHẤT' : `BẠN VỀ HẠNG ${m.place}`}</p>` : ''}</div></div>
      <div class="ranks">${ranked.map(p => { const cc = CHARS[p.char];
        return `<div class="rk"><span class="pl">#${p.place}</span><span class="c" style="background:${cc.color}"></span>
          <div><b>${esc(p.name)}</b><small>${esc(TEAMS[p.team - 1])} · ${cc.name}</small></div>
          <div class="num"><b>${p.kills}</b>HẠ GỤC</div><div class="num"><b>${p.correct}/${M.total}</b>CÂU ĐÚNG</div></div>`; }).join('')}</div>
      <div class="center" style="margin-top:18px">${canRestart ? '<button class="btn" data-act="restart">CHƠI LẠI</button>' : '<p class="field-label">CHỜ CHỦ PHÒNG BẤM CHƠI LẠI…</p>'}</div></div>`;
    R.portrait($('winCanvas'), w.char);
  }

  // ================= ĐIỀU KHIỂN =================
  const keys = {}, mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  let dashSeq = 0, lastSent = '', lastSentT = 0, meScreen = { x: innerWidth / 2, y: innerHeight / 2 };
  const pred = { x: 0, y: 0, init: false, dashT: 0, dashCd: 0, dir: [1, 0] };

  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter' && e.target.id === 'nameInput') doJoin(); return; }
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) tryDash();
    if (M && M.phase === 'quiz' && /^Digit[1-4]$/.test(e.code)) { const m = me(); if (m && m.alive && m.answer === null) send('answer', { i: Number(e.code.slice(5)) - 1 }); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  $('world').addEventListener('mousedown', e => { if (e.button === 0) { mouse.down = true; ac(); } });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  addEventListener('contextmenu', e => { if (e.target.id === 'world') e.preventDefault(); });

  function moveDir() {
    let x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y -= 1; if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1;
    const l = Math.hypot(x, y); return l ? [x / l, y / l] : [0, 0];
  }
  function bits() { let m = 0; if (keys.KeyW || keys.ArrowUp) m |= 1; if (keys.KeyS || keys.ArrowDown) m |= 2; if (keys.KeyA || keys.ArrowLeft) m |= 4; if (keys.KeyD || keys.ArrowRight) m |= 8; return m; }
  function controllable() {
    const m = me(); if (!m || !m.alive || isScreen || !latest || M.phase !== 'combat') return false;
    const sp = latest.players.get(m.id); return sp && !(sp.fl & 2);
  }
  function aim() { return Math.atan2(mouse.y - meScreen.y, mouse.x - meScreen.x); }
  function tryDash() {
    if (!controllable() || pred.dashCd > 0) return;
    const m = me(), st = SH.stats(m.char, m.gadgets), [dx, dy] = moveDir(), a = aim();
    pred.dashT = SH.MOVE.DASH_TIME; pred.dashCd = st.dashCd; pred.dir = dx || dy ? [dx, dy] : [Math.cos(a), Math.sin(a)];
    dashSeq++; SFX.dash();
  }
  setInterval(() => {
    if (!M || !me() || !inMatch() || isScreen) return;
    const ok = controllable();
    const msg = { m: ok ? bits() : 0, a: Math.round(aim() * 1000) / 1000, f: ok && mouse.down ? 1 : 0, d: dashSeq };
    const s = JSON.stringify(msg), t = performance.now();
    if (s !== lastSent || t - lastSentT > 250) { send('input', msg); lastSent = s; lastSentT = t; }
  }, 33);

  // click chung
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    ac(); SFX.click();
    const v = Number(b.dataset.v);
    switch (b.dataset.act) {
      case 'team': selTeam = v; renderLobby(); break;
      case 'char': selChar = v; renderLobby(); break;
      case 'join': doJoin(); break;
      case 'leave': send('leave'); break;
      case 'start': send('start'); break;
      case 'ans': send('answer', { i: v }); break;
      case 'lock': send('lock', { target: v }); SFX.lock(); break;
      case 'restart': send('restart'); break;
      case 'rejoin': { const p = pById(v); if (p) send('join', { name: p.name, team: p.team, char: p.char }); break; }
      case 'resetall': if (confirm('Hủy trận hiện tại và xóa hết người chơi?')) send('resetAll'); break;
      case 'screen': isScreen = true; sessionStorage.setItem('dcas_screen', '1'); send('hello', { key: KEY, screen: true }); break;
      case 'unscreen': isScreen = false; sessionStorage.removeItem('dcas_screen'); if (location.pathname === '/screen') location.href = '/'; else send('hello', { key: KEY, screen: false }); break;
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'nameInput') typedName = e.target.value; });
  function doJoin() {
    if (!typedName.trim()) return toast('Hãy nhập tên của bạn.');
    if (!selTeam) return toast('Hãy chọn tổ bạn đại diện.');
    if (selChar === null) return toast('Hãy chọn một nhân vật.');
    send('join', { name: typedName, team: selTeam, char: selChar });
  }

  // ================= VÒNG VẼ =================
  const cv = $('world'), ctx = cv.getContext('2d');
  let dpr = 1;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  addEventListener('resize', resize); resize();
  R.buildGround();

  const cam = { x: CX, y: CY, zoom: 1 };
  const walk = {}, lastPos = {}, flash = {}, lastSpray = {};
  let shake = 0, lastFrame = performance.now(), hurt = 0, lastCount = null, lastLock = 0, lastMini = 0;

  function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

  function handleEvent(e) {
    const m = me();
    if (e.k === 'hit') {
      R.splash(e.x, e.y, true); flash[e.id] = 1;
      if (m && e.id === m.id) { shake = Math.max(shake, 7); hurt = 1; SFX.hit(); }
      else if (m && e.by === m.id) SFX.mark();
    } else if (e.k === 'splash') R.splash(e.x, e.y, false);
    else if (e.k === 'drip') R.splash(e.x, e.y, false);
    else if (e.k === 'kill') {
      const p = pById(e.v); R.burst(e.x, e.y, p ? CHARS[p.char].color : '#fff'); SFX.kill(); shake = Math.max(shake, 10);
    } else if (e.k === 'dash') { const sp = latest && latest.players.get(e.id); if (sp) R.dust(sp.x, sp.y); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    const t = now / 1000;
    const vw = innerWidth, vh = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#20361a'; ctx.fillRect(0, 0, vw, vh);
    if (!M || !latest || M.phase === 'lobby') return;

    // nội suy
    const rt = now - INTERP;
    while (events.length && events[0].t <= rt) handleEvent(events.shift().e);
    let s0 = snaps[0], s1 = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= rt) { s0 = snaps[i]; s1 = snaps[i + 1] || snaps[i]; break; }
    const k = s1 === s0 ? 0 : Math.max(0, Math.min(1, (rt - s0.t) / (s1.t - s0.t)));
    R.updateFx(dt);

    const m = me(), myServer = m ? latest.players.get(m.id) : null;
    // dự đoán chuyển động của chính mình
    if (m && myServer && !isScreen) {
      const st = SH.stats(m.char, m.gadgets);
      pred.dashCd = Math.max(0, pred.dashCd - dt);
      if (!pred.init || !controllable()) { pred.x = myServer.x; pred.y = myServer.y; pred.init = true; pred.dashT = 0; }
      else {
        const [dx, dy] = moveDir();
        let vx = dx * st.speed, vy = dy * st.speed;
        if (pred.dashT > 0) { pred.dashT -= dt; vx = pred.dir[0] * st.speed * SH.MOVE.DASH_MULT; vy = pred.dir[1] * st.speed * SH.MOVE.DASH_MULT; }
        pred.x += vx * dt; pred.y += vy * dt; SH.resolve(pred, PR);
        const ex = myServer.x - pred.x, ey = myServer.y - pred.y, err = Math.hypot(ex, ey);
        if (err > 90) { pred.x = myServer.x; pred.y = myServer.y; }
        else { const f = Math.min(1, dt * (dx || dy || pred.dashT > 0 ? 2.5 : 10)); pred.x += ex * f; pred.y += ey * f; }
      }
    }

    // danh sách nhân vật cần vẽ
    const list = [];
    for (const [id, p1] of s1.players) {
      const p0 = s0.players.get(id) || p1;
      let x = p0.x + (p1.x - p0.x) * k, y = p0.y + (p1.y - p0.y) * k, a = lerpAngle(p0.a, p1.a, k);
      const mine = m && id === m.id && !isScreen;
      if (mine) { x = pred.x; y = pred.y; if (controllable()) a = aim(); }
      const lp = lastPos[id] || { x, y }; const moved = Math.hypot(x - lp.x, y - lp.y);
      walk[id] = (walk[id] || 0) + moved * 0.22; lastPos[id] = { x, y };
      flash[id] = Math.max(0, (flash[id] || 0) - dt * 6);
      list.push({ id, x, y, a, hp: p1.hp, w: p1.w, sh: p1.sh, fl: p1.fl, lk: p1.lk, mine });
    }

    // camera
    const follow = m && m.alive && !isScreen;
    let tx = CX, ty = CY, zoom;
    if (follow) { zoom = Math.max(0.5, Math.min(vw / 1150, vh / 720)); tx = pred.x; ty = pred.y; }
    else zoom = Math.min(vw / (W + 60), vh / (H + 60));
    cam.zoom += (zoom - cam.zoom) * Math.min(1, dt * 4);
    const hw = vw / 2 / cam.zoom, hh = vh / 2 / cam.zoom;
    tx = W > hw * 2 ? Math.max(hw - 40, Math.min(W - hw + 40, tx)) : CX;
    ty = H > hh * 2 ? Math.max(hh - 40, Math.min(H - hh + 40, ty)) : CY;
    cam.x += (tx - cam.x) * Math.min(1, dt * (follow ? 12 : 4)); cam.y += (ty - cam.y) * Math.min(1, dt * (follow ? 12 : 4));
    shake = Math.max(0, shake - dt * 30);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    const ox = vw / 2 - cam.x * cam.zoom + sx, oy = vh / 2 - cam.y * cam.zoom + sy;
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * ox, dpr * oy);
    const view = { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };

    // ---- thế giới ----
    ctx.drawImage(R.ground, 0, 0);
    R.drawPuddles(ctx);
    R.drawPumpZone(ctx, t);
    R.drawTargetRing(ctx, latest.rt < latest.ring ? latest.rt : null);
    R.drawObstacles(ctx, t, view);

    // đường ngắm
    const mineP = list.find(p => p.mine);
    if (mineP && controllable()) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.moveTo(mineP.x + Math.cos(mineP.a) * 38, mineP.y + Math.sin(mineP.a) * 38);
      ctx.lineTo(mineP.x + Math.cos(mineP.a) * 320, mineP.y + Math.sin(mineP.a) * 320); ctx.stroke(); ctx.restore();
    }
    // tia nước
    for (const [id, b1] of s1.bullets) {
      const b0 = s0.bullets.get(id); if (!b0) continue;
      R.drawBullet(ctx, b0[1] + (b1[1] - b0[1]) * k, b0[2] + (b1[2] - b0[2]) * k, b1[1] - b0[1] || 1, b1[2] - b0[2]);
    }
    // nhân vật
    list.sort((a, b) => a.y - b.y);
    for (const p of list) {
      const info = pById(p.id); if (!info) continue;
      if (!(p.fl & 1)) continue;
      const st = SH.stats(info.char, info.gadgets);
      R.drawTech(ctx, p.x, p.y, p.a, info.char, { walk: walk[p.id], flash: flash[p.id], locked: p.fl & 2, shield: p.sh > 0, water: p.w / st.maxWater, dash: p.fl & 4, t });
      if ((p.fl & 8) && M.phase === 'combat' && now - (lastSpray[p.id] || 0) > 105) {
        lastSpray[p.id] = now;
        const d = Math.hypot(p.x - cam.x, p.y - cam.y);
        SFX.spray(p.mine ? 1 : Math.max(0, 0.6 - d / 1400));
      }
    }
    R.drawParticles(ctx);
    R.drawDrought(ctx, latest.ring, t);

    // ---- bảng tên (vẽ ở tọa độ màn hình cho nét) ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of list) {
      const info = pById(p.id); if (!info || !(p.fl & 1)) continue;
      const st = SH.stats(info.char, info.gadgets), c = CHARS[info.char];
      const X = (p.x - cam.x) * cam.zoom + vw / 2 + sx, Y = (p.y - cam.y) * cam.zoom + vh / 2 + sy - 40 * cam.zoom;
      if (p.mine) meScreen = { x: X, y: Y + 40 * cam.zoom };
      ctx.font = '700 13px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = p.mine ? '#ffc12e' : '#fff';
      const label = p.mine ? 'BẠN' : info.name;
      ctx.strokeText(label, X, Y - 12); ctx.fillText(label, X, Y - 12);
      const bw = 46;
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(X - bw / 2 - 1, Y - 7, bw + 2, 9);
      ctx.fillStyle = p.hp / st.maxHp < 0.35 ? '#ff5a4e' : c.color; ctx.fillRect(X - bw / 2, Y - 6, bw * Math.max(0, p.hp / st.maxHp), 4);
      if (p.sh > 0) { ctx.fillStyle = '#8be9ff'; ctx.fillRect(X - bw / 2, Y - 6, bw * Math.min(1, p.sh / st.maxHp), 4); }
      ctx.fillStyle = '#4fb4ff'; ctx.fillRect(X - bw / 2, Y - 1, bw * Math.max(0, Math.min(1, p.w / st.maxWater)), 2);
    }

    // ---- HUD động ----
    updateHud(now, list, m, myServer);
  }

  function updateHud(now, list, m, myServer) {
    const s = latest, ph = M.phase;
    // phần thời gian
    const elapsed = performance.now() - s.t;
    const remain = s.pr < 0 ? -1 : Math.max(0, s.pr - elapsed);
    const pb = $('phaseBox');
    const pips = `<div class="pips">${Array.from({ length: M.total }, (_, i) => `<i class="${i <= M.qIndex ? 'done' : ''}"></i>`).join('')}</div>`;
    let html = '';
    if (ph === 'countdown') {
      const sec = Math.ceil(remain / 1000);
      html = `<div class="k">${M.final ? 'VÒNG CUỐI' : `HIỆP ${M.qIndex + 2}`} · CHUẨN BỊ</div><div class="v warn">${sec}</div>${pips}`;
      if (sec !== lastCount && sec > 0) { lastCount = sec; SFX.beep(); announce(String(sec), M.qIndex < 0 ? 'Trận đấu sắp bắt đầu' : '', 900, '#ffc12e'); }
    } else if (ph === 'combat') {
      if (M.final) html = `<div class="k">VÒNG CUỐI · HẠN HÁN THU HẸP</div><div class="v red">SỐNG SÓT!</div>${pips}`;
      else { const sec = Math.ceil(remain / 1000); html = `<div class="k">SỰ CỐ TIẾP THEO SAU</div><div class="v ${sec <= 5 ? 'red' : ''}">00:${String(sec).padStart(2, '0')}</div>${pips}`; }
    } else if (ph === 'quiz' || ph === 'reveal') html = `<div class="k">SỰ CỐ HỆ THỐNG</div><div class="v warn">TẠM DỪNG</div>${pips}`;
    if (pb.innerHTML !== html) pb.innerHTML = html;

    // đồng hồ trong terminal
    const qb = $('qTimeBar'); if (qb && ph === 'quiz') qb.style.width = (remain / (M.cfg.QUIZ_TIME * 1000) * 100) + '%';
    const qc = $('qClock'); if (qc) qc.textContent = Math.ceil(remain / 1000);
    const lc = $('lockClock'); if (lc) lc.textContent = Math.ceil(remain / 1000);

    // thẻ của tôi
    if (m && myServer && !isScreen) {
      const st = SH.stats(m.char, m.gadgets);
      const hpk = Math.max(0, myServer.hp / st.maxHp);
      $('hpFill').style.width = (hpk * 100) + '%';
      $('shFill').style.width = (Math.min(1, myServer.sh / st.maxHp) * 100) + '%';
      $('hpText').textContent = `${myServer.hp}${myServer.sh > 0 ? ' +' + myServer.sh : ''}`;
      $('hpFill').parentElement.classList.toggle('low', hpk < 0.35);
      $('wFill').style.width = (Math.min(1, myServer.w / st.maxWater) * 100) + '%';
      $('wText').textContent = (myServer.fl & 16) ? 'ĐANG NẠP…' : `${myServer.w}`;
      $('dashFill').style.width = ((1 - pred.dashCd / st.dashCd) * 100) + '%';
      // cảnh báo
      const out = Math.hypot(myServer.x - CX, myServer.y - CY) > s.ring && m.alive;
      hurt = Math.max(0, hurt - 0.04);
      const red = Math.max(hurt * 0.6, out ? 0.45 + Math.sin(now / 150) * 0.15 : 0, hpk < 0.3 && m.alive ? 0.3 : 0);
      $('vignette').style.boxShadow = red > 0.01 ? `inset 0 0 ${120 + red * 80}px rgba(255,${out ? 110 : 30},20,${red})` : 'none';
      if (myServer.lk > 0 && lastLock === 0) { announce('BẠN BỊ KHÓA VAN!', 'Không thể di chuyển trong giây lát', 1800, '#ff4f43'); SFX.lock(); }
      lastLock = myServer.lk;
      if (out && ph === 'combat' && now - (window.__droughtWarn || 0) > 4000) { window.__droughtWarn = now; announce('HẠN HÁN!', 'Chạy vào vùng an toàn ngay', 1300, '#ff8c2a'); }
      if (myServer.w < 4 && mouse.down && ph === 'combat' && now - (window.__emptyWarn || 0) > 2500) { window.__emptyWarn = now; toast('Hết nước! Về TRẠM BƠM ở giữa bản đồ để nạp.'); }
    }
    // thanh máu nhỏ trên bảng
    for (const row of document.querySelectorAll('.brow')) {
      const id = Number(row.dataset.pid), sp = s.players.get(id), info = pById(id);
      if (sp && info) row.querySelector('.mini i').style.width = (Math.max(0, sp.hp / SH.stats(info.char, info.gadgets).maxHp) * 100) + '%';
    }
    // bản đồ nhỏ
    if (now - lastMini > 80) {
      lastMini = now;
      R.drawMinimap($('minimap'), list.filter(p => p.fl & 1).map(p => ({ ...p, char: (pById(p.id) || {}).char || 0, alive: true })), s.ring, M.myId);
    }
  }

  requestAnimationFrame(frame);
  connect();
})();
