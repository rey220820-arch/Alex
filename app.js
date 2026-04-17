// ===== КОНФИГ =====
const CFG = {
  server: window.location.origin,
  serverName: '88.83.217.130'
};

// ===== СОСТОЯНИЕ =====
const S = {
  token: null, userId: null, displayName: null, isAdmin: false,
  rooms: [], currentRoom: null,
  syncToken: null, syncTimer: null, pollTimer: null,
  pendingAtt: null,
  replyTo: null,
  editEvent: null,
  membersOpen: false,
  searchOpen: false,
  allUsers: [],
  pinnedMsgs: {},
  inviteRoomId: null,
  inviteToken: null
};

// ===== УТИЛИТЫ =====
const $ = id => document.getElementById(id);
const nt = ts => { const d = ts ? new Date(ts) : new Date(); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
const nd = ts => { const d = new Date(ts); const t = new Date(); if (d.toDateString() === t.toDateString()) return 'сегодня'; const y = new Date(t); y.setDate(y.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'вчера'; return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' }); };
const ini = n => (n || '?').split(/[\s_\-@]/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '??';
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.round(b / 1024) + ' КБ';
let _txnCounter = 0;
const txn = () => Date.now() + '_' + (++_txnCounter);

function setH() { document.body.style.height = window.innerHeight + 'px'; }
setH();
window.addEventListener('resize', () => setTimeout(setH, 100));
function onFocus() { setTimeout(() => { setH(); scrollMsgs(); }, 350); }
function onBlur() { setTimeout(setH, 150); }

function showNotif(t) {
  const n = $('notif');
  n.textContent = t;
  n.classList.add('show');
  clearTimeout(n._t);
  n._t = setTimeout(() => n.classList.remove('show'), 3500);
}

function onInp(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  updateSendBtn();
  if (S.currentRoom !== null) sendTyping();
}

function updateSendBtn() {
  const has = $('msg-inp').value.trim() || S.pendingAtt;
  $('snd-btn').classList.toggle('active', !!has);
}

// ===== API =====
async function api(method, path, body, tok) {
  const h = { 'Content-Type': 'application/json' };
  const t = tok || S.token;
  if (t) h['Authorization'] = 'Bearer ' + t;
  const url = path.startsWith('http') ? path : CFG.server + '/_matrix/client/v3' + path;
  const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json();
  d._status = r.status;
  d._ok = r.ok;
  return d;
}

async function adminApi(path) {
  const tok = S.token;
  const r = await fetch(CFG.server + '/_synapse/admin' + path, { headers: { 'Authorization': 'Bearer ' + tok } });
  const d = await r.json();
  d._status = r.status; d._ok = r.ok;
  return d;
}

async function adminPost(path, body) {
  const tok = S.token;
  const r = await fetch(CFG.server + '/_synapse/admin' + path, { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  d._status = r.status; d._ok = r.ok;
  return d;
}

async function adminDelete(path, body) {
  const tok = S.token;
  const r = await fetch(CFG.server + '/_synapse/admin' + path, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  d._status = r.status; d._ok = r.ok;
  return d;
}

async function adminPut(path, body) {
  const tok = S.token;
  const r = await fetch(CFG.server + '/_synapse/admin' + path, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  d._status = r.status; d._ok = r.ok;
  return d;
}

// ===== СТАРТ =====
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  S.inviteRoomId = params.get('room') || null;
  S.inviteToken = params.get('invite') || null;
  const saved = localStorage.getItem('tg_s');
  setTimeout(() => {
    $('splash').classList.add('hidden');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        S.token = s.token; S.userId = s.userId; S.displayName = s.displayName; S.isAdmin = s.isAdmin || false;
        showApp();
        checkAndApplyAdmin(S.token, S.userId);
      } catch { showAuth(); }
    } else { showAuth(); }
  }, 2300);
});

// ===== AUTH =====
function showAuth() {
  $('auth').style.display = 'flex';
  $('app').style.display = 'none';
  $('auth').classList.remove('hidden');
  $('app').classList.add('hidden');
  const tabs = document.querySelector('.a-tabs');
  const tabRg = $('tab-rg');
  if (S.inviteToken) {
    if (tabs) tabs.style.display = '';
    if (tabRg) tabRg.style.display = '';
  } else {
    if (tabs) tabs.style.display = 'none';
    if (tabRg) tabRg.style.display = 'none';
    $('f-l').style.display = 'block';
    $('f-r').style.display = 'none';
  }
}

function showApp() {
  $('auth').style.display = 'none';
  $('app').style.display = 'flex';
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  const nm = S.displayName || (S.userId || '').split(':')[0].replace('@', '');
  $('usr-av').textContent = ini(nm);
  $('usr-nm').textContent = nm;
  if (S.isAdmin) applyAdminUI();
  initWatermark();
  resetInactivity();
  initFab();
  const msgsEl = $('msgs');
  if (msgsEl && !msgsEl._scrollInit) {
    msgsEl._scrollInit = true;
    msgsEl.addEventListener('scroll', function() {
      if (this.scrollTop < 50 && !loadingHistory && S.currentRoom !== null) {
        loadMoreMessages();
      }
    });
  }
  loadRooms().then(async () => {
    try {
      const syncD = await api('GET', '/sync?timeout=0');
      const invited = Object.keys(syncD.rooms?.invite || {});
      for (const roomId of invited) {
        await api('POST', '/join/' + encodeURIComponent(roomId), {}).catch(() => {});
      }
      if (invited.length > 0) await loadRooms();
    } catch {}
    if (S.inviteRoomId) {
      api('POST', '/join/' + encodeURIComponent(S.inviteRoomId), {})
        .then(() => { S.inviteRoomId = null; loadRooms(); })
        .catch(() => { S.inviteRoomId = null; });
    }
  });
  startSync();
}

function switchTab(t) {
  $('tab-in').classList.toggle('active', t === 'l');
  $('tab-rg').classList.toggle('active', t === 'r');
  $('f-l').style.display = t === 'l' ? 'block' : 'none';
  $('f-r').style.display = t === 'r' ? 'block' : 'none';
  $('a-err').classList.remove('show');
}

function authBusy(v) {
  $('f-l').style.display = v ? 'none' : ($('tab-in').classList.contains('active') ? 'block' : 'none');
  $('f-r').style.display = v ? 'none' : ($('tab-rg').classList.contains('active') ? 'block' : 'none');
  $('a-load').classList.toggle('show', v);
}

function showAErr(m) { const e = $('a-err'); e.textContent = m; e.classList.add('show'); }

async function doLogin() {
  const u = $('l-u').value.trim().toLowerCase();
  const p = $('l-p').value;
  if (!u || !p) { showAErr('Введите логин и пароль'); return; }
  authBusy(true);
  try {
    const d = await api('POST', '/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: u }, password: p });
    if (d.access_token) {
      S.token = d.access_token; S.userId = d.user_id;
      const prof = await api('GET', '/profile/' + encodeURIComponent(d.user_id));
      S.displayName = prof.displayname || u;
      S.isAdmin = false;
      localStorage.setItem('tg_s', JSON.stringify({ token: S.token, userId: S.userId, displayName: S.displayName, isAdmin: false }));
      showApp();
      checkAndApplyAdmin(S.token, d.user_id);
    } else if (d.errcode === 'M_FORBIDDEN') { throw new Error('Неверный логин или пароль'); }
    else { throw new Error(d.error || 'Ошибка входа'); }
  } catch (e) { authBusy(false); showAErr(e.message); }
}

async function doRegister() {
  if (!S.inviteToken) { showAErr('Регистрация доступна только по ссылке-приглашению от администратора'); return; }
  const u = $('r-u').value.trim().toLowerCase();
  const p = $('r-p').value;
  const p2 = $('r-p2').value;
  if (!u) { showAErr('Введите логин'); return; }
  if (!/^[a-z0-9_\-\.]+$/.test(u)) { showAErr('Только латинские буквы, цифры и знак _'); return; }
  if (p.length < 8) { showAErr('Пароль минимум 8 символов'); return; }
  if (p !== p2) { showAErr('Пароли не совпадают'); return; }
  authBusy(true);
  try {
    const d1 = await api('POST', '/register', { kind: 'user' });
    const session = d1.session;
    if (!session) throw new Error('Сервер не вернул session.');
    const d2 = await api('POST', '/register', { username: u, password: p, auth: { type: 'm.login.registration_token', token: S.inviteToken, session } });
    if (d2.errcode === 'M_USER_IN_USE') throw new Error('Этот логин уже занят');
    if (d2.errcode) throw new Error(d2.error || 'Ошибка регистрации');
    if (!d2.user_id) throw new Error('Сервер не подтвердил регистрацию');
    const dl = await api('POST', '/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: u }, password: p });
    if (!dl.access_token) throw new Error('Регистрация прошла, но вход не удался');
    S.token = dl.access_token; S.userId = dl.user_id; S.displayName = u; S.isAdmin = false;
    localStorage.setItem('tg_s', JSON.stringify({ token: S.token, userId: S.userId, displayName: S.displayName, isAdmin: false }));
    showApp();
    checkAndApplyAdmin(S.token, dl.user_id);
  } catch (e) { authBusy(false); showAErr(e.message); }
}

function doLogout() {
  if (!confirm('Выйти из аккаунта?')) return;
  api('POST', '/logout', {}).catch(() => {});
  S.token = null;
  clearInterval(S.syncTimer);
  clearTimeout(S.pollTimer);
  Object.assign(S, {
    userId: null, displayName: null, isAdmin: false,
    rooms: [], currentRoom: null, syncToken: null,
    pendingAtt: null, replyTo: null, editEvent: null,
    membersOpen: false, searchOpen: false, allUsers: []
  });
  localStorage.removeItem('tg_s');
  localStorage.removeItem('tg_archived');
  localStorage.removeItem('tg_muted');
  Object.keys(roomReceipts).forEach(k => delete roomReceipts[k]);
  Object.keys(historyTokens).forEach(k => delete historyTokens[k]);
  Object.keys(presenceCache).forEach(k => delete presenceCache[k]);
  Object.keys(linkPreviewCache).forEach(k => delete linkPreviewCache[k]);
  archivedRooms.clear();
  mutedRooms.clear();
  mentionMembers = [];
  allUsersCache = [];
  loadingHistory = false;
  _txnCounter = 0;
  activeActs = null;
  closeUsrMenu();
  closeRoomMenu();
  document.querySelectorAll('.ovrl.open').forEach(o => o.classList.remove('open'));
  const newChatBtn = $('new-chat-btn');
  const miNewChat = $('mi-new-chat');
  const miUsers = $('mi-users');
  if (newChatBtn) newChatBtn.style.display = 'none';
  if (miNewChat) miNewChat.style.display = 'none';
  if (miUsers) miUsers.style.display = 'none';
  const miInvites = $('mi-invites');
  if (miInvites) miInvites.style.display = 'none';
  $('rms').innerHTML = '<div style="padding:20px;text-align:center;color:var(--mt);font-size:13px">Загружаем чаты...</div>';
  $('msgs').innerHTML = '';
  $('ct-nm').textContent = 'Выберите чат';
  $('ct-mb').textContent = '';
  $('ct-av').textContent = '';
  const nochat = $('no-chat'); if (nochat) nochat.style.display = '';
  const lmb = $('load-more-btn'); if (lmb) lmb.remove();
  $('sb').classList.remove('hidden');
  $('ct').classList.remove('vis');
  showAuth();
}

$('l-p').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('r-p2').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

// ===== ADMIN =====
async function checkAndApplyAdmin(token, userId) {
  if (!token || !userId) return;
  try {
    const r = await fetch(CFG.server + '/_synapse/admin/v2/users?limit=1', { headers: { 'Authorization': 'Bearer ' + token } });
    const d = await r.json();
    if (d.users !== undefined) {
      S.isAdmin = true;
      const saved = JSON.parse(localStorage.getItem('tg_s') || '{}');
      saved.isAdmin = true;
      localStorage.setItem('tg_s', JSON.stringify(saved));
      applyAdminUI();
      return;
    }
  } catch {}
  try {
    const localPart = userId.split(':')[0].replace('@', '');
    const serverPart = userId.split(':')[1] || CFG.server.replace('https://','').replace('http://','');
    const encodedId = encodeURIComponent('@' + localPart + ':' + serverPart);
    const r = await fetch(CFG.server + '/_synapse/admin/v1/users/' + encodedId + '/admin', { headers: { 'Authorization': 'Bearer ' + token } });
    const d = await r.json();
    if (d.admin === true) {
      S.isAdmin = true;
      const saved = JSON.parse(localStorage.getItem('tg_s') || '{}');
      saved.isAdmin = true;
      localStorage.setItem('tg_s', JSON.stringify(saved));
      applyAdminUI();
    }
  } catch {}
}

function applyAdminUI() {
  S.isAdmin = true;
  const newChatBtn = $('new-chat-btn');
  const miNewChat = $('mi-new-chat');
  const miUsers = $('mi-users');
  if (newChatBtn) newChatBtn.style.display = 'inline-block';
  if (miNewChat) miNewChat.style.display = 'flex';
  if (miUsers) miUsers.style.display = 'flex';
  const miInvites = $('mi-invites');
  if (miInvites) miInvites.style.display = 'flex';
  const miStorage = $('mi-storage');
  if (miStorage) miStorage.style.display = 'flex';
  const miAudit = $('mi-audit');
  if (miAudit) miAudit.style.display = 'flex';
}

async function fetchMyPowerLevel(room) {
  try {
    const pl = await api('GET', '/rooms/' + encodeURIComponent(room.id) + '/state/m.room.power_levels/');
    const myLevel = pl.users?.[S.userId] ?? pl.users_default ?? 0;
    const kickLevel = pl.kick ?? 50;
    room.myPowerLevel = myLevel;
    room.kickLevel = kickLevel;
  } catch { room.myPowerLevel = 0; room.kickLevel = 50; }
}

function canKickInRoom(room) {
  if (S.isAdmin) return true;
  return (room.myPowerLevel || 0) >= (room.kickLevel || 50);
}

// ===== КОМНАТЫ =====
async function loadRooms() {
  try {
    const d = await api('GET', '/joined_rooms');
    const ids = (d.joined_rooms || []);
    const rooms = [];
    await Promise.all(ids.map(async id => {
      try {
        const [state, msgs] = await Promise.all([
          api('GET', '/rooms/' + encodeURIComponent(id) + '/state'),
          api('GET', '/rooms/' + encodeURIComponent(id) + '/messages?limit=1&dir=b')
        ]);
        const name = state.find(e => e.type === 'm.room.name')?.content?.name || id.split(':')[0].replace('!', '');
        const members = state.filter(e => e.type === 'm.room.member' && e.content?.membership === 'join');
        const last = msgs.chunk?.[0];
        let lastText = '';
        if (last?.type === 'm.room.message') {
          if (last.content?.msgtype === 'm.text') lastText = last.content.body;
          else if (last.content?.msgtype === 'm.image') lastText = '🖼 Фото';
          else if (last.content?.msgtype === 'm.file') lastText = '📄 ' + last.content.body;
        }
        const lastTs = last?.origin_server_ts || 0;
        rooms.push({ id, name, members, memberCount: members.length, lastText, lastTs, events: [], unread: 0 });
      } catch {}
    }));
    rooms.sort((a, b) => b.lastTs - a.lastTs);
    S.rooms = rooms;
    renderRooms(S.rooms);
  } catch (e) { console.error('loadRooms', e); }
}

function roomAvatar(name) {
  const n = name.toLowerCase();
  if (n.includes('руковод')) return '👔';
  if (n.includes('животно') || n.includes('свино')) return '🐷';
  if (n.includes('бухгалт')) return '📊';
  if (n.includes('финанс')) return '💰';
  if (n.includes('качеств')) return '✅';
  if (n.includes('мтс') || n.includes('заготов')) return '🚜';
  if (n.includes('элеват')) return '🏭';
  if (n.includes('строй') || n.includes('монтаж')) return '🏗️';
  return '💬';
}

function filterRooms(q) {
  const filtered = S.rooms.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  renderRooms(filtered);
}

function renderRooms(rooms) {
  const el = $('rms');
  const active = rooms.filter(r => !archivedRooms.has(r.id));
  const archived = rooms.filter(r => archivedRooms.has(r.id));
  if (!rooms.length) {
    el.innerHTML = S.isAdmin
      ? '<div style="padding:20px;text-align:center;color:var(--mt);font-size:13px">Чатов пока нет.<br>Нажмите <b>+ чат</b> чтобы создать.</div>'
      : '<div style="padding:20px;text-align:center;color:var(--mt);font-size:13px">Чатов пока нет.<br>Обратитесь к администратору.</div>';
    return;
  }
  el.innerHTML = '';
  updateBadge();
  const renderRoom = (r) => {
    const idx = S.rooms.indexOf(r);
    const av = roomAvatar(r.name);
    const isMuted = mutedRooms.has(r.id);
    const d = document.createElement('div');
    d.className = 'rm' + (S.currentRoom === idx ? ' active' : '');
    d.onclick = () => openRoom(idx);
    let pressTimer;
    const showCtx = (x, y) => showRoomCtxMenu(r.id, r.name, x, y);
    d.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e.clientX, e.clientY); });
    d.addEventListener('touchstart', e => { const t = e.touches[0]; pressTimer = setTimeout(() => showCtx(t.clientX, t.clientY), 500); }, { passive: true });
    d.addEventListener('touchend', () => clearTimeout(pressTimer));
    d.addEventListener('touchmove', () => clearTimeout(pressTimer));
    const tm = r.lastTs ? nt(r.lastTs) : '';
    d.innerHTML = '<div class="rm-av">' + av + '</div>' +
      '<div class="rm-inf"><div class="rm-nm">' + (isMuted ? '🔕 ' : '') + esc(r.name) + '</div><div class="rm-ls">' + esc((r.lastText || '').slice(0, 35)) + '</div></div>' +
      '<div class="rm-rt"><div class="rm-tm">' + tm + '</div>' +
      (r.unread ? '<div class="rm-bd">' + r.unread + '</div>' : '') + '</div>';
    el.appendChild(d);
  };
  active.forEach(renderRoom);
  if (archived.length) {
    const hdr = document.createElement('div');
    hdr.className = 'archive-lbl';
    hdr.textContent = 'Архив (' + archived.length + ')';
    hdr.style.cursor = 'pointer';
    hdr.onclick = () => {
      const wrap = hdr.nextElementSibling;
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
    };
    el.appendChild(hdr);
    const wrap = document.createElement('div');
    archived.forEach(r => { const old = el; el.appendChild = (n) => wrap.appendChild(n); renderRoom(r); el.appendChild = old.appendChild.bind(old); });
    el.appendChild(wrap);
  }
}

function showRoomCtxMenu(roomId, roomName, x, y) {
  closeRoomCtxMenu();
  const isArchived = archivedRooms.has(roomId);
  const isMuted = mutedRooms.has(roomId);
  const menu = document.createElement('div');
  menu.id = 'room-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:300;background:var(--pk);border:1px solid var(--gd);border-radius:12px;overflow:hidden;min-width:200px;box-shadow:0 4px 20px rgba(61,32,16,.2);left:' + Math.min(x, window.innerWidth - 210) + 'px;top:' + Math.min(y, window.innerHeight - 140) + 'px';
  const items = [
    { text: isArchived ? '📂 Разархивировать' : '📁 Архивировать', fn: () => archiveRoom(roomId) },
    { text: isMuted ? '🔔 Включить уведомления' : '🔕 Отключить уведомления', fn: () => toggleMute(roomId) },
    { text: '✓ Прочитать всё', fn: () => { const ri = S.rooms.findIndex(r => r.id === roomId); if (ri >= 0) { S.rooms[ri].unread = 0; renderRooms(S.rooms); } } }
  ];
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'rm-menu-item';
    d.textContent = it.text;
    d.onclick = () => { closeRoomCtxMenu(); it.fn(); };
    menu.appendChild(d);
  });
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeRoomCtxMenu, { once: true }), 10);
}
function closeRoomCtxMenu() {
  const m = document.getElementById('room-ctx-menu');
  if (m) m.remove();
}

