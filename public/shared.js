/* =============================================================
   ĐẠI CHIẾN ÁP SUẤT — dữ liệu & vật lý dùng chung cho server và trình duyệt
   ============================================================= */
(function (root) {
  const W = 1600, H = 1000;           // kích thước bản đồ
  const CX = 800, CY = 500;           // tâm bản đồ (trạm bơm)
  const FENCE = 26;                   // hàng rào quanh bản đồ
  const PR = 18;                      // bán kính nhân vật
  const PUMP_R = 118;                 // bán kính vùng nạp nước quanh trạm bơm

  // ---- 4 NHÂN VẬT ----
  const CHARS = [
    { id: 0, name: 'THỢ ỐNG', role: 'Chống chịu', color: '#e5533f', dark: '#7d2318', hat: '#ff8a1f',
      hp: 70, speed: 190, dmg: 6, water: 100, regen: 6, fireMs: 100, dashCd: 2.6,
      perk: 'Lì đòn nhất đội: 70 máu.' },
    { id: 1, name: 'KỸ SƯ BƠM', role: 'Sát thương', color: '#2f86d9', dark: '#163f6b', hat: '#f4f4ee',
      hp: 55, speed: 205, dmg: 8, water: 90, regen: 6, fireMs: 100, dashCd: 2.6,
      perk: 'Tia nước mạnh hơn 33%.' },
    { id: 2, name: 'CHUYÊN GIA IOT', role: 'Bền bỉ', color: '#35a853', dark: '#17592a', hat: '#2b2f36',
      hp: 50, speed: 210, dmg: 6, water: 135, regen: 11, fireMs: 88, dashCd: 2.3,
      perk: 'Bình nước to, hồi nước nhanh, bắn liên tục.' },
    { id: 3, name: 'THỢ ĐIỆN', role: 'Cơ động', color: '#efb21c', dark: '#7a5604', hat: '#ffe14d',
      hp: 45, speed: 238, dmg: 6, water: 100, regen: 6, fireMs: 100, dashCd: 1.3,
      perk: 'Chạy nhanh nhất, lướt gần như liên tục.' },
  ];

  // ---- 5 LINH KIỆN (thưởng khi trả lời đúng câu 1..5) ----
  const GADGETS = [
    { id: 'pump', name: 'BƠM TĂNG ÁP', desc: '+35% sát thương tia nước' },
    { id: 'tank', name: 'BÌNH CHỨA LỚN', desc: '+50 sức chứa nước, hồi nước nhanh hơn' },
    { id: 'valve', name: 'VAN ĐIỆN TỪ', desc: 'Khiên chặn 25 sát thương' },
    { id: 'spr', name: 'BÉC PHUN XOAY', desc: 'Phun 3 tia nước cùng lúc' },
    { id: 'ctrl', name: 'BỘ ĐIỀU KHIỂN IOT', desc: '+20% tốc độ, lướt hồi nhanh gấp đôi' },
  ];

  const TEAMS = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];

  // ---- CHƯỚNG NGẠI VẬT ----
  const OBS = [];
  const C = (x, y, r, kind, extra) => OBS.push(Object.assign({ t: 'c', x, y, r, kind }, extra || {}));
  const R = (x, y, w, h, kind, extra) => OBS.push(Object.assign({ t: 'r', x, y, w, h, kind }, extra || {}));

  R(746, 462, 108, 76, 'pump');                       // trạm bơm trung tâm
  R(40, 40, 112, 82, 'shed', { c: 0 });               // 4 nhà kho = điểm xuất phát
  R(1448, 40, 112, 82, 'shed', { c: 1 });
  R(40, 878, 112, 82, 'shed', { c: 2 });
  R(1448, 878, 112, 82, 'shed', { c: 3 });

  // hàng cà phê (có khe hở để chạy qua)
  for (const y of [270, 730]) {
    [300, 360, 420, 540, 600, 660].forEach((x, i) => C(x, y, 21, 'bush', { s: i * 7 + y }));
    [940, 1000, 1060, 1180, 1240, 1300].forEach((x, i) => C(x, y, 21, 'bush', { s: i * 11 + y }));
  }
  // bụi cây chắn hai bên trạm bơm
  [[598, 432], [598, 568], [1002, 432], [1002, 568]].forEach(([x, y], i) => C(x, y, 21, 'bush', { s: 99 + i }));
  // bồn nước
  [[800, 330], [800, 670], [372, 500], [1228, 500]].forEach(([x, y]) => C(x, y, 25, 'tank'));
  // tấm pin mặt trời
  R(556, 104, 132, 46, 'solar'); R(912, 104, 132, 46, 'solar');
  R(556, 850, 132, 46, 'solar'); R(912, 850, 132, 46, 'solar');
  // đá
  [[470, 385], [1130, 615], [1130, 385], [470, 615], [230, 640], [1370, 360]].forEach(([x, y], i) => C(x, y, 16, 'rock', { s: i }));
  // cột cảm biến IoT
  [[245, 500], [1355, 500], [700, 215], [900, 785]].forEach(([x, y]) => C(x, y, 8, 'sensor'));

  const SPAWNS = [[196, 178], [1404, 178], [196, 822], [1404, 822]];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Đẩy hình tròn (x,y,r) ra khỏi chướng ngại vật và giữ trong hàng rào
  function resolve(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const o of OBS) {
        if (o.t === 'c') {
          const dx = p.x - o.x, dy = p.y - o.y, m = r + o.r, d2 = dx * dx + dy * dy;
          if (d2 < m * m) {
            const d = Math.sqrt(d2) || 0.001;
            p.x = o.x + (dx / d) * m; p.y = o.y + (dy / d) * m;
          }
        } else {
          const cx = clamp(p.x, o.x, o.x + o.w), cy = clamp(p.y, o.y, o.y + o.h);
          const dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
          if (d2 < r * r) {
            if (d2 > 0.0001) {
              const d = Math.sqrt(d2);
              p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r;
            } else { // tâm nằm trong hình chữ nhật -> đẩy ra cạnh gần nhất
              const l = p.x - o.x, rt = o.x + o.w - p.x, t = p.y - o.y, b = o.y + o.h - p.y;
              const m = Math.min(l, rt, t, b);
              if (m === l) p.x = o.x - r; else if (m === rt) p.x = o.x + o.w + r;
              else if (m === t) p.y = o.y - r; else p.y = o.y + o.h + r;
            }
          }
        }
      }
      p.x = clamp(p.x, FENCE + r, W - FENCE - r);
      p.y = clamp(p.y, FENCE + r, H - FENCE - r);
    }
    return p;
  }

  // Điểm (x,y) có nằm trong vật cản không (dùng cho tia nước)
  function blocked(x, y) {
    if (x < FENCE || y < FENCE || x > W - FENCE || y > H - FENCE) return true;
    for (const o of OBS) {
      if (o.t === 'c') { const dx = x - o.x, dy = y - o.y; if (dx * dx + dy * dy < o.r * o.r) return true; }
      else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
    }
    return false;
  }

  // Chỉ số thực tế của người chơi (nhân vật + linh kiện)
  function stats(charId, gadgets) {
    const c = CHARS[charId] || CHARS[0], g = gadgets || [];
    const has = id => g.includes(id);
    return {
      speed: c.speed * (has('ctrl') ? 1.2 : 1),
      dmg: c.dmg * (has('pump') ? 1.35 : 1),
      maxWater: c.water + (has('tank') ? 50 : 0),
      regen: c.regen * (has('tank') ? 1.6 : 1),
      dashCd: c.dashCd * (has('ctrl') ? 0.5 : 1),
      fireMs: c.fireMs,
      spread: has('spr'),
      maxHp: c.hp,
    };
  }

  const MOVE = { DASH_TIME: 0.17, DASH_MULT: 2.9 };

  root.SHARED = { W, H, CX, CY, FENCE, PR, PUMP_R, CHARS, GADGETS, TEAMS, OBS, SPAWNS, resolve, blocked, stats, clamp, MOVE };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