// ===== ЧАТ =====
async function openRoom(i) {
  if (i === null || i === undefined || !S.rooms[i]) return;
  S.currentRoom = i;
  S.rooms[i].unread = 0;
  S.forwardContent = null;
  const fwdOvrl = $('ovrl-fwd-tmp');
  if (fwdOvrl) fwdOvrl.remove();
  renderRooms(S.rooms);
  const r = S.rooms[i];
  const av = roomAvatar(r.name);
  $('ct-av').textContent = av;
  $('ct-nm').textContent = r.name;
  $('ct-mb').textContent = r.memberCount + ' участников · нажмите для списка';
  $('no-chat').style.display = 'none';
  if (S.membersOpen) { S.membersOpen = false; $('mbrs-pnl').classList.remove('open'); }
  if (window.innerWidth < 700) {
    $('sb').classList.add('hidden');
    $('ct').classList.add('vis');
  }
  cancelReply(); cancelEdit();
  if (S.searchOpen) { S.searchOpen = false; $('search-bar').classList.remove('show'); $('search-inp').value = ''; searchMsgs(''); }
  await loadMessages(i);
  sendReadMarker(i);
  fetchMyPowerLevel(r);
  const msgsEl = $('msgs');
  if (msgsEl && !$('load-more-btn')) {
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.id = 'load-more-btn';
    btn.textContent = '⬆ Загрузить историю';
    btn.onclick = loadMoreMessages;
    msgsEl.insertBefore(btn, msgsEl.firstChild);
  }
}

function goBack() {
  $('sb').classList.remove('hidden');
  $('ct').classList.remove('vis');
  S.membersOpen = false;
  $('mbrs-pnl').classList.remove('open');
}

// ===== СООБЩЕНИЯ =====
async function loadMessages(i) {
  const r = S.rooms[i];
  try {
    const d = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/messages?limit=80&dir=b');
    r.events = (d.chunk || []).reverse();
    historyTokens[r.id] = d.end || null;
    if (i === S.currentRoom) renderMsgs(i);
  } catch (e) { console.error('loadMessages', e); }
}

async function sendReadMarker(roomIdx) {
  const r = S.rooms[roomIdx];
  if (!r || !r.events.length) return;
  const lastMsg = [...r.events].reverse().find(e => e.type === 'm.room.message');
  if (!lastMsg) return;
  try {
    const res = await api('POST', '/rooms/' + encodeURIComponent(r.id) + '/read_markers', {
      'm.fully_read': lastMsg.event_id, 'm.read': lastMsg.event_id
    });
    if (res._status === 405 || res._status === 404) {
      await api('POST', '/rooms/' + encodeURIComponent(r.id) + '/receipt/m.read/' + encodeURIComponent(lastMsg.event_id), {});
    }
  } catch {}
}

function renderMsgs(i, keepScroll = false) {
  const r = S.rooms[i];
  const el = $('msgs');
  el.innerHTML = '';
  if ($('load-more-btn') === null && S.currentRoom === i) {
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.id = 'load-more-btn';
    btn.textContent = historyTokens[r.id] === null ? '— Начало переписки —' : '⬆ Загрузить историю';
    btn.onclick = loadMoreMessages;
    if (historyTokens[r.id] === null) { btn.disabled = true; btn.style.cursor = 'default'; }
    el.appendChild(btn);
  }
  let lastDate = '';
  r.events.forEach(ev => {
    if (ev.type === 'm.room.member') {
      if (ev.content?.membership === 'join') {
        const nm = ev.content.displayname || ev.state_key.split(':')[0].replace('@', '');
        const d = document.createElement('div');
        d.className = 'sys-msg';
        d.textContent = nm + ' присоединился(-ась)';
        el.appendChild(d);
      }
      return;
    }
    if (ev.type === 'm.room.message' && ev.content?.msgtype === 'm.bad.encrypted') return;
    if (ev.type !== 'm.room.message') return;
    if (ev.content?.['m.relates_to']?.rel_type === 'm.replace') return;
    const evDate = nd(ev.origin_server_ts);
    if (evDate !== lastDate) {
      lastDate = evDate;
      const ds = document.createElement('div');
      ds.className = 'date-sep';
      ds.textContent = evDate;
      el.appendChild(ds);
    }
    const own = ev.sender === S.userId;
    const senderLogin = ev.sender.split(':')[0].replace('@', '');
    let actualContent = ev.content;
    const edited = r.events.find(e =>
      e.type === 'm.room.message' &&
      e.content?.['m.relates_to']?.rel_type === 'm.replace' &&
      e.content?.['m.relates_to']?.event_id === ev.event_id
    );
    if (edited) actualContent = edited.content?.['m.new_content'] || actualContent;
    const relatesTo = actualContent?.['m.relates_to'];
    let replyHtml = '';
    if (relatesTo?.['m.in_reply_to']) {
      const repliedId = relatesTo['m.in_reply_to'].event_id;
      const repliedEv = r.events.find(e => e.event_id === repliedId);
      if (repliedEv) {
        const repliedLogin = repliedEv.sender.split(':')[0].replace('@', '');
        const repliedText = repliedEv.content?.body || '';
        const preview = repliedText.replace(/^> .*\n*/gm, '').trim().slice(0, 60);
        replyHtml = '<div class="msg-reply" onclick="scrollToMsg(\'' + repliedId + '\')"><div class="msg-reply-nm">' + esc(repliedLogin) + '</div><div class="msg-reply-tx">' + esc(preview) + '</div></div>';
      }
    }
    let contentHtml = '';
    const msgtype = actualContent?.msgtype;
    if (msgtype === 'm.text') {
      let txt = actualContent.body || '';
      txt = txt.replace(/^> .*\n*/gm, '').trim();
      const txtDiv = document.createElement('div');
      txtDiv.className = 'msg-bbl';
      txtDiv.id = 'ev-' + ev.event_id;
      const myLogin = (S.userId || '').split(':')[0].replace('@', '');
      txtDiv.innerHTML = replyHtml + renderMentions(formatText(txt), myLogin) + (edited ? '<span class="msg-edited">(ред.)</span>' : '');
      if (/https?:\/\//.test(txt)) { setTimeout(() => renderLinkPreviews(txtDiv, txt), 100); }
      contentHtml = txtDiv.outerHTML;
    } else if (msgtype === 'm.image') {
      const mxcUrl = actualContent?.url || '';
      const httpUrl = mxcToHttp(mxcUrl);
      contentHtml = '<div class="msg-img" onclick="openImgViewer(\'' + httpUrl + '\')"><img src="' + httpUrl + '" loading="lazy" alt="фото"></div>';
    } else if (msgtype === 'm.file' || msgtype === 'm.video' || msgtype === 'm.audio') {
      const mxcUrl = actualContent?.url || '';
      const httpUrl = mxcToHttp(mxcUrl);
      const sz = actualContent?.info?.size ? fmtSize(actualContent.info.size) : '';
      const icon = msgtype === 'm.video' ? '🎥' : msgtype === 'm.audio' ? '🎵' : '📄';
      contentHtml = '<div class="msg-file" onclick="downloadFile(\'' + httpUrl + '\',\'' + esc(actualContent?.body||'файл') + '\')"><div class="f-ico"><span style="font-size:16px">' + icon + '</span></div><div class="f-inf"><div class="f-nm">' + esc(actualContent?.body || 'файл') + '</div><div class="f-sz">' + sz + '</div></div></div>';
    } else { return; }
    const reactions = {};
    r.events.forEach(e => {
      if (e.type === 'm.reaction' && e.content?.['m.relates_to']?.rel_type === 'm.annotation' && e.content?.['m.relates_to']?.event_id === ev.event_id) {
        const key = e.content['m.relates_to'].key;
        if (!reactions[key]) reactions[key] = { count: 0, mine: false };
        reactions[key].count++;
        if (e.sender === S.userId) reactions[key].mine = true;
      }
    });
    const reactHtml = Object.keys(reactions).length ? '<div class="reactions">' + Object.entries(reactions).map(([k, v]) => '<div class="react' + (v.mine ? ' mine' : '') + '" onclick="sendReaction(\'' + ev.event_id + '\',\'' + k + '\')">' + k + ' <span class="react-cnt">' + v.count + '</span></div>').join('') + '</div>' : '';
    const avBg = own ? 'var(--br)' : 'var(--pd)';
    const avCl = own ? 'var(--pk)' : 'var(--br)';
    const tm = nt(ev.origin_server_ts);
    const d = document.createElement('div');
    d.className = 'msg' + (own ? ' own' : '');
    d.dataset.eventId = ev.event_id;
    d.innerHTML = '<div class="msg-av" style="background:' + avBg + ';color:' + avCl + '">' + ini(senderLogin) + '</div>' +
      '<div class="msg-body"><div class="msg-nm">' + (own ? '' : esc(senderLogin)) + '</div>' +
      contentHtml + reactHtml +
      '<div class="msg-ft"><span class="msg-tm">' + tm + '</span>' + (own ? '<span class="msg-ok">✓✓</span>' : '') + '</div>' +
      '<div class="msg-acts" id="acts-' + ev.event_id + '">' +
        '<button class="ma-btn" onclick="setReply(\'' + ev.event_id + '\')">↩ Ответить</button>' +
        '<button class="ma-btn" onclick="toggleReactPicker(\'' + ev.event_id + '\')">😊 Реакция</button>' +
        (own && msgtype === 'm.text' ? '<button class="ma-btn" onclick="startEdit(\'' + ev.event_id + '\')">✏️ Изменить</button>' : '') +
        '<button class="ma-btn" onclick="forwardMsg(\'' + ev.event_id + '\')">➤ Переслать</button>' +
        (own ? '<button class="ma-btn del" onclick="deleteMsg(\'' + ev.event_id + '\')">🗑 Удалить</button>' : '') +
        (S.isAdmin ? '<button class="ma-btn" onclick="pinMsg(\'' + ev.event_id + '\')">📌 Закрепить</button>' : '') +
        (edited ? '<button class="ma-btn" onclick="showEditHistory(\'' + ev.event_id + '\')">📋 История</button>' : '') +
      '</div>' +
      '<div class="react-picker" id="rp-' + ev.event_id + '">' +
        ['👍','❤️','😂','😮','😢','👏'].map(e => '<button class="rp-btn" onclick="sendReaction(\'' + ev.event_id + '\',\'' + e + '\')">' + e + '</button>').join('') +
      '</div></div>';
    let pressTimer;
    d.addEventListener('touchstart', () => { pressTimer = setTimeout(() => showMsgActs(ev.event_id), 500); }, { passive: true });
    d.addEventListener('touchend', () => clearTimeout(pressTimer));
    d.addEventListener('touchmove', () => clearTimeout(pressTimer));
    d.addEventListener('contextmenu', e => { e.preventDefault(); showMsgActs(ev.event_id); });
    initSwipe(d, ev.event_id);
    el.appendChild(d);
    if (own && S.currentRoom !== null) {
      const roomId = S.rooms[S.currentRoom]?.id;
      if (roomId) addReadReceipts(d, ev.event_id, roomId);
    }
  });
  if (!keepScroll) scrollMsgs();
}

function mxcToHttp(mxc) {
  if (!mxc || !mxc.startsWith('mxc://')) return mxc;
  return CFG.server + '/_matrix/media/v3/download/' + mxc.replace('mxc://', '');
}

function scrollMsgs() { setTimeout(() => { const e = $('msgs'); if (e) e.scrollTop = e.scrollHeight; }, 60); }

function scrollToMsg(eventId) {
  const el = document.querySelector('[data-event-id="' + eventId + '"]');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(196,168,130,.3)'; setTimeout(() => el.style.background = '', 1500); }
}

// ===== МЕНЮ ДЕЙСТВИЙ =====
let activeActs = null;
function showMsgActs(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); }
  const el = document.getElementById('acts-' + eventId);
  if (el) { el.classList.add('show'); activeActs = eventId; }
}
document.addEventListener('click', e => {
  if (activeActs && !e.target.closest('.msg-acts') && !e.target.closest('.msg-bbl') && !e.target.closest('.msg-file')) {
    document.getElementById('acts-' + activeActs)?.classList.remove('show');
    activeActs = null;
  }
  if (!e.target.closest('.att-wrap')) $('att-menu').classList.remove('open');
});

// ===== ОТВЕТ =====
function setReply(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  const r = S.rooms[S.currentRoom];
  const ev = r?.events.find(e => e.event_id === eventId);
  if (!ev) return;
  S.replyTo = eventId;
  cancelEdit();
  const senderLogin = ev.sender.split(':')[0].replace('@', '');
  const txt = ev.content?.body || '📎 Вложение';
  $('rp-nm').textContent = senderLogin;
  $('rp-tx').textContent = txt.replace(/^> .*\n*/gm, '').trim().slice(0, 80);
  $('reply-bar').classList.add('show');
  $('msg-inp').focus();
}
function cancelReply() { S.replyTo = null; $('reply-bar').classList.remove('show'); }

// ===== РЕДАКТИРОВАНИЕ =====
function startEdit(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  const r = S.rooms[S.currentRoom];
  const ev = r?.events.find(e => e.event_id === eventId);
  if (!ev) return;
  S.editEvent = ev;
  cancelReply();
  const edited = r.events.find(e => e.type === 'm.room.message' && e.content?.['m.relates_to']?.rel_type === 'm.replace' && e.content?.['m.relates_to']?.event_id === eventId);
  let txt = edited ? (edited.content?.['m.new_content']?.body || ev.content?.body || '') : (ev.content?.body || '');
  txt = txt.replace(/^> .*\n*/gm, '').trim();
  $('edit-tx').textContent = 'Редактирование: ' + txt.slice(0, 50);
  $('edit-bar').classList.add('show');
  $('msg-inp').value = txt;
  onInp($('msg-inp'));
  $('msg-inp').focus();
}
function cancelEdit() { S.editEvent = null; $('edit-bar').classList.remove('show'); $('msg-inp').value = ''; onInp($('msg-inp')); }

// ===== УДАЛЕНИЕ =====
async function deleteMsg(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  if (!confirm('Удалить это сообщение?')) return;
  const r = S.rooms[S.currentRoom];
  try {
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/redact/' + encodeURIComponent(eventId) + '/' + txn(), { reason: 'Удалено пользователем' });
    showNotif('Сообщение удалено');
    await loadMessages(S.currentRoom);
  } catch { showNotif('Ошибка удаления'); }
}

// ===== РЕАКЦИИ =====
function toggleReactPicker(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  document.querySelectorAll('.react-picker.show').forEach(el => { if (el.id !== 'rp-' + eventId) el.classList.remove('show'); });
  document.getElementById('rp-' + eventId)?.classList.toggle('show');
}
async function sendReaction(eventId, emoji) {
  document.getElementById('rp-' + eventId)?.classList.remove('show');
  const r = S.rooms[S.currentRoom]; if (!r) return;
  try {
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.reaction/' + txn(), { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key: emoji } });
    await loadMessages(S.currentRoom);
  } catch { showNotif('Ошибка реакции'); }
}

// ===== ПЕРЕСЫЛКА =====
function forwardMsg(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  const r = S.rooms[S.currentRoom];
  const ev = r?.events.find(e => e.event_id === eventId);
  if (!ev) return;
  const txt = ev.content?.body || (ev.content?.msgtype === 'm.image' ? '🖼 Фото' : '📄 Файл');
  S.forwardContent = ev.content;
  const items = S.rooms.map((rm, i) => i !== S.currentRoom ? '<div class="usr-it" onclick="doForward(' + i + ')" style="cursor:pointer"><div class="usr-it-av" style="font-size:16px">' + roomAvatar(rm.name) + '</div><div class="usr-it-inf"><div class="usr-it-nm">' + esc(rm.name) + '</div></div></div>' : '').join('');
  const ovrl = document.createElement('div');
  ovrl.className = 'ovrl open'; ovrl.id = 'ovrl-fwd-tmp';
  ovrl.innerHTML = '<div class="mdl"><h3>Переслать в чат</h3><div class="mdl-hint">' + esc(txt.slice(0,60)) + '</div><div class="usr-list" style="max-height:280px;overflow-y:auto">' + items + '</div><div class="mdl-btns" style="margin-top:10px"><button class="btn-no" onclick="document.getElementById(\'ovrl-fwd-tmp\').remove()">Отмена</button></div></div>';
  ovrl.addEventListener('click', e => { if (e.target === ovrl) ovrl.remove(); });
  document.body.appendChild(ovrl);
}
async function doForward(roomIdx) {
  const fwdOvrl = $('ovrl-fwd-tmp'); if (fwdOvrl) fwdOvrl.remove();
  const r = S.rooms[roomIdx]; if (!r || !S.forwardContent) return;
  try {
    const body = Object.assign({}, S.forwardContent); delete body['m.relates_to'];
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), body);
    showNotif('✅ Переслано в ' + r.name); S.forwardContent = null;
  } catch { showNotif('Ошибка пересылки'); }
}

// ===== ЗАКРЕПЛЕНИЕ =====
async function pinMsg(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  const r = S.rooms[S.currentRoom]; if (!r) return;
  try {
    const state = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/state/m.room.pinned_events/');
    const pinned = state.pinned || [];
    if (!pinned.includes(eventId)) pinned.push(eventId);
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/state/m.room.pinned_events/', { pinned });
    showNotif('📌 Сообщение закреплено');
  } catch { showNotif('Ошибка закрепления'); }
}

async function showPinned() {
  const r = S.rooms[S.currentRoom]; if (!r) return;
  try {
    const state = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/state/m.room.pinned_events/');
    const pinned = state.pinned || [];
    const el = $('pinned-list');
    if (!pinned.length) { el.innerHTML = '<p style="color:var(--mt);text-align:center;padding:16px;font-size:13px">Нет закреплённых сообщений</p>'; }
    else {
      el.innerHTML = '<p style="color:var(--mt);text-align:center;padding:8px;font-size:12px">Загружаем...</p>';
      openOvrl('pinned');
      el.innerHTML = '';
      for (const id of pinned) {
        let ev = r.events.find(e => e.event_id === id);
        if (!ev) { try { const fetched = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/event/' + encodeURIComponent(id)); if (!fetched.errcode) ev = fetched; } catch {} }
        const d = document.createElement('div');
        d.style.cssText = 'padding:10px;border-bottom:1px solid var(--gd);cursor:pointer';
        if (ev) {
          d.innerHTML = '<div style="font-size:11px;color:var(--mt)">' + ev.sender.split(':')[0].replace('@','') + '</div><div style="font-size:13px;color:var(--br)">' + esc((ev.content?.body||'').slice(0,100)) + '</div>';
          d.onclick = () => { closeOvrl('pinned'); scrollToMsg(id); };
        } else { d.innerHTML = '<div style="font-size:12px;color:var(--mt);font-style:italic">Сообщение недоступно</div>'; }
        el.appendChild(d);
      }
      return;
    }
    openOvrl('pinned');
  } catch { showNotif('Нет закреплённых'); }
}

// ===== ПОИСК =====
function toggleSearch() {
  S.searchOpen = !S.searchOpen;
  $('search-bar').classList.toggle('show', S.searchOpen);
  if (S.searchOpen) $('search-inp').focus();
  else { $('search-inp').value = ''; searchMsgs(''); }
}

function searchMsgs(q) {
  document.querySelectorAll('.search-hl').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  if (!q) { $('search-cnt').textContent = ''; return; }
  let count = 0;
  const lq = q.toLowerCase();
  $('msgs').querySelectorAll('.msg-bbl').forEach(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const matches = [];
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.toLowerCase().indexOf(lq);
      if (idx >= 0) matches.push({ node, idx });
    }
    if (matches.length) count++;
    matches.forEach(({ node, idx }) => {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      const mark = document.createElement('mark');
      mark.className = 'search-hl';
      range.surroundContents(mark);
    });
  });
  $('search-cnt').textContent = count + ' найдено';
}

// ===== УЧАСТНИКИ =====
function toggleMembers() {
  if (S.currentRoom === null) return;
  S.membersOpen = !S.membersOpen;
  $('mbrs-pnl').classList.toggle('open', S.membersOpen);
  if (S.membersOpen) loadMembers();
}

async function loadMembers() {
  const r = S.rooms[S.currentRoom]; if (!r) return;
  try {
    const d = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/members');
    const members = (d.chunk || []).filter(e => e.content?.membership === 'join' || e.content?.membership === 'invite');
    const joined = members.filter(e => e.content?.membership === 'join');
    r.memberCount = joined.length;
    $('mbrs-ttl').textContent = 'Участники (' + joined.length + ')';
    $('ct-mb').textContent = joined.length + ' участников · нажмите для списка';
    const el = $('mbrs-list'); el.innerHTML = '';
    members.forEach(m => {
      const login = m.state_key.split(':')[0].replace('@', '');
      const name = m.content?.displayname || login;
      const isMe = m.state_key === S.userId;
      const isPending = m.content?.membership === 'invite';
      const d = document.createElement('div'); d.className = 'mbr';
      d.innerHTML = '<div class="mbr-av" style="' + (isPending ? 'opacity:.5' : '') + '">' + ini(login) + '</div>' +
        '<div class="mbr-nm">' + esc(name) + (isPending ? ' <span style="font-size:10px;color:var(--mt)">(приглашён)</span>' : '') + getPresenceDot(m.state_key) + '</div>' +
        (isMe ? '<span class="mbr-you">вы</span>' : (canKickInRoom(r) && !isPending ? '<button class="mbr-kick">Удалить</button>' : ''));
      if (!isMe && canKickInRoom(r) && !isPending) {
        const btn = d.querySelector('.mbr-kick');
        if (btn) btn.onclick = () => kickMember(r.id, m.state_key, name);
      }
      el.appendChild(d);
    });
  } catch (e) { console.error('loadMembers', e); }
}

async function kickMember(roomId, userId, name) {
  if (!confirm('Удалить ' + name + ' из этого чата?')) return;
  try {
    await api('POST', '/rooms/' + encodeURIComponent(roomId) + '/kick', { user_id: userId, reason: 'Удалён администратором' });
    logAudit('Кик из чата', name);
    showNotif(name + ' удалён из чата');
    await loadMembers();
  } catch { showNotif('Ошибка удаления из чата'); }
}

// ===== ПРИГЛАШЕНИЕ =====
async function showInvite() {
  $('inv-uid').value = ''; $('inv-ok').disabled = true; $('inv-srch').value = '';
  $('inv-list').innerHTML = '<div style="padding:12px;text-align:center;color:var(--mt);font-size:13px">Загружаем...</div>';
  openOvrl('invite');
  try {
    const r = S.rooms[S.currentRoom];
    const [usersD, membersD] = await Promise.all([
      adminApi('/v2/users?limit=200&guests=false&deactivated=false'),
      api('GET', '/rooms/' + encodeURIComponent(r.id) + '/members')
    ]);
    const memberIds = new Set((membersD.chunk || []).filter(m => m.content?.membership === 'join').map(m => m.state_key));
    S.allUsers = (usersD.users || []).filter(u => (u.user_id || u.name) !== S.userId && !memberIds.has(u.user_id || u.name) && !u.deactivated);
    renderInvList(S.allUsers);
  } catch {
    $('inv-list').innerHTML = '<div style="padding:12px"><div style="font-size:12px;color:var(--mt);margin-bottom:8px">Введите логин сотрудника вручную:</div><input id="inv-manual" type="text" placeholder="логин" autocapitalize="none" autocorrect="off" spellcheck="false" style="width:100%;border:1.5px solid var(--gd);border-radius:8px;padding:9px 12px;font-size:15px;background:var(--pm);color:var(--br);outline:none" oninput="var v=this.value.trim().toLowerCase();var srv=S.userId?S.userId.split(\':\')[1]:CFG.serverName;var uid=v?(\'@\'+v+\':\'+srv):\'\';document.getElementById(\'inv-uid\').value=uid;document.getElementById(\'inv-ok\').disabled=!v;"></div>';
  }
}
function renderInvList(users) {
  const el = $('inv-list');
  if (!users.length) { el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--mt);font-size:13px">Нет доступных сотрудников</div>'; return; }
  el.innerHTML = '';
  users.forEach(u => {
    const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '');
    const name = u.displayname || login;
    const d = document.createElement('div'); d.className = 'usr-it';
    d.innerHTML = '<div class="usr-it-av">' + ini(login) + '</div><div class="usr-it-inf"><div class="usr-it-nm">' + esc(name) + '</div><div class="usr-it-lg">' + esc(login) + '</div></div>';
    d.onclick = () => {
      el.querySelectorAll('.usr-it').forEach(x => x.classList.remove('sel'));
      d.classList.add('sel');
      $('inv-uid').value = u.user_id || u.name;
      $('inv-ok').disabled = false;
    };
    el.appendChild(d);
  });
}
function filterInvList(q) {
  if (!S.allUsers.length) return;
  renderInvList(S.allUsers.filter(u => {
    const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '').toLowerCase();
    const name = (u.displayname || '').toLowerCase();
    return login.includes(q.toLowerCase()) || name.includes(q.toLowerCase());
  }));
  $('inv-uid').value = ''; $('inv-ok').disabled = true;
}
async function doInvite() {
  const uid = $('inv-uid').value.trim();
  if (!uid) { showNotif('Выберите сотрудника'); return; }
  const r = S.rooms[S.currentRoom];
  const login = uid.split(':')[0].replace('@', '');
  try {
    await api('POST', '/rooms/' + encodeURIComponent(r.id) + '/invite', { user_id: uid });
    closeOvrl('invite');
    showNotif('✅ ' + login + ' приглашён в чат');
    await loadMembers(); await loadRooms();
  } catch { showNotif('Ошибка приглашения'); }
}

// ===== ССЫЛКА-ПРИГЛАШЕНИЕ =====
function showRoomLink() {
  if (S.currentRoom === null) { showNotif('Сначала откройте чат'); return; }
  const r = S.rooms[S.currentRoom];
  const link = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(r.id);
  $('rl-val').value = link;
  openOvrl('roomlink');
}
function copyRoomLink() {
  const val = $('rl-val').value;
  navigator.clipboard.writeText(val)
    .then(() => { showNotif('✅ Ссылка скопирована'); closeOvrl('roomlink'); })
    .catch(() => { $('rl-val').select(); document.execCommand('copy'); showNotif('✅ Ссылка скопирована'); closeOvrl('roomlink'); });
}

// ===== СОЗДАНИЕ КОМНАТЫ =====
async function createRoom() {
  const name = $('new-rm-nm').value.trim(); if (!name) return;
  try {
    await api('POST', '/createRoom', { name, preset: 'private_chat', visibility: 'private' });
    closeOvrl('create'); $('new-rm-nm').value = '';
    await loadRooms(); showNotif('✅ Чат "' + name + '" создан');
  } catch { showNotif('Ошибка создания чата'); }
}

// ===== УПРАВЛЕНИЕ ЧАТАМИ =====
function resetChatPanel() {
  S.currentRoom = null;
  $('ct-nm').textContent = 'Выберите чат'; $('ct-mb').textContent = ''; $('ct-av').textContent = '';
  const nochat = $('no-chat'); if (nochat) nochat.style.display = '';
  const msgs = $('msgs'); if (msgs) msgs.innerHTML = '';
  const lmb = $('load-more-btn'); if (lmb) lmb.remove();
  S.membersOpen = false; $('mbrs-pnl').classList.remove('open');
  if (window.innerWidth < 700) { $('sb').classList.remove('hidden'); $('ct').classList.remove('vis'); }
  closeRoomMenu();
}
async function leaveRoom(roomId, roomName) {
  if (!confirm('Покинуть чат "' + roomName + '"?')) return;
  try {
    await api('POST', '/rooms/' + encodeURIComponent(roomId) + '/leave', {});
    S.rooms = S.rooms.filter(r => r.id !== roomId);
    resetChatPanel(); renderRooms(S.rooms);
    showNotif('Вы покинули чат "' + roomName + '"');
    setTimeout(() => loadRooms(), 2000);
  } catch { showNotif('Ошибка'); }
}
async function deleteRoom(roomId, roomName) {
  if (!confirm('Удалить чат "' + roomName + '"?\nВсе сообщения будут удалены.')) return;
  try {
    const result = await adminDelete('/v2/rooms/' + encodeURIComponent(roomId), { message: 'Чат удалён', block: false, purge: true });
    if (!result._ok) {
      const result2 = await adminPost('/v1/rooms/' + encodeURIComponent(roomId) + '/delete', { message: 'Чат удалён', block: false, purge: true });
      if (!result2._ok) throw new Error(result2.error || 'Код ' + result2._status);
    }
    S.rooms = S.rooms.filter(r => r.id !== roomId);
    resetChatPanel(); renderRooms(S.rooms);
    showNotif('✅ Чат "' + roomName + '" удалён');
    setTimeout(() => loadRooms(), 2000);
  } catch (e) { showNotif('Ошибка удаления: ' + (e.message || '')); }
}
async function renameRoom() {
  const r = S.rooms[S.currentRoom]; if (!r) return;
  const newName = prompt('Новое название чата:', r.name);
  if (!newName || newName.trim() === '' || newName.trim() === r.name) return;
  try {
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/state/m.room.name/', { name: newName.trim() });
    r.name = newName.trim(); $('ct-nm').textContent = r.name;
    renderRooms(S.rooms); showNotif('✅ Чат переименован');
  } catch { showNotif('Ошибка переименования'); }
}

// ===== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ =====
let allUsersCache = [];
async function showUsrMgmt() {
  openOvrl('users');
  $('umgmt-list').innerHTML = '<div style="padding:16px;text-align:center;color:var(--mt);font-size:13px">Загружаем...</div>';
  try {
    const d = await adminApi('/v2/users?limit=200&guests=false');
    allUsersCache = d.users || [];
    renderUmgmt(allUsersCache);
  } catch { $('umgmt-list').innerHTML = '<div style="padding:16px;text-align:center;color:var(--mt);font-size:13px">Ошибка загрузки.</div>'; }
}
function renderUmgmt(users) {
  const el = $('umgmt-list'); el.innerHTML = '';
  users.forEach(u => {
    const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '');
    const name = u.displayname || login;
    const isMe = u.user_id === S.userId;
    const deact = u.deactivated;
    const d = document.createElement('div');
    d.className = 'usr-mgmt-it' + (deact ? ' deact' : '');
    d.innerHTML = '<div class="usr-it-av" style="background:' + (deact?'#aaa':'var(--br)') + '">' + ini(login) + '</div>' +
      '<div class="usr-it-inf"><div class="usr-it-nm">' + esc(name) + (u.admin ? ' 👑' : '') + '</div><div class="usr-it-lg">' + esc(login) + (deact ? ' · деактивирован' : '') + '</div></div>' +
      (!isMe && !deact ? '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="umgmt-reset-btn" style="background:none;border:1px solid var(--bl);border-radius:7px;padding:3px 8px;font-size:10px;color:var(--bl);cursor:pointer;white-space:nowrap">Пароль</button><button class="umgmt-kick-btn" style="background:none;border:1px solid var(--gd);border-radius:7px;padding:3px 8px;font-size:10px;color:var(--mt);cursor:pointer;white-space:nowrap">Из чатов</button><button class="umgmt-fire-btn" style="background:none;border:1px solid #F5C4C4;border-radius:7px;padding:3px 8px;font-size:10px;color:var(--rd);cursor:pointer;white-space:nowrap">Уволить</button></div>' : '') +
      (!isMe && deact ? '<button class="umgmt-restore-btn" style="background:none;border:1px solid var(--gd);border-radius:7px;padding:4px 9px;font-size:11px;color:var(--mt);cursor:pointer;flex-shrink:0;white-space:nowrap">Восстановить</button>' : '');
    if (!isMe && !deact) {
      const btn = d.querySelector('.umgmt-fire-btn'); if (btn) btn.onclick = () => deactivateUser(u.user_id, name);
      const kickBtn = d.querySelector('.umgmt-kick-btn'); if (kickBtn) kickBtn.onclick = () => kickFromAllRooms(u.user_id, name);
      const resetBtn = d.querySelector('.umgmt-reset-btn'); if (resetBtn) resetBtn.onclick = () => { closeOvrl('users'); openResetPass(u.user_id, name); };
    }
    if (!isMe && deact) { const btn = d.querySelector('.umgmt-restore-btn'); if (btn) btn.onclick = () => activateUser(u.user_id, name); }
    el.appendChild(d);
  });
}
function filterUmgmt(q) {
  renderUmgmt(allUsersCache.filter(u => {
    const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '').toLowerCase();
    const name = (u.displayname || '').toLowerCase();
    return login.includes(q.toLowerCase()) || name.includes(q.toLowerCase());
  }));
}
async function deactivateUser(userId, name) {
  if (!confirm('Уволить ' + name + '?')) return;
  try { await adminPost('/v1/deactivate/' + encodeURIComponent(userId), { erase: false }); logAudit('Увольнение', name); showNotif('✅ ' + name + ' деактивирован'); await showUsrMgmt(); } catch { showNotif('Ошибка деактивации'); }
}
async function kickFromAllRooms(userId, name) {
  if (!confirm('Удалить ' + name + ' из всех чатов?')) return;
  try {
    const d = await adminApi('/v1/users/' + encodeURIComponent(userId) + '/joined_rooms');
    const rooms = d.joined_rooms || [];
    if (!rooms.length) { showNotif(name + ' не состоит ни в одном чате'); return; }
    let kicked = 0, errors = 0;
    for (const roomId of rooms) { try { await api('POST', '/rooms/' + encodeURIComponent(roomId) + '/kick', { user_id: userId, reason: 'Удалён администратором' }); kicked++; } catch { errors++; } }
    showNotif('✅ ' + name + ' удалён из ' + kicked + ' чатов' + (errors ? ', ошибок: ' + errors : ''));
    await showUsrMgmt();
    if (S.currentRoom !== null) await loadMembers();
  } catch { showNotif('Ошибка'); }
}
async function activateUser(userId, name) {
  if (!confirm('Восстановить доступ для ' + name + '?')) return;
  try { await adminPut('/v2/users/' + encodeURIComponent(userId), { deactivated: false }); showNotif('✅ ' + name + ' восстановлен'); await showUsrMgmt(); } catch { showNotif('Ошибка восстановления'); }
}

// ===== ОТПРАВКА =====
function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }

async function sendMsg() {
  if (S.currentRoom === null) return;
  const r = S.rooms[S.currentRoom];
  const txt = $('msg-inp').value.trim();
  if (!txt && !S.pendingAtt) return;
  const savedTxt = $('msg-inp').value;
  const savedAtt = S.pendingAtt;
  $('msg-inp').value = ''; onInp($('msg-inp'));
  const sndBtn = $('snd-btn'); sndBtn.disabled = true; sndBtn.style.opacity = '0.5';
  if (emojiPickerOpen) { emojiPickerOpen = false; $('emoji-picker').classList.remove('open'); }
  try {
    if (S.pendingAtt) {
      const att = S.pendingAtt; clearAtt();
      const uploadR = await fetch(CFG.server + '/_matrix/media/v3/upload?filename=' + encodeURIComponent(att.name), { method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token, 'Content-Type': att.mimeType }, body: att.data });
      const uploadD = await uploadR.json();
      if (!uploadD.content_uri) throw new Error('Ошибка загрузки файла');
      const msgtype = att.isImage ? 'm.image' : att.isVideo ? 'm.video' : 'm.file';
      await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), { msgtype, body: att.name, url: uploadD.content_uri, info: { mimetype: att.mimeType, size: att.size } });
    }
    if (txt) {
      if (S.editEvent) {
        const ev = S.editEvent; cancelEdit();
        await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), { msgtype: 'm.text', body: '* ' + txt, 'm.relates_to': { rel_type: 'm.replace', event_id: ev.event_id }, 'm.new_content': { msgtype: 'm.text', body: txt } });
      } else if (S.replyTo) {
        const repliedEv = r.events.find(e => e.event_id === S.replyTo);
        const repliedText = repliedEv?.content?.body || '';
        const repliedLogin = repliedEv?.sender?.split(':')[0].replace('@', '') || '';
        const replyId = S.replyTo; cancelReply();
        await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), { msgtype: 'm.text', body: '> <' + repliedLogin + '> ' + repliedText + '\n\n' + txt, format: 'org.matrix.custom.html', formatted_body: '<mx-reply><blockquote><em>' + esc(repliedLogin) + '</em><br>' + esc(repliedText) + '</blockquote></mx-reply>' + esc(txt), 'm.relates_to': { 'm.in_reply_to': { event_id: replyId } } });
      } else {
        await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), { msgtype: 'm.text', body: txt });
      }
    }
    await loadMessages(S.currentRoom);
  } catch (e) {
    if (!navigator.onLine && savedTxt && !S.pendingAtt) {
      const r = S.rooms[S.currentRoom];
      if (r) {
        await enqueueMsg(r.id, { msgtype: 'm.text', body: savedTxt }).catch(() => {});
        showNotif('Нет сети — сообщение в очереди');
      }
    } else {
      $('msg-inp').value = savedTxt; onInp($('msg-inp'));
      if (savedAtt) S.pendingAtt = savedAtt;
      showNotif('Ошибка отправки');
    }
  } finally { sndBtn.disabled = false; sndBtn.style.opacity = ''; updateSendBtn(); }
}

// ===== ФАЙЛЫ =====
function toggleAtt() { $('att-menu').classList.toggle('open'); }
function fileChosen(e, type) {
  $('att-menu').classList.remove('open');
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 50 * 1024 * 1024) { showNotif('Файл слишком большой — максимум 50 МБ'); e.target.value = ''; return; }
  const isImage = type === 'img' && file.type.startsWith('image/');
  const isVideo = type === 'img' && file.type.startsWith('video/');
  const reader = new FileReader();
  reader.onload = ev => {
    S.pendingAtt = { name: file.name, mimeType: file.type, size: file.size, data: ev.target.result, isImage, isVideo };
    if (isImage) { $('att-ico').innerHTML = '<img src="' + URL.createObjectURL(file) + '" class="att-thumb">'; }
    else { $('att-ico').innerHTML = '<div class="att-doc-ico"><span style="font-size:16px">' + (isVideo ? '🎥' : '📄') + '</span></div>'; }
    $('att-nm').textContent = file.name;
    $('att-prev').classList.add('show'); updateSendBtn();
  };
  reader.readAsArrayBuffer(file); e.target.value = '';
}
function clearAtt() { S.pendingAtt = null; $('att-prev').classList.remove('show'); updateSendBtn(); }

// ===== ПРОСМОТР ФОТО =====
function openImgViewer(url) { $('img-viewer-img').src = url; $('img-viewer').classList.add('open'); }
function closeImgViewer() { $('img-viewer').classList.remove('open'); $('img-viewer-img').src = ''; }
$('img-viewer').addEventListener('click', e => { if (e.target === $('img-viewer')) closeImgViewer(); });
function downloadFile(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// ===== SYNC =====
async function startSync() {
  try {
    const d = await api('GET', '/sync?timeout=0&filter=' + encodeURIComponent(JSON.stringify({ room: { timeline: { limit: 1 } } })));
    S.syncToken = d.next_batch;
  } catch {}
  syncLoop();
}

async function syncLoop() {
  if (!S.token) return;
  try {
    const url = '/sync?timeout=8000' + (S.syncToken ? '&since=' + S.syncToken : '');
    const d = await api('GET', url);
    if (d._status === 401 || d.errcode === 'M_UNKNOWN_TOKEN') {
      showNotif('Сессия истекла — войдите снова');
      localStorage.removeItem('tg_s'); showAuth(); return;
    }
    if (!d.next_batch) { setTimeout(syncLoop, 3000); return; }
    S.syncToken = d.next_batch;
    let needReload = false;
    for (const [roomId, data] of Object.entries(d.rooms?.join || {})) {
      if (data.ephemeral?.events) { handleTypingEvent(roomId, data.ephemeral.events); processReceipts(roomId, data.ephemeral.events); }
    }
    if (d.presence?.events) processPresence(d.presence.events);
    for (const [roomId, data] of Object.entries(d.rooms?.join || {})) {
      const events = data.timeline?.events || [];
      const ri = S.rooms.findIndex(r => r.id === roomId);
      if (ri === -1) { needReload = true; continue; }
      const newMsgs = events.filter(e => e.type === 'm.room.message' && e.sender !== S.userId);
      if (newMsgs.length > 0) {
        if (ri === S.currentRoom) { await loadMessages(ri); }
        else {
          S.rooms[ri].unread = (S.rooms[ri].unread || 0) + newMsgs.length;
          const last = newMsgs[newMsgs.length - 1];
          const txt = last.content?.msgtype === 'm.text' ? last.content.body : '📎 Вложение';
          S.rooms[ri].lastText = txt; S.rooms[ri].lastTs = last.origin_server_ts;
          if (!mutedRooms.has(roomId)) showNotif(S.rooms[ri].name + ': ' + txt.slice(0, 50));
          if (Notification.permission === 'granted' && document.hidden && !mutedRooms.has(roomId)) {
            new Notification('ТОП ГЕН · ' + S.rooms[ri].name, { body: txt.slice(0, 100), icon: 'icons/icon-192.png' });
          }
          renderRooms(S.rooms);
        }
      }
    }
    if (needReload) await loadRooms();
    if (S.currentRoom !== null) {
      const rId = S.rooms[S.currentRoom]?.id;
      if (rId && d.rooms?.join?.[rId]) loadReadReceipts(rId);
    }
  } catch {}
  if (S.token) setTimeout(syncLoop, 1000);
}

if ('Notification' in window && Notification.permission === 'default') { setTimeout(() => Notification.requestPermission(), 3000); }
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }

// ===== МОДАЛКИ =====
function openOvrl(id) { $('ovrl-' + id).classList.add('open'); }
function closeOvrl(id) { $('ovrl-' + id).classList.remove('open'); }
document.querySelectorAll('.ovrl').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
$('new-rm-nm').addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });

// ===== TYPING =====
let typingTimer = null, isTyping = false;
async function sendTyping() {
  if (S.currentRoom === null) return;
  const r = S.rooms[S.currentRoom];
  if (!isTyping) { isTyping = true; try { await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/typing/' + encodeURIComponent(S.userId), { typing: true, timeout: 4000 }); } catch {} }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(async () => { isTyping = false; try { await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/typing/' + encodeURIComponent(S.userId), { typing: false }); } catch {} }, 3000);
}
function handleTypingEvent(roomId, events) {
  if (!events) return;
  const ri = S.rooms.findIndex(r => r.id === roomId);
  if (ri !== S.currentRoom) return;
  const typingUsers = events.filter(e => e.type === 'm.typing').flatMap(e => e.content?.user_ids || []).filter(u => u !== S.userId);
  const ind = $('typing-ind');
  if (typingUsers.length > 0) {
    const names = typingUsers.map(u => u.split(':')[0].replace('@', '')).join(', ');
    ind.innerHTML = names + ' печатает <span class="typing-dots"><span></span><span></span><span></span></span>';
    ind.classList.add('show');
  } else { ind.classList.remove('show'); }
}

// ===== LINK PREVIEW =====
const linkPreviewCache = {};
async function fetchLinkPreview(url) {
  if (linkPreviewCache[url] !== undefined) return linkPreviewCache[url];
  linkPreviewCache[url] = null;
  try {
    const r = await fetch(CFG.server + '/_matrix/media/v3/preview_url?url=' + encodeURIComponent(url) + '&ts=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + S.token } });
    const d = await r.json();
    if (d['og:title'] || d['og:description']) {
      linkPreviewCache[url] = { title: d['og:title'] || d['og:site_name'] || '', desc: d['og:description'] || '', img: d['og:image'] || '', site: new URL(url).hostname, url };
    }
  } catch {}
  return linkPreviewCache[url];
}
function renderLinkPreviews(container, text) {
  const urlRegex = /https?:\/\/[^\s<>"]+/g;
  const urls = text.match(urlRegex); if (!urls) return;
  urls.slice(0, 1).forEach(async url => {
    const preview = await fetchLinkPreview(url); if (!preview) return;
    const div = document.createElement('div'); div.className = 'link-preview';
    div.onclick = () => window.open(url, '_blank');
    div.innerHTML = (preview.img ? '<img class="lp-img" src="' + preview.img + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '<div class="lp-info"><div class="lp-site">' + esc(preview.site) + '</div><div class="lp-title">' + esc(preview.title) + '</div>' +
      (preview.desc ? '<div class="lp-desc">' + esc(preview.desc.slice(0, 100)) + '</div>' : '') + '</div>';
    container.appendChild(div);
  });
}

// ===== ГАЛЕРЕЯ =====
let galleryTab = 'photo';
async function showGallery() { if (S.currentRoom === null) { showNotif('Сначала откройте чат'); return; } openOvrl('gallery'); switchGalleryTab('photo'); }
function switchGalleryTab(tab) {
  galleryTab = tab;
  $('gtab-photo').className = tab === 'photo' ? 'btn-yes' : 'btn-no';
  $('gtab-file').className = tab === 'file' ? 'btn-yes' : 'btn-no';
  renderGallery(tab);
}
function renderGallery(tab) {
  const r = S.rooms[S.currentRoom]; if (!r) return;
  const el = $('gallery-content');
  const mediaEvents = r.events.filter(e => {
    if (e.type !== 'm.room.message') return false;
    if (tab === 'photo') return e.content?.msgtype === 'm.image';
    return e.content?.msgtype === 'm.file' || e.content?.msgtype === 'm.video' || e.content?.msgtype === 'm.audio';
  }).reverse();
  if (!mediaEvents.length) { el.innerHTML = '<div class="gallery-empty">' + (tab === 'photo' ? 'Нет фотографий' : 'Нет файлов') + '</div>'; return; }
  if (tab === 'photo') {
    el.innerHTML = '<div class="gallery-grid"></div>';
    const grid = el.querySelector('.gallery-grid');
    mediaEvents.forEach(ev => {
      const url = mxcToHttp(ev.content?.url);
      const div = document.createElement('div'); div.className = 'gallery-item';
      div.onclick = () => openImgViewer(url);
      div.innerHTML = '<img src="' + url + '" loading="lazy" alt="">'; grid.appendChild(div);
    });
  } else {
    el.innerHTML = '';
    mediaEvents.forEach(ev => {
      const url = mxcToHttp(ev.content?.url);
      const sz = ev.content?.info?.size ? fmtSize(ev.content.info.size) : '';
      const icon = ev.content?.msgtype === 'm.video' ? '🎥' : ev.content?.msgtype === 'm.audio' ? '🎵' : '📄';
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(196,168,130,.3);cursor:pointer';
      d.innerHTML = '<div style="width:36px;height:36px;background:var(--br);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">' + icon + '</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--br);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(ev.content?.body||'файл') + '</div><div style="font-size:11px;color:var(--mt)">' + sz + ' · ' + nt(ev.origin_server_ts) + '</div></div>';
      d.onclick = () => downloadFile(url, ev.content?.body||'файл');
      el.appendChild(d);
    });
  }
}

// ===== ПРОФИЛЬ =====
async function openProfile() {
  const prof = $('prof-av');
  const nm = S.displayName || (S.userId || '').split(':')[0].replace('@', '');
  prof.textContent = ini(nm);
  $('prof-name').value = S.displayName || '';
  try {
    const d = await api('GET', '/profile/' + encodeURIComponent(S.userId));
    if (d.avatar_url) {
      const url = mxcToHttp(d.avatar_url);
      prof.replaceChildren();
      const img = document.createElement('img');
      img.src = url;
      img.onerror = () => { prof.textContent = ini(nm); };
      prof.appendChild(img);
    }
  } catch {}
  openOvrl('profile');
}
function changeAvatar() { $('av-file').click(); }
async function uploadAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const uploadR = await fetch(CFG.server + '/_matrix/media/v3/upload?filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token, 'Content-Type': file.type }, body: file });
    const uploadD = await uploadR.json();
    if (uploadD.content_uri) {
      await api('PUT', '/profile/' + encodeURIComponent(S.userId) + '/avatar_url', { avatar_url: uploadD.content_uri });
      const url = mxcToHttp(uploadD.content_uri);
      const profAv = $('prof-av');
      profAv.replaceChildren();
      const profImg = document.createElement('img');
      profImg.src = url;
      profAv.appendChild(profImg);
      const av = $('usr-av');
      av.replaceChildren();
      const avImg = document.createElement('img');
      avImg.src = url;
      avImg.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover';
      av.appendChild(avImg);
      showNotif('✅ Аватар обновлён');
    }
  } catch { showNotif('Ошибка загрузки аватара'); }
  e.target.value = '';
}
async function saveProfile() {
  const name = $('prof-name').value.trim();
  if (!name) { showNotif('Введите имя'); return; }
  try {
    await api('PUT', '/profile/' + encodeURIComponent(S.userId) + '/displayname', { displayname: name });
    S.displayName = name;
    const saved = JSON.parse(localStorage.getItem('tg_s') || '{}');
    saved.displayName = name; localStorage.setItem('tg_s', JSON.stringify(saved));
    $('usr-nm').textContent = name;
    const usrAv = $('usr-av');
    if (!usrAv.querySelector('img')) usrAv.textContent = ini(name);
    closeOvrl('profile'); showNotif('✅ Профиль обновлён');
  } catch { showNotif('Ошибка сохранения'); }
}

// ===== ИСТОРИЯ РЕДАКТИРОВАНИЙ =====
function showEditHistory(eventId) {
  if (activeActs) { document.getElementById('acts-' + activeActs)?.classList.remove('show'); activeActs = null; }
  const r = S.rooms[S.currentRoom]; if (!r) return;
  const edits = r.events.filter(e => e.type === 'm.room.message' && e.content?.['m.relates_to']?.rel_type === 'm.replace' && e.content?.['m.relates_to']?.event_id === eventId);
  const orig = r.events.find(e => e.event_id === eventId);
  const el = $('edithist-list'); el.innerHTML = '';
  const all = [orig, ...edits].filter(Boolean);
  all.forEach((ev, i) => {
    const txt = i === 0 ? (ev.content?.body || '') : (ev.content?.['m.new_content']?.body || '');
    const d = document.createElement('div'); d.className = 'edit-hist-item';
    d.innerHTML = '<div>' + esc(txt) + '</div><div class="edit-hist-time">' + (i === 0 ? 'Оригинал' : 'Изменено') + ' · ' + nt(ev.origin_server_ts) + '</div>';
    el.appendChild(d);
  });
  if (!all.length) el.innerHTML = '<div style="padding:12px;color:var(--mt);font-size:13px;text-align:center">История недоступна</div>';
  openOvrl('edithist');
}

// ===== ЛИЧНЫЕ СООБЩЕНИЯ =====
async function showDm() {
  $('dm-list').innerHTML = '<div style="padding:12px;text-align:center;color:var(--mt);font-size:13px">Загружаем...</div>';
  $('dm-ok').disabled = true; $('dm-srch').value = '';
  openOvrl('dm');
  try {
    const d = await adminApi('/v2/users?limit=200&guests=false&deactivated=false');
    if (!d._ok) throw new Error('no_admin');
    S.dmUsers = (d.users || []).filter(u => (u.user_id || u.name) !== S.userId && !u.deactivated);
    renderDmList(S.dmUsers);
  } catch {
    S.dmUsers = [];
    $('dm-list').innerHTML = '<div style="padding:12px"><div style="font-size:12px;color:var(--mt);margin-bottom:8px">Введите логин сотрудника:</div><input id="dm-manual" type="text" placeholder="например: ivanov_s" autocapitalize="none" autocorrect="off" spellcheck="false" style="width:100%;border:1.5px solid var(--gd);border-radius:8px;padding:9px 12px;font-size:15px;background:var(--pm);color:var(--br);outline:none" oninput="var v=this.value.trim().toLowerCase();var srv=S.userId?S.userId.split(\':\')[1]:CFG.serverName;var uid=v?(\'@\'+v+\':\'+srv):\'\';document.getElementById(\'dm-ok\').dataset.uid=uid;document.getElementById(\'dm-ok\').disabled=!v;"></div>';
  }
}
function renderDmList(users) {
  const el = $('dm-list');
  if (!users.length) { el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--mt);font-size:13px">Нет сотрудников</div>'; return; }
  el.innerHTML = '';
  users.forEach(u => {
    const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '');
    const name = u.displayname || login;
    const d = document.createElement('div'); d.className = 'usr-it';
    d.innerHTML = '<div class="usr-it-av">' + ini(login) + '</div><div class="usr-it-inf"><div class="usr-it-nm">' + esc(name) + '</div><div class="usr-it-lg">' + esc(login) + '</div></div>';
    d.onclick = () => { el.querySelectorAll('.usr-it').forEach(x => x.classList.remove('sel')); d.classList.add('sel'); $('dm-ok').disabled = false; $('dm-ok').dataset.uid = u.user_id || u.name; };
    el.appendChild(d);
  });
}
function filterDmList(q) {
  if (!S.dmUsers) return;
  renderDmList(S.dmUsers.filter(u => { const uid = u.user_id || u.name; const login = uid.split(':')[0].replace('@', '').toLowerCase(); const name = (u.displayname || '').toLowerCase(); return login.includes(q.toLowerCase()) || name.includes(q.toLowerCase()); }));
  $('dm-ok').disabled = true;
}
async function createDm() {
  const uid = $('dm-ok').dataset.uid; if (!uid) return;
  const login = uid.split(':')[0].replace('@', '');
  try {
    const directData = await api('GET', '/user/' + encodeURIComponent(S.userId) + '/account_data/m.direct').catch(() => ({}));
    const existingRooms = directData[uid] || [];
    for (const rid of existingRooms) {
      const ri = S.rooms.findIndex(r => r.id === rid);
      if (ri >= 0) { closeOvrl('dm'); openRoom(ri); showNotif('Открыт существующий чат с ' + login); return; }
    }
    const d = await api('POST', '/createRoom', { preset: 'private_chat', invite: [uid], is_direct: true, visibility: 'private', name: 'Личный чат: ' + login });
    closeOvrl('dm'); await loadRooms();
    const ri = S.rooms.findIndex(r => r.id === d.room_id);
    if (ri >= 0) openRoom(ri);
    showNotif('✅ Личный чат с ' + login + ' создан');
  } catch { showNotif('Ошибка создания личного чата'); }
}

// ===== АРХИВ И MUTE =====
const archivedRooms = new Set(JSON.parse(localStorage.getItem('tg_archived') || '[]'));
function archiveRoom(roomId) {
  if (archivedRooms.has(roomId)) { archivedRooms.delete(roomId); showNotif('Чат разархивирован'); }
  else { archivedRooms.add(roomId); showNotif('Чат архивирован'); }
  localStorage.setItem('tg_archived', JSON.stringify([...archivedRooms])); renderRooms(S.rooms);
}
const mutedRooms = new Set(JSON.parse(localStorage.getItem('tg_muted') || '[]'));
function toggleMute(roomId) {
  if (mutedRooms.has(roomId)) { mutedRooms.delete(roomId); showNotif('Уведомления включены'); }
  else { mutedRooms.add(roomId); showNotif('Уведомления отключены'); }
  localStorage.setItem('tg_muted', JSON.stringify([...mutedRooms]));
}

// ===== СВАЙП =====
function initSwipe(el, eventId) {
  let startX = 0, startY = 0, swiping = false, triggered = false;
  const bbl = el.querySelector('.msg-body'); if (!bbl) return;
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = true; triggered = false; }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - startX; const dy = Math.abs(e.touches[0].clientY - startY);
    const isOwn = el.classList.contains('own');
    if (dy > 20) { swiping = false; return; }
    const swipeDx = isOwn ? Math.min(0, dx) : Math.max(0, dx);
    if (Math.abs(swipeDx) > 5) {
      bbl.style.transform = 'translateX(' + Math.sign(swipeDx) * Math.min(Math.abs(swipeDx) * 0.4, 40) + 'px)';
      if (Math.abs(swipeDx) > 50 && !triggered) { triggered = true; setReply(eventId); if (navigator.vibrate) navigator.vibrate(30); }
    }
  }, { passive: true });
  const resetSwipe = () => { swiping = false; if (bbl) { bbl.style.transition = 'transform .2s ease'; bbl.style.transform = ''; setTimeout(() => { if (bbl) bbl.style.transition = ''; }, 200); } };
  el.addEventListener('touchend', resetSwipe);
  el.addEventListener('touchcancel', resetSwipe);
}

// ===== УПОМИНАНИЯ =====
let mentionMembers = [], mentionActive = false, mentionQuery = '';
async function loadMentionMembers() {
  if (S.currentRoom === null) return;
  const r = S.rooms[S.currentRoom];
  try {
    const d = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/members');
    mentionMembers = (d.chunk || []).filter(m => m.content?.membership === 'join' && m.state_key !== S.userId).map(m => ({ userId: m.state_key, login: m.state_key.split(':')[0].replace('@', ''), name: m.content?.displayname || m.state_key.split(':')[0].replace('@', '') }));
  } catch {}
}
function handleMentionInput(e) {
  const inp = $('msg-inp'); const val = inp.value; const pos = inp.selectionStart; const before = val.slice(0, pos); const atIdx = before.lastIndexOf('@');
  if (atIdx >= 0 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
    mentionQuery = before.slice(atIdx + 1).toLowerCase();
    const filtered = mentionMembers.filter(m => m.login.toLowerCase().includes(mentionQuery) || m.name.toLowerCase().includes(mentionQuery));
    if (filtered.length > 0) { showMentionPopup(filtered, atIdx, pos); return; }
  }
  hideMentionPopup();
}
function showMentionPopup(users, atIdx) {
  mentionActive = true;
  const popup = $('mention-popup'); popup.innerHTML = '';
  users.slice(0, 8).forEach((u, i) => {
    const d = document.createElement('div'); d.className = 'mention-item' + (i === 0 ? ' sel' : '');
    d.innerHTML = '<div class="mention-av">' + ini(u.login) + '</div><div><div class="mention-nm">' + esc(u.name) + '</div><div class="mention-lg">@' + esc(u.login) + '</div></div>';
    d.onclick = () => insertMention(u, atIdx); popup.appendChild(d);
  });
  const inp = $('msg-inp'); const rect = inp.getBoundingClientRect();
  const popupH = Math.min(users.slice(0,8).length * 52, 200);
  const topPos = rect.top - popupH - 6;
  if (topPos > 60) { popup.style.top = topPos + 'px'; popup.style.bottom = 'auto'; }
  else { popup.style.bottom = (window.innerHeight - rect.top + 6) + 'px'; popup.style.top = 'auto'; }
  popup.style.display = 'block'; popup._atIdx = atIdx;
}
function hideMentionPopup() { mentionActive = false; $('mention-popup').style.display = 'none'; }
function insertMention(user, atIdx) {
  const inp = $('msg-inp'); const val = inp.value; const pos = inp.selectionStart;
  inp.value = val.slice(0, atIdx) + '@' + user.login + ' ' + val.slice(pos);
  inp.selectionStart = inp.selectionEnd = atIdx + user.login.length + 2;
  hideMentionPopup(); inp.focus(); onInp(inp);
}
function renderMentions(text, myLogin) {
  return text.replace(/@([a-z0-9_\-\.]+)/gi, (match, login) => {
    const isMe = login.toLowerCase() === (myLogin || '').toLowerCase();
    return '<span class="mention' + (isMe ? ' me' : '') + '" onclick="showNotif(\'@' + login + '\')">@' + login + '</span>';
  });
}

// ===== СМЕНА ПАРОЛЯ =====
async function doChangePass() {
  const oldP = $('cp-old').value, newP = $('cp-new').value, newP2 = $('cp-new2').value;
  const err = $('cp-err'); err.classList.remove('show');
  if (!oldP) { err.textContent = 'Введите текущий пароль'; err.classList.add('show'); return; }
  if (newP.length < 8) { err.textContent = 'Новый пароль минимум 8 символов'; err.classList.add('show'); return; }
  if (newP !== newP2) { err.textContent = 'Пароли не совпадают'; err.classList.add('show'); return; }
  if (oldP === newP) { err.textContent = 'Новый пароль совпадает со старым'; err.classList.add('show'); return; }
  try {
    const r1 = await api('POST', '/account/password', { new_password: newP, logout_devices: true });
    if ((r1._status === 401 || r1.errcode === 'M_UNAUTHORIZED') && r1.flows) {
      const session = r1.session;
      const r2 = await api('POST', '/account/password', { new_password: newP, logout_devices: true, auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: S.userId }, password: oldP, session } });
      if (r2.errcode) { err.textContent = r2.error || 'Неверный текущий пароль'; err.classList.add('show'); return; }
    } else if (r1.errcode) { err.textContent = r1.error || 'Ошибка'; err.classList.add('show'); return; }
    closeOvrl('chpass'); $('cp-old').value = ''; $('cp-new').value = ''; $('cp-new2').value = '';
    showNotif('✅ Пароль изменён');
  } catch (e) { err.textContent = 'Ошибка: ' + e.message; err.classList.add('show'); }
}

// ===== BADGE =====
function updateBadge() {
  const total = S.rooms.reduce((sum, r) => sum + (r.unread || 0), 0);
  try { if ('setAppBadge' in navigator) { if (total > 0) navigator.setAppBadge(total); else navigator.clearAppBadge(); } } catch {}
}

// ===== НОЧНАЯ ТЕМА =====
const darkMode = localStorage.getItem('tg_dark') === '1';
if (darkMode) document.body.classList.add('dark');
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('tg_dark', isDark ? '1' : '0');
  const themeItem = $('mi-theme');
  if (themeItem) themeItem.textContent = isDark ? '☀️ Светлая тема' : '🌙 Ночная тема';
}
window.addEventListener('DOMContentLoaded', () => {
  const themeItem = $('mi-theme');
  if (themeItem) themeItem.textContent = document.body.classList.contains('dark') ? '☀️ Светлая тема' : '🌙 Ночная тема';
});

// ===== ЭМОДЗИ =====
const EMOJI_DATA = {
  '😊': ['😊','😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😍','🥰','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿'],
  '👍': ['👍','👎','👋','🤚','🖐','✋','🤙','💪','👈','👉','👆','👇','☝️','✌️','🤞','🖖','🤘','👌','🤌','🤏','✊','👊','🤛','🤜','👏','🙌','🤲','🤝','🙏','✍️','💅'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💔','❤️‍🔥','💋','👄'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🐊'],
  '🍎': ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥔','🥕','🌽','🥦','🍔','🍟','🍕','🌮','🥗','🍣','🍜','🍝','🍛','🍲','🥚','🍳','🥞','🧇','🍗','🍖','🌭','🥪','🥙'],
  '⚽': ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🎯','🎮','🎲','🧩','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🥁'],
  '🚗': ['🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','✈️','🚀','🛸','🚁','⛵','🚤','🛥️','🚢'],
  '💼': ['💼','📁','📂','📅','📆','📋','📌','📍','📎','✂️','🔒','🔓','🔑','🔨','🔧','🔩','⚙️','💡','🔦','💰','💳','📧','📨','📦','📫']
};
const EMOJI_CATS_ICONS = ['😊','👍','❤️','🐶','🍎','⚽','🚗','💼'];
let currentEmojiCat = '😊', emojiPickerOpen = false;

function initEmojiPicker() {
  const cats = $('emoji-cats');
  if (!cats || cats.children.length > 0) return;
  EMOJI_CATS_ICONS.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'emoji-cat' + (cat === currentEmojiCat ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = () => { currentEmojiCat = cat; renderEmojiGrid(EMOJI_DATA[cat]); cats.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active')); btn.classList.add('active'); };
    cats.appendChild(btn);
  });
  renderEmojiGrid(EMOJI_DATA[currentEmojiCat]);
}
function renderEmojiGrid(emojis) {
  const grid = $('emoji-grid'); grid.innerHTML = '';
  emojis.forEach(em => {
    const btn = document.createElement('button'); btn.className = 'emoji-item'; btn.textContent = em;
    btn.onclick = () => insertEmoji(em); grid.appendChild(btn);
  });
}
function toggleEmojiPicker(e) {
  e.stopPropagation();
  const picker = $('emoji-picker');
  emojiPickerOpen = !emojiPickerOpen;
  picker.classList.toggle('open', emojiPickerOpen);
  if (emojiPickerOpen) {
    initEmojiPicker();
    const btn = e.currentTarget || e.target; const rect = btn.getBoundingClientRect();
    const topPos = rect.top - 288;
    if (topPos > 0) { picker.style.top = topPos + 'px'; picker.style.bottom = 'auto'; }
    else { picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px'; picker.style.top = 'auto'; }
    picker.style.left = Math.max(10, rect.left - 100) + 'px';
    picker.style.right = 'auto'; picker.style.maxWidth = (window.innerWidth - 20) + 'px';
  }
}
function insertEmoji(emoji) {
  const inp = $('msg-inp'); const pos = inp.selectionStart || inp.value.length;
  inp.value = inp.value.slice(0, pos) + emoji + inp.value.slice(pos);
  inp.selectionStart = inp.selectionEnd = pos + emoji.length;
  inp.focus(); onInp(inp);
}
document.addEventListener('click', e => {
  if (emojiPickerOpen && !e.target.closest('#emoji-picker') && !e.target.closest('.emoji-btn')) {
    emojiPickerOpen = false; $('emoji-picker').classList.remove('open');
  }
});

// ===== RECEIPTS =====
const roomReceipts = {};
function processReceipts(roomId, ephemeralEvents) {
  if (!ephemeralEvents) return;
  ephemeralEvents.forEach(ev => {
    if (ev.type !== 'm.receipt') return;
    if (!roomReceipts[roomId]) roomReceipts[roomId] = {};
    Object.entries(ev.content || {}).forEach(([eventId, data]) => {
      const readers = Object.entries(data['m.read'] || {});
      readers.forEach(([userId, info]) => {
        if (userId === S.userId) return;
        if (!roomReceipts[roomId][eventId]) roomReceipts[roomId][eventId] = new Map();
        roomReceipts[roomId][eventId].set(userId, info.ts || 0);
      });
    });
  });
}
function getReadBy(eventId, roomId) {
  const receipts = roomReceipts[roomId];
  if (!receipts || !receipts[eventId]) return [];
  return [...receipts[eventId].keys()].map(uid => uid.split(':')[0].replace('@', '')).slice(0, 5);
}
function addReadReceipts(msgEl, eventId, roomId) {
  const readers = getReadBy(eventId, roomId); if (!readers.length) return;
  const row = document.createElement('div'); row.className = 'receipts-row';
  readers.forEach(login => {
    const av = document.createElement('div'); av.className = 'read-av-sm';
    av.textContent = ini(login); av.title = login;
    av.style.background = 'var(--br)'; av.style.color = 'var(--pk)';
    row.appendChild(av);
  });
  const body = msgEl.querySelector('.msg-body'); if (body) body.appendChild(row);
}
async function loadReadReceipts(roomId) { /* placeholder */ }

// ===== PRESENCE =====
const presenceCache = {};
function processPresence(events) {
  if (!events) return;
  events.forEach(ev => { if (ev.type === 'm.presence') presenceCache[ev.sender || ev.content?.user_id] = ev.content?.presence === 'online'; });
}
function getPresenceDot(userId) {
  const online = presenceCache[userId];
  if (online === undefined) return '';
  return '<span style="width:8px;height:8px;border-radius:50%;background:' + (online ? 'var(--gr)' : '#aaa') + ';display:inline-block;margin-left:4px;vertical-align:middle" title="' + (online ? 'онлайн' : 'офлайн') + '"></span>';
}

// ===== DRAG & DROP =====
function onDragOver(e) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }
function onDragLeave(e) {}
function onDrop(e) {
  e.preventDefault(); e.stopPropagation();
  if (S.currentRoom === null) { showNotif('Сначала откройте чат'); return; }
  const files = e.dataTransfer.files; if (!files.length) return;
  const file = files[0]; const isImage = file.type.startsWith('image/'); const isVideo = file.type.startsWith('video/');
  const reader = new FileReader();
  reader.onload = ev => {
    S.pendingAtt = { name: file.name, mimeType: file.type, size: file.size, data: ev.target.result, isImage, isVideo };
    if (isImage) { $('att-ico').innerHTML = '<img src="' + URL.createObjectURL(file) + '" class="att-thumb">'; }
    else { $('att-ico').innerHTML = '<div class="att-doc-ico"><span style="font-size:16px">' + (isVideo ? '🎥' : '📄') + '</span></div>'; }
    $('att-nm').textContent = file.name; $('att-prev').classList.add('show'); updateSendBtn();
    showNotif('Файл готов к отправке');
  };
  reader.readAsArrayBuffer(file);
}

// ===== ВСТАВКА CTRL+V =====
document.addEventListener('paste', async e => {
  if (S.currentRoom === null) return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  const inModal = document.activeElement?.closest('.mdl, .ovrl');
  if ((tag === 'input' || tag === 'textarea') && inModal) return;
  if (tag === 'input' && document.activeElement?.id !== 'msg-inp') return;
  const items = e.clipboardData?.items; if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile(); if (!file) continue;
      const reader = new FileReader();
      reader.onload = ev => {
        S.pendingAtt = { name: 'вставка.png', mimeType: file.type, size: file.size, data: ev.target.result, isImage: true, isVideo: false };
        $('att-ico').innerHTML = '<img src="' + URL.createObjectURL(file) + '" class="att-thumb">';
        $('att-nm').textContent = 'Вставленное изображение';
        $('att-prev').classList.add('show'); updateSendBtn(); $('msg-inp').focus();
      };
      reader.readAsArrayBuffer(file); break;
    }
  }
});

// ===== ПОДГРУЗКА ИСТОРИИ =====
let loadingHistory = false;
let historyTokens = {};
async function loadMoreMessages() {
  if (S.currentRoom === null || loadingHistory) return;
  const r = S.rooms[S.currentRoom];
  const token = historyTokens[r.id];
  if (token === null) return;
  loadingHistory = true;
  const btn = $('load-more-btn'); if (btn) btn.textContent = 'Загружаем...';
  try {
    const fromParam = token ? '&from=' + encodeURIComponent(token) : '';
    const d = await api('GET', '/rooms/' + encodeURIComponent(r.id) + '/messages?limit=40&dir=b' + fromParam);
    const newEvents = (d.chunk || []).reverse();
    historyTokens[r.id] = d.end || null;
    if (newEvents.length > 0) {
      const msgs = $('msgs'); const oldHeight = msgs.scrollHeight;
      r.events = [...newEvents, ...r.events];
      renderMsgs(S.currentRoom, true);
      setTimeout(() => { msgs.scrollTop = msgs.scrollHeight - oldHeight; }, 0);
    }
    const freshBtn = $('load-more-btn');
    if (freshBtn) {
      if (d.end && newEvents.length > 0) { freshBtn.textContent = '⬆ Загрузить ещё'; freshBtn.disabled = false; freshBtn.style.cursor = ''; }
      else { freshBtn.textContent = '— Начало переписки —'; freshBtn.disabled = true; freshBtn.style.cursor = 'default'; }
    }
  } catch { if (btn) btn.textContent = '⬆ Загрузить ещё'; }
  loadingHistory = false;
}

// ===== FAB =====
let fabExpanded = false;
function initFab() {
  const wrap = $('fab-wrap'); if (!wrap) return;
  if (window.innerWidth < 700) wrap.classList.add('vis'); else wrap.classList.remove('vis');
}
function toggleFab() {
  fabExpanded = !fabExpanded;
  const wrap = $('fab-wrap'), main = $('fab-main');
  if (!wrap) return;
  wrap.classList.toggle('expanded', fabExpanded);
  main.textContent = fabExpanded ? '✕' : '✏️';
  const isAdm = S.isAdmin;
  const rowChat = $('fab-row-chat'), rowUsers = $('fab-row-users'), rowDm = $('fab-row-dm');
  if (rowChat) rowChat.style.display = (fabExpanded && isAdm) ? 'flex' : 'none';
  if (rowUsers) rowUsers.style.display = (fabExpanded && isAdm) ? 'flex' : 'none';
  if (rowDm) rowDm.style.display = fabExpanded ? 'flex' : 'none';
}
function fabCreateChat() { toggleFab(); openOvrl('create'); }
window.addEventListener('resize', () => {
  const wrap = $('fab-wrap'); if (!wrap) return;
  if (window.innerWidth >= 700) wrap.classList.remove('vis');
  else if (S.token) wrap.classList.add('vis');
});

// ===== МЕНЮ ЧАТА =====
function toggleRoomMenu() {
  if (S.currentRoom === null) return;
  const menu = $('room-menu');
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    const rmRename = $('rm-rename'), rmDelete = $('rm-delete');
    if (rmRename) rmRename.style.display = S.isAdmin ? 'flex' : 'none';
    if (rmDelete) rmDelete.style.display = S.isAdmin ? 'flex' : 'none';
  }
}
function closeRoomMenu() { const menu = $('room-menu'); if (menu) menu.style.display = 'none'; }
function leaveCurrentRoom() { const r = S.rooms[S.currentRoom]; if (r) leaveRoom(r.id, r.name); }
function deleteCurrentRoom() { const r = S.rooms[S.currentRoom]; if (r) deleteRoom(r.id, r.name); }
document.addEventListener('click', e => {
  const menu = $('room-menu'), btn = $('room-menu-btn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) menu.style.display = 'none';
});

// ===== МЕНЮ ПОЛЬЗОВАТЕЛЯ =====
function toggleUsrMenu() {
  const menu = $('usr-menu'); if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  if (isOpen) { const themeItem = $('mi-theme'); if (themeItem) themeItem.textContent = document.body.classList.contains('dark') ? '☀️ Светлая тема' : '🌙 Ночная тема'; }
}
function closeUsrMenu() { const menu = $('usr-menu'); if (menu) menu.classList.remove('open'); }
document.addEventListener('click', e => { const wrap = document.querySelector('.usr-menu-wrap'); if (wrap && !wrap.contains(e.target)) closeUsrMenu(); });

// ===== ИНВАЙТ-ССЫЛКИ =====
async function showInvites() {
  const sel = $('inv-room-sel');
  sel.innerHTML = '<option value="">— без привязки —</option>';
  S.rooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  });
  $('inv-result').style.display = 'none';
  openOvrl('invites');
  loadInviteTokens();
}

async function createInviteToken() {
  const roomId = $('inv-room-sel').value;
  const usesAllowed = parseInt($('inv-uses').value) || 0;
  const expMs = parseInt($('inv-exp').value) || 0;
  const expiry = expMs > 0 ? Date.now() + expMs : null;
  try {
    const body = {};
    if (usesAllowed > 0) body.uses_allowed = usesAllowed;
    if (expiry) body.expiry_time = expiry;
    body.length = 16;
    const d = await adminPost('/v1/registration_tokens/new', body);
    if (d.errcode) throw new Error(d.error || 'Ошибка создания токена');
    const token = d.token;
    let link = window.location.origin + window.location.pathname + '?invite=' + encodeURIComponent(token);
    if (roomId) link += '&room=' + encodeURIComponent(roomId);
    $('inv-link').value = link;
    $('inv-result').style.display = 'block';
    loadInviteTokens();
  } catch (e) { showNotif('Ошибка: ' + e.message); }
}

function copyInviteLink() {
  const val = $('inv-link').value;
  navigator.clipboard.writeText(val)
    .then(() => showNotif('✅ Ссылка скопирована'))
    .catch(() => { $('inv-link').select(); document.execCommand('copy'); showNotif('✅ Ссылка скопирована'); });
}

async function loadInviteTokens() {
  const el = $('inv-tokens-list');
  el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:8px">Загружаем...</div>';
  try {
    const d = await adminApi('/v1/registration_tokens');
    const tokens = d.registration_tokens || [];
    if (!tokens.length) { el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:8px">Нет активных приглашений</div>'; return; }
    el.innerHTML = '';
    tokens.forEach(t => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid rgba(196,168,130,.3);font-size:12px';
      const used = t.pending + t.completed;
      const limit = t.uses_allowed || '∞';
      const expired = t.expiry_time && t.expiry_time < Date.now();
      const expStr = t.expiry_time ? new Date(t.expiry_time).toLocaleDateString('ru') : 'бессрочно';
      div.innerHTML = '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;color:var(--br);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.token) + '</div>' +
        '<div style="color:var(--mt);font-size:10px">Использовано: ' + used + '/' + limit + ' · до ' + expStr + (expired ? ' · <span style="color:var(--rd)">истёк</span>' : '') + '</div></div>' +
        '<button class="inv-revoke-btn" style="background:none;border:1px solid var(--rd);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--rd);cursor:pointer;flex-shrink:0;white-space:nowrap">Отозвать</button>';
      const btn = div.querySelector('.inv-revoke-btn');
      btn.onclick = () => revokeInviteToken(t.token);
      el.appendChild(div);
    });
  } catch { el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:8px">Ошибка загрузки</div>'; }
}

async function revokeInviteToken(token) {
  if (!confirm('Отозвать приглашение ' + token.slice(0, 8) + '...?')) return;
  try {
    await adminDelete('/v1/registration_tokens/' + encodeURIComponent(token));
    showNotif('Приглашение отозвано');
    loadInviteTokens();
  } catch { showNotif('Ошибка отзыва'); }
}

// ===== СБРОС ПАРОЛЯ =====
let resetPassUserId = null;

function generateTempPass() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 3; i++) {
    if (i > 0) pass += '-';
    for (let j = 0; j < 3; j++) pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

function openResetPass(userId, name) {
  resetPassUserId = userId;
  $('rp-user-hint').textContent = 'Сброс пароля для: ' + name + ' (' + userId.split(':')[0].replace('@', '') + ')';
  $('rp-newpass').value = '';
  $('rp-logout').checked = true;
  $('rp-err').classList.remove('show');
  $('rp-result').style.display = 'none';
  $('rp-do-btn').style.display = '';
  openOvrl('resetpass');
}

async function doResetPass() {
  if (!resetPassUserId) return;
  const err = $('rp-err');
  err.classList.remove('show');
  let newPass = $('rp-newpass').value.trim();
  if (!newPass) newPass = generateTempPass();
  const logoutDevices = $('rp-logout').checked;
  try {
    const r = await adminPost('/v1/reset_password/' + encodeURIComponent(resetPassUserId), {
      new_password: newPass,
      logout_devices: logoutDevices
    });
    if (r.errcode || !r._ok) throw new Error(r.error || 'Ошибка сброса');
    $('rp-pass-show').textContent = newPass;
    $('rp-result').style.display = 'block';
    $('rp-do-btn').style.display = 'none';
    logAudit('Сброс пароля', resetPassUserId);
    showNotif('✅ Пароль сброшен');
  } catch (e) {
    err.textContent = e.message;
    err.classList.add('show');
  }
}

// ===== ВАТЕРМАРК =====
function initWatermark() {
  const el = $('watermark');
  if (!el || !S.userId) return;
  const login = S.userId.split(':')[0].replace('@', '');
  const now = new Date().toLocaleDateString('ru');
  const text = login + ' · ' + now;
  el.innerHTML = '';
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('span');
    s.textContent = text;
    el.appendChild(s);
  }
}

// ===== ТАЙМАУТ БЕЗДЕЙСТВИЯ =====
let inactivityTimer = null;
const INACTIVITY_MS = 15 * 60 * 1000;

function resetInactivity() {
  clearTimeout(inactivityTimer);
  if (!S.token) return;
  inactivityTimer = setTimeout(lockSession, INACTIVITY_MS);
}

function lockSession() {
  if (!S.token) return;
  $('lock-screen').classList.add('show');
  $('lock-pass').value = '';
  $('lock-err').classList.remove('show');
}

async function unlockSession() {
  const pass = $('lock-pass').value;
  if (!pass) return;
  const err = $('lock-err');
  err.classList.remove('show');
  try {
    const login = S.userId.split(':')[0].replace('@', '');
    const d = await api('POST', '/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: login }, password: pass });
    if (d.access_token) {
      await api('POST', '/logout', {}, d.access_token).catch(() => {});
      $('lock-screen').classList.remove('show');
      resetInactivity();
    } else { throw new Error('Неверный пароль'); }
  } catch (e) { err.textContent = e.message || 'Неверный пароль'; err.classList.add('show'); }
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  document.addEventListener(evt, resetInactivity, { passive: true });
});

// ===== МОИ УСТРОЙСТВА =====
async function showDevices() {
  openOvrl('devices');
  const el = $('devices-list');
  el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:12px">Загружаем...</div>';
  try {
    const d = await api('GET', '/devices');
    const devices = d.devices || [];
    el.innerHTML = '';
    devices.forEach(dev => {
      const div = document.createElement('div');
      div.className = 'devices-item';
      const lastSeen = dev.last_seen_ts ? new Date(dev.last_seen_ts).toLocaleString('ru') : 'неизвестно';
      const isCurrent = dev.device_id === (S.deviceId || '');
      div.innerHTML = '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--br)">' + esc(dev.display_name || dev.device_id) + '</div>' +
        '<div style="font-size:11px;color:var(--mt)">' + esc(dev.device_id) + '</div>' +
        '<div style="font-size:10px;color:var(--mt)">Последняя активность: ' + lastSeen + (dev.last_seen_ip ? ' · ' + esc(dev.last_seen_ip) : '') + '</div>' +
        '</div>' +
        (isCurrent ? '<span class="dev-current">текущее</span>' : '<button style="background:none;border:1px solid var(--rd);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--rd);cursor:pointer;flex-shrink:0" onclick="logoutDevice(\'' + esc(dev.device_id) + '\')">Завершить</button>');
      el.appendChild(div);
    });
    if (!devices.length) el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:12px">Нет устройств</div>';
  } catch { el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:12px;padding:12px">Ошибка загрузки</div>'; }
}

async function logoutDevice(deviceId) {
  try {
    const r1 = await api('DELETE', '/devices/' + encodeURIComponent(deviceId), {});
    if (r1._status === 401 && r1.flows) {
      const session = r1.session;
      await api('DELETE', '/devices/' + encodeURIComponent(deviceId), { auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: S.userId }, password: '', session } });
    }
    showNotif('Устройство отключено');
    showDevices();
  } catch { showNotif('Ошибка'); }
}

async function logoutAllOther() {
  if (!confirm('Завершить все другие сессии?')) return;
  try {
    const d = await api('GET', '/devices');
    const devices = (d.devices || []).filter(dev => dev.device_id !== (S.deviceId || ''));
    for (const dev of devices) {
      await api('DELETE', '/devices/' + encodeURIComponent(dev.device_id), {}).catch(() => {});
    }
    showNotif('✅ Все другие сессии завершены');
    showDevices();
  } catch { showNotif('Ошибка'); }
}

// ===== ОФФЛАЙН-ОЧЕРЕДЬ (IndexedDB) =====
const OUTBOX_DB = 'topgen-outbox';
const OUTBOX_STORE = 'pending';
let outboxDb = null;

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    if (outboxDb) { resolve(outboxDb); return; }
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = e => { e.target.result.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true }); };
    req.onsuccess = e => { outboxDb = e.target.result; resolve(outboxDb); };
    req.onerror = () => reject();
  });
}

async function enqueueMsg(roomId, content) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).add({ roomId, content, ts: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function getOutbox() {
  const db = await openOutboxDb();
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function removeFromOutbox(id) {
  const db = await openOutboxDb();
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

async function flushOutbox() {
  if (!navigator.onLine || !S.token) return;
  const items = await getOutbox();
  for (const item of items) {
    try {
      await api('PUT', '/rooms/' + encodeURIComponent(item.roomId) + '/send/m.room.message/' + txn(), item.content);
      await removeFromOutbox(item.id);
    } catch { break; }
  }
  if (items.length > 0 && S.currentRoom !== null) {
    await loadMessages(S.currentRoom);
  }
}

window.addEventListener('online', () => { showNotif('Сеть восстановлена'); flushOutbox(); });
window.addEventListener('offline', () => { showNotif('Нет подключения — сообщения будут отправлены позже'); });

openOutboxDb().catch(() => {});

// ===== ХРАНИЛИЩЕ =====
async function showStorage() {
  openOvrl('storage');
  const el = $('storage-info');
  el.textContent = 'Загружаем...';
  const saved = localStorage.getItem('tg_media_retention') || '0';
  $('storage-retention').value = saved;
  $('storage-retention').onchange = () => {
    localStorage.setItem('tg_media_retention', $('storage-retention').value);
    showNotif('Настройка сохранена');
  };
  try {
    const d = await adminApi('/v1/statistics/database/rooms');
    if (d._ok && d.rooms) {
      let totalMedia = 0;
      d.rooms.forEach(r => { totalMedia += r.media_store_local || 0; });
      el.innerHTML = '<div style="margin-bottom:8px"><b>Комнат:</b> ' + d.rooms.length + '</div>' +
        '<div><b>Медиафайлы (локальные):</b> ' + d.rooms.reduce((s, r) => s + (r.local_events || 0), 0) + ' событий</div>';
    } else {
      const d2 = await adminApi('/v1/server_version');
      el.innerHTML = '<div>Synapse ' + esc(d2.server_version || 'версия неизвестна') + '</div>' +
        '<div style="font-size:12px;color:var(--mt);margin-top:8px">Статистика недоступна для этой версии</div>';
    }
  } catch { el.textContent = 'Ошибка загрузки данных'; }
}

async function purgeMediaNow() {
  if (!confirm('Очистить кеш медиа на сервере?\n\nЭто удалит закешированные превью и удалённые медиафайлы.')) return;
  try {
    const before = Date.now();
    const d = await adminPost('/v1/purge_media_cache?before_ts=' + before, {});
    if (d._ok || d.deleted !== undefined) {
      showNotif('✅ Очищено: ' + (d.deleted || 0) + ' файлов');
    } else {
      const d2 = await adminPost('/v1/media/delete?before_ts=' + before, {});
      showNotif('✅ Очистка завершена');
    }
  } catch { showNotif('Ошибка очистки'); }
}

// ===== ЖУРНАЛ АУДИТА =====
function logAudit(action, details) {
  const log = JSON.parse(localStorage.getItem('tg_audit') || '[]');
  log.unshift({
    ts: Date.now(),
    who: S.userId ? S.userId.split(':')[0].replace('@', '') : '?',
    action,
    details: details || ''
  });
  if (log.length > 200) log.length = 200;
  localStorage.setItem('tg_audit', JSON.stringify(log));
}

function showAuditLog() {
  openOvrl('audit');
  const el = $('audit-list');
  const log = JSON.parse(localStorage.getItem('tg_audit') || '[]');
  if (!log.length) { el.innerHTML = '<div style="text-align:center;color:var(--mt);font-size:13px;padding:16px">Пока нет записей</div>'; return; }
  el.innerHTML = '';
  log.forEach(entry => {
    const d = document.createElement('div');
    d.style.cssText = 'padding:8px 4px;border-bottom:1px solid rgba(196,168,130,.3);font-size:12px';
    const time = new Date(entry.ts).toLocaleString('ru');
    d.innerHTML = '<div style="color:var(--mt);font-size:10px">' + time + ' · ' + esc(entry.who) + '</div>' +
      '<div style="color:var(--br);margin-top:2px">' + esc(entry.action) + (entry.details ? ' — ' + esc(entry.details) : '') + '</div>';
    el.appendChild(d);
  });
}

// ===== ФОРМАТИРОВАНИЕ ТЕКСТА =====
function formatText(text) {
  let html = esc(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__(.+?)__/g, '<i>$1</i>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(61,32,16,.08);padding:1px 4px;border-radius:4px;font-size:13px">$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
let voiceRecorder = null;
let voiceChunks = [];
let voiceTimer = null;
let voiceStart = 0;

async function toggleVoiceRecord() {
  if (voiceRecorder && voiceRecorder.state === 'recording') {
    voiceRecorder.stop();
    return;
  }
  if (S.currentRoom === null) { showNotif('Сначала откройте чат'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = [];
    voiceRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus' });
    voiceRecorder.ondataavailable = e => { if (e.data.size > 0) voiceChunks.push(e.data); };
    voiceRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(voiceTimer);
      $('voice-btn').classList.remove('recording');
      $('voice-btn').textContent = '🎤';
      if (!voiceChunks.length) return;
      const blob = new Blob(voiceChunks, { type: voiceRecorder.mimeType });
      const duration = Math.round((Date.now() - voiceStart) / 1000);
      await sendVoice(blob, duration);
    };
    voiceRecorder.start();
    voiceStart = Date.now();
    $('voice-btn').classList.add('recording');
    $('voice-btn').textContent = '⏹';
    voiceTimer = setInterval(() => {
      const sec = Math.round((Date.now() - voiceStart) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      $('voice-btn').title = m + ':' + String(s).padStart(2, '0');
    }, 500);
  } catch { showNotif('Нет доступа к микрофону'); }
}

async function sendVoice(blob, duration) {
  const r = S.rooms[S.currentRoom];
  if (!r) return;
  try {
    const buf = await blob.arrayBuffer();
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const uploadR = await fetch(CFG.server + '/_matrix/media/v3/upload?filename=voice.' + ext, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token, 'Content-Type': blob.type }, body: buf
    });
    const uploadD = await uploadR.json();
    if (!uploadD.content_uri) throw new Error('upload failed');
    await api('PUT', '/rooms/' + encodeURIComponent(r.id) + '/send/m.room.message/' + txn(), {
      msgtype: 'm.audio',
      body: 'Голосовое сообщение',
      url: uploadD.content_uri,
      info: { mimetype: blob.type, size: blob.size, duration: duration * 1000 },
      'org.matrix.msc1767.audio': { duration: duration * 1000 }
    });
    await loadMessages(S.currentRoom);
  } catch { showNotif('Ошибка отправки голосового'); }
}
