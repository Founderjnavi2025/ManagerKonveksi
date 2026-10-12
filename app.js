/* ═══════════════════════════════════════════════════
   KONVEKSI HUB — Multi-Room + JAIT4
   Super Admin: freecssbambangj@gmail.com / ioio8989
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   KONSTANTA
   ═══════════════════════════════════════════════════ */
const SUPER_ADMIN = {
  id: 'super_admin_default',
  email: 'freecssbambangj@gmail.com',
  password: 'ioio8989',
  nama: 'Super Admin',
  role: 'super_admin',
};

const LS = {
  users: 'kh_users',
  session: 'kh_session',
  rooms: 'kh_rooms',
  members: 'kh_members',
  roomData: (roomId) => 'kh_data_' + roomId,
};

/* ═══════════════════════════════════════════════════
   STATE GLOBAL
   ═══════════════════════════════════════════════════ */
const S = {
  user: null,
  profile: null,
  room: null,
  // Data JAIT4 per room
  workers: [],
  jobs: [],
  transactions: [],
  periods: [],
  tarif: { tarif: 8000 },
  // UI state
  filterStatus: 'semua',
  currentJobId: null,
  currentTxId: null,
  editingWorkerId: null,
  editingRoomId: null,
};

/* ═══════════════════════════════════════════════════
   UTIL
   ═══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const fmtNum = n => Number(n).toLocaleString('id-ID', {maximumFractionDigits:2});
const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const nowISO = () => new Date().toISOString();
const todayISO = () => nowISO().slice(0,10);

function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return d.getDate()+' '+bln[d.getMonth()]+' '+d.getFullYear();
}
function fmtDateWaktu(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const p = n => String(n).padStart(2,'0');
  return d.getDate()+' '+bln[d.getMonth()]+' '+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
}

function toast(msg, err){
  const t = $('toast'); t.textContent = msg;
  t.className = err ? 'show err' : 'show';
  clearTimeout(t._t); t._t = setTimeout(()=>t.className='', 2400);
}
window.openModal = id => $(id).classList.add('show');
window.closeModal = id => $(id).classList.remove('show');

/* ═══════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════ */
function lsRead(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function lsWrite(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

/* ─── USERS ─── */
function loadUsers(){
  let users = lsRead(LS.users, []);
  // Pastikan super admin ada
  if(!users.find(u => u.email === SUPER_ADMIN.email)){
    users.push({ ...SUPER_ADMIN });
    lsWrite(LS.users, users);
  }
  return users;
}
function saveUsers(users){ lsWrite(LS.users, users); }

/* ─── SESSION ─── */
function saveSession(user){ lsWrite(LS.session, { id: user.id, email: user.email }); }
function clearSession(){ localStorage.removeItem(LS.session); }
function getSession(){ return lsRead(LS.session, null); }

/* ─── ROOMS ─── */
function loadRooms(){ return lsRead(LS.rooms, []); }
function saveRooms(rooms){ lsWrite(LS.rooms, rooms); }

/* ─── MEMBERS ─── */
function loadMembers(){ return lsRead(LS.members, []); }
function saveMembers(m){ lsWrite(LS.members, m); }

/* ─── DATA PER ROOM ─── */
function loadRoomData(roomId){
  const key = LS.roomData(roomId);
  return lsRead(key, {
    workers: [],
    jobs: [],
    transactions: [],
    periods: [],
    tarif: { tarif: 8000 },
  });
}
function saveRoomData(roomId, data){ lsWrite(LS.roomData(roomId), data); }

/* ═══════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════ */
window.doLogin = async function(){
  const email = $('loginEmail').value.trim().toLowerCase();
  const pass = $('loginPassword').value;
  if(!email || !pass){ toast('Isi email dan password', true); return; }

  $('btnLogin').textContent = 'MEMUAT...';

  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email);
  if(!user || user.password !== pass){
    toast('Email atau password salah', true);
    $('btnLogin').textContent = 'MASUK';
    return;
  }

  S.user = user;
  S.profile = { id: user.id, nama: user.nama, role: user.role, email: user.email };
  saveSession(user);

  // Route
  if(user.role === 'super_admin'){
    await loadSuperAdmin();
    showPage('page-superadmin');
  } else {
    await loadRoomPicker();
    showPage('page-roompicker');
  }

  toast('✓ Selamat datang, ' + user.nama);
};

window.doLogout = function(){
  clearSession();
  S.user = null; S.profile = null; S.room = null;
  S.workers = []; S.jobs = []; S.transactions = []; S.periods = [];
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  $('btnLogin').textContent = 'MASUK';
  showPage('page-login');
  toast('Keluar');
};

/* ═══════════════════════════════════════════════════
   PAGE SWITCHING
   ═══════════════════════════════════════════════════ */
function showPage(id){
  ['page-login','page-superadmin','page-roompicker','page-room'].forEach(p => {
    const el = $(p); if(el) el.style.display = (p === id ? '' : 'none');
  });
}

window.switchTab = function(t){
  document.querySelectorAll('#page-room .page').forEach(p => p.classList.remove('active'));
  $('tab-'+t).classList.add('active');
  document.querySelectorAll('#page-room .tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === t));
  if(t === 'dashboard') renderDashboard();
  if(t === 'pekerjaan') renderPekerjaan();
  if(t === 'fisik') renderFisik();
  if(t === 'payroll') renderPayroll();
  if(t === 'pengaturan'){ renderWorkers(); renderPeriode(); renderTarif(); }
};

/* ═══════════════════════════════════════════════════
   SUPER ADMIN
   ═══════════════════════════════════════════════════ */
async function loadSuperAdmin(){
  const rooms = loadRooms();
  const users = loadUsers();

  // Statistik
  let totalWorkers = 0, totalJobs = 0;
  rooms.forEach(r => {
    const data = loadRoomData(r.id);
    totalWorkers += data.workers.length;
    totalJobs += data.jobs.length;
  });

  $('saStats').innerHTML = `
    <div class="stat-card"><div class="lbl">Total Room</div><div class="val">${rooms.length}</div></div>
    <div class="stat-card"><div class="lbl">Total Akun</div><div class="val">${users.length}</div></div>
    <div class="stat-card"><div class="lbl">Total Pekerja</div><div class="val">${totalWorkers}</div></div>
    <div class="stat-card"><div class="lbl">Total Pekerjaan</div><div class="val">${totalJobs}</div></div>
  `;

  renderSaRooms(rooms, users);
  renderSaUsers(users);
}

function renderSaRooms(rooms, users){
  const wrap = $('saRoomList');
  if(rooms.length === 0){
    wrap.innerHTML = '<div class="empty"><span class="big">🏢</span>Belum ada room.<br>Tekan + BUAT ROOM BARU.</div>';
    return;
  }
  wrap.innerHTML = rooms.map(r => {
    const owner = users.find(u => u.id === r.pemilik_id);
    const ownerName = owner ? owner.nama : '(belum ada)';
    const ownerEmail = owner ? owner.email : '—';
    const statusClass = r.status === 'aktif' ? 'aktif' : 'off';
    const berakhir = r.berakhir_at ? new Date(r.berakhir_at) : null;
    const now = new Date();
    let sisaHari = '';
    if(berakhir){
      const diff = Math.ceil((berakhir - now) / 86400000);
      sisaHari = diff < 0 ? ` <span style="color:var(--danger)">(kedaluwarsa)</span>`
              : diff < 7 ? ` <span style="color:var(--warn)">(${diff} hari lagi)</span>`
              : ` (${diff} hari lagi)`;
    }
    return `<div class="card" style="border-left-color:${r.status==='aktif'?'var(--neon)':'var(--dim)'}">
      <div class="card-head">
        <span class="card-code">/${esc(r.slug)}</span>
        <span class="badge ${r.status==='aktif'?'ok':'dim'}">${r.status.toUpperCase()}</span>
      </div>
      <div class="card-name">${esc(r.nama)}</div>
      <div class="card-info"><b>Pemilik:</b> ${esc(ownerName)} • ${esc(ownerEmail)}</div>
      <div class="card-info"><b>Paket:</b> ${esc(r.paket)} • <b>Berakhir:</b> ${r.berakhir_at || '—'}${sisaHari}</div>
      <div class="row2btn" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" onclick="masukRoom('${r.id}')">MASUK</button>
        <button class="btn btn-sm btn-ghost" onclick="editRoom('${r.id}')">UBAH</button>
        <button class="btn btn-sm btn-ghost" onclick="toggleRoomStatus('${r.id}')">${r.status==='aktif'?'TANGGUH':'AKTIFKAN'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRoom('${r.id}')">HAPUS</button>
      </div>
    </div>`;
  }).join('');
}

function renderSaUsers(users){
  const wrap = $('saUserList');
  wrap.innerHTML = users.map(u => `
    <div class="card" style="padding:9px 11px;">
      <div class="card-name" style="font-size:.88rem;">${esc(u.nama)} <span class="badge ${u.role==='super_admin'?'warn':'blue'}">${u.role.toUpperCase()}</span></div>
      <div class="card-info">📧 ${esc(u.email)}</div>
    </div>
  `).join('');
}

/* ── Modal Room ── */
window.openRoomModal = function(){
  S.editingRoomId = null;
  $('rm_title').textContent = 'Buat Room Baru';
  $('rm_nama').value = '';
  $('rm_slug').value = '';
  $('rm_owner').value = '';
  $('rm_email').value = '';
  $('rm_password').value = 'konveksi123';
  $('rm_paket').value = 'basic';
  $('rm_masa').value = 30;
  $('rm_status').value = 'aktif';
  window.openModal('roomModal');
};

window.editRoom = function(id){
  const rooms = loadRooms();
  const users = loadUsers();
  const r = rooms.find(x => x.id === id);
  if(!r) return;
  S.editingRoomId = id;
  const owner = users.find(u => u.id === r.pemilik_id);
  $('rm_title').textContent = 'Ubah Room';
  $('rm_nama').value = r.nama;
  $('rm_slug').value = r.slug;
  $('rm_owner').value = owner ? owner.nama : '';
  $('rm_email').value = owner ? owner.email : '';
  $('rm_password').value = '';
  $('rm_paket').value = r.paket || 'basic';
  $('rm_status').value = r.status || 'aktif';

  // Masa aktif — hitung dari berakhir_at
  if(r.berakhir_at){
    const diff = Math.ceil((new Date(r.berakhir_at) - new Date()) / 86400000);
    $('rm_masa').value = Math.max(0, diff);
  } else {
    $('rm_masa').value = 30;
  }
  window.openModal('roomModal');
};

window.saveRoom = function(){
  const nama = $('rm_nama').value.trim();
  const slug = $('rm_slug').value.trim();
  const ownerNama = $('rm_owner').value.trim();
  const ownerEmail = $('rm_email').value.trim().toLowerCase();
  const ownerPass = $('rm_password').value.trim();
  const paket = $('rm_paket').value;
  const masa = parseInt($('rm_masa').value) || 30;
  const status = $('rm_status').value;

  if(!nama){ toast('Isi nama konveksi', true); return; }
  if(!slug || !/^[a-z0-9-]{3,40}$/.test(slug)){ toast('Slug tidak valid', true); return; }

  const rooms = loadRooms();
  const users = loadUsers();

  // Cek slug unik
  if(rooms.some(x => x.slug === slug && x.id !== S.editingRoomId)){
    toast('Slug sudah dipakai', true); return;
  }

  const berakhirAt = new Date(Date.now() + masa * 86400000).toISOString().slice(0,10);

  if(S.editingRoomId){
    // Update
    const r = rooms.find(x => x.id === S.editingRoomId);
    r.nama = nama;
    r.slug = slug;
    r.paket = paket;
    r.status = status;
    r.berakhir_at = berakhirAt;
    saveRooms(rooms);
    toast('✓ Room diubah');
  } else {
    // Buat baru — butuh owner
    if(!ownerEmail){ toast('Isi email pemilik', true); return; }
    if(ownerPass.length < 6){ toast('Password minimal 6 karakter', true); return; }
    if(users.some(u => u.email.toLowerCase() === ownerEmail)){
      toast('Email sudah terdaftar', true); return;
    }

    // Buat user owner
    const ownerUser = {
      id: uid(),
      email: ownerEmail,
      password: ownerPass,
      nama: ownerNama || ownerEmail.split('@')[0],
      role: 'owner',
      createdAt: nowISO(),
    };
    users.push(ownerUser);
    saveUsers(users);

    // Buat room
    const room = {
      id: uid(),
      slug, nama,
      pemilik_id: ownerUser.id,
      paket,
      status,
      mulai_at: todayISO(),
      berakhir_at: berakhirAt,
      createdAt: nowISO(),
    };
    rooms.push(room);
    saveRooms(rooms);

    // Buat data room kosong (dengan periode aktif)
    const roomData = loadRoomData(room.id);
    if(!roomData.periods.find(p => p.status === 'aktif')){
      const def = hitungPeriodeDefault();
      roomData.periods.push({
        id: uid(),
        mulai: def.mulai,
        akhir: def.akhir,
        status: 'aktif',
        createdAt: nowISO(),
        closedAt: null,
        snapshot: null,
      });
    }
    saveRoomData(room.id, roomData);

    // Tambahkan ke members
    const members = loadMembers();
    members.push({ room_id: room.id, user_id: ownerUser.id, role: 'owner' });
    saveMembers(members);

    toast('✓ Room dibuat. Owner: ' + ownerEmail);
  }

  window.closeModal('roomModal');
  loadSuperAdmin();
};

window.toggleRoomStatus = function(id){
  const rooms = loadRooms();
  const r = rooms.find(x => x.id === id);
  if(!r) return;
  r.status = r.status === 'aktif' ? 'ditangguhkan' : 'aktif';
  saveRooms(rooms);
  toast(r.status === 'aktif' ? '✓ Room diaktifkan' : '⚠ Room ditangguhkan');
  loadSuperAdmin();
};

window.deleteRoom = function(id){
  if(!confirm('Hapus room ini beserta SEMUA data (pekerja, pekerjaan, riwayat)?')) return;
  const rooms = loadRooms().filter(r => r.id !== id);
  saveRooms(rooms);
  localStorage.removeItem(LS.roomData(id));
  const members = loadMembers().filter(m => m.room_id !== id);
  saveMembers(members);
  toast('Room dihapus');
  loadSuperAdmin();
};

window.masukRoom = async function(roomId){
  const rooms = loadRooms();
  const room = rooms.find(r => r.id === roomId);
  if(!room){ toast('Room tidak ditemukan', true); return; }
  await enterRoom(room);
};

/* ═══════════════════════════════════════════════════
   ROOM PICKER
   ═══════════════════════════════════════════════════ */
async function loadRoomPicker(){
  const rooms = loadRooms();
  const members = loadMembers();

  // Cari room yang bisa diakses user
  const aksesIds = members.filter(m => m.user_id === S.user.id).map(m => m.room_id);
  const myRooms = rooms.filter(r => r.pemilik_id === S.user.id || aksesIds.includes(r.id));

  const wrap = $('pickerList');
  if(myRooms.length === 0){
    wrap.innerHTML = '';
    $('pickerEmpty').style.display = 'block';
    return;
  }
  $('pickerEmpty').style.display = 'none';
  wrap.innerHTML = myRooms.map(r => {
    const blocked = r.status !== 'aktif';
    const statusClass = r.status === 'aktif' ? 'aktif' : 'off';
    return `<div class="card" style="${blocked ? 'opacity:0.6;' : 'cursor:pointer;'}"
                 ${blocked ? '' : `onclick="enterRoomById('${r.id}')"`}>
      <div class="card-head">
        <span class="card-code">/${esc(r.slug)}</span>
        <span class="badge ${blocked?'dim':'ok'}">${r.status.toUpperCase()}</span>
      </div>
      <div class="card-name">${esc(r.nama)}</div>
      <div class="card-info">Paket: ${esc(r.paket)} • Berakhir: ${r.berakhir_at || '—'}</div>
      ${blocked ? '<div class="card-info" style="color:var(--danger);">Room tidak aktif. Hubungi Super Admin.</div>' : ''}
    </div>`;
  }).join('');
}

window.enterRoomById = async function(roomId){
  const rooms = loadRooms();
  const room = rooms.find(r => r.id === roomId);
  if(!room){ toast('Room tidak ditemukan', true); return; }
  await enterRoom(room);
};

/* ═══════════════════════════════════════════════════
   ENTER ROOM
   ═══════════════════════════════════════════════════ */
async function enterRoom(room){
  if(room.status !== 'aktif'){ toast('Room tidak aktif', true); return; }

  S.room = room;
  const data = loadRoomData(room.id);

  S.workers = data.workers || [];
  S.jobs = data.jobs || [];
  S.transactions = data.transactions || [];
  S.periods = data.periods || [];
  S.tarif = data.tarif || { tarif: 8000 };

  // Pastikan ada periode aktif
  if(!S.periods.find(p => p.status === 'aktif')){
    const def = hitungPeriodeDefault();
    S.periods.push({
      id: uid(),
      mulai: def.mulai,
      akhir: def.akhir,
      status: 'aktif',
      createdAt: nowISO(),
      closedAt: null,
      snapshot: null,
    });
    saveCurrentRoomData();
  }

  $('roomTitle').textContent = room.nama.toUpperCase();
  $('roomSub').textContent = '/' + room.slug + ' • ' + (S.profile?.nama || '');

  showPage('page-room');
  window.switchTab('dashboard');
  toast('✓ Masuk room: ' + room.nama);
}

window.exitRoom = function(){
  // Simpan dulu
  saveCurrentRoomData();
  S.room = null;
  S.workers = []; S.jobs = []; S.transactions = []; S.periods = [];
  S.tarif = { tarif: 8000 };

  if(S.profile?.role === 'super_admin'){
    loadSuperAdmin();
    showPage('page-superadmin');
  } else {
    loadRoomPicker();
    showPage('page-roompicker');
  }
};

function saveCurrentRoomData(){
  if(!S.room) return;
  saveRoomData(S.room.id, {
    workers: S.workers,
    jobs: S.jobs,
    transactions: S.transactions,
    periods: S.periods,
    tarif: S.tarif,
  });
}

/* ═══════════════════════════════════════════════════
   JAIT4 — LOGIC
   ═══════════════════════════════════════════════════ */

/* ── Rumus ── */
function hitungUpah(pcs, tarif){
  if(!pcs || !tarif) return 0;
  return Math.round((pcs/12) * tarif);
}

/* ── Derivasi Job ── */
function jobDerivasi(job){
  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisaGantungan = Math.max(0, job.jumlahAmbil - totalSetor);
  const upahHak = hitungUpah(totalSetor, job.tarif);
  const totalPanjar = S.transactions
    .filter(t => t.jobId === job.id && t.jenis === 'panjar')
    .reduce((s,t) => s + t.jumlah, 0);
  const totalBayar = S.transactions
    .filter(t => t.jobId === job.id && t.jenis === 'pembayaran')
    .reduce((s,t) => s + t.jumlah, 0);
  const sisaUpah = Math.max(0, upahHak - totalPanjar - totalBayar);
  const lebihBayar = Math.max(0, totalPanjar + totalBayar - upahHak);

  let statusFisik = 'aktif';
  if(totalSetor > 0 && totalSetor < job.jumlahAmbil) statusFisik = 'gantungan';
  if(totalSetor >= job.jumlahAmbil) statusFisik = 'selesai';

  return { totalSetor, sisaGantungan, upahHak, totalPanjar, totalBayar, sisaUpah, lebihBayar, statusFisik };
}

/* ── Periode ── */
function periodeAktif(){ return S.periods.find(p => p.status === 'aktif'); }

function hitungPeriodeDefault(){
  const d = new Date();
  const day = d.getDay();
  const daysSinceSabtu = (day + 1) % 7 || 7;
  const sabtu = new Date(d);
  sabtu.setDate(d.getDate() - daysSinceSabtu);
  const jumat = new Date(sabtu);
  jumat.setDate(sabtu.getDate() + 6);
  const p = n => String(n).padStart(2,'0');
  const fmt = x => x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
  return { mulai: fmt(sabtu), akhir: fmt(jumat) };
}

function hitungPeriodeBaruSetelah(tanggalAkhirLama){
  const akhir = new Date(tanggalAkhirLama + 'T00:00:00');
  const sabtuBaru = new Date(akhir);
  sabtuBaru.setDate(akhir.getDate() + 1);
  const jumatBaru = new Date(sabtuBaru);
  jumatBaru.setDate(sabtuBaru.getDate() + 6);
  const p = n => String(n).padStart(2,'0');
  const fmt = x => x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
  return { mulai: fmt(sabtuBaru), akhir: fmt(jumatBaru) };
}

function cariPeriodeDariTanggal(isoTgl){
  const tgl = (isoTgl || '').slice(0,10);
  const aktif = periodeAktif();
  if(aktif && tgl >= aktif.mulai && tgl <= aktif.akhir) return aktif;
  const match = S.periods.find(p => tgl >= p.mulai && tgl <= p.akhir);
  return match || aktif;
}

function isTglDalamPeriode(isoTgl, periode){
  if(!isoTgl || !periode) return false;
  const tgl = isoTgl.slice(0,10);
  return tgl >= periode.mulai && tgl <= periode.akhir;
}

/* ── Filter helpers ── */
function jobAdaDiPeriode(job, periode){
  if(!periode) return true;
  if(isTglDalamPeriode(job.tglAmbil, periode)) return true;
  if((job.setoran || []).some(s => isTglDalamPeriode(s.tgl, periode))) return true;
  if(S.transactions.some(t => t.jobId === job.id && isTglDalamPeriode(t.tgl, periode))) return true;
  return false;
}

function txAdaDiPeriode(tx, periode){
  if(!periode) return true;
  if(tx.periodeId === periode.id) return true;
  return isTglDalamPeriode(tx.tgl, periode);
}

/* ── Pekerja gantungan ── */
function pekerjaGantunganPcs(workerId){
  return S.jobs
    .filter(j => j.workerId === workerId)
    .reduce((s,j) => s + jobDerivasi(j).sisaGantungan, 0);
}
function isWorkerTerkunci(workerId){
  return pekerjaGantunganPcs(workerId) > 0;
}

/* ═══════════════════════════════════════════════════
   RENDER DASHBOARD
   ═══════════════════════════════════════════════════ */
function renderDashboard(){
  const periode = periodeAktif();
  if(!periode){
    $('dashStats').innerHTML = '<div class="empty">Belum ada periode aktif</div>';
    return;
  }

  $('periodeLabel').textContent = fmtDate(periode.mulai+'T00:00:00') + ' — ' + fmtDate(periode.akhir+'T00:00:00');
  const hariIni = todayISO();
  let statusTxt = '🟢 AKTIF';
  if(hariIni > periode.akhir) statusTxt = '⚠️ Melewati tanggal akhir';
  else if(hariIni === periode.akhir) statusTxt = '🔴 Hari terakhir';
  $('periodeStatus').textContent = statusTxt;

  const jobsPeriode = S.jobs.filter(j => jobAdaDiPeriode(j, periode));
  const txPeriode = S.transactions.filter(t => txAdaDiPeriode(t, periode));

  const aktifWorkers = S.workers.filter(w => w.aktif);
  const tersedia = aktifWorkers.filter(w => !isWorkerTerkunci(w.id));
  const terkunci = aktifWorkers.filter(w => isWorkerTerkunci(w.id));

  let totalAmbil = 0, totalSetor = 0, totalGantungan = 0;
  let totalUpahHak = 0, totalPanjar = 0, totalBayar = 0;

  jobsPeriode.forEach(j => {
    const d = jobDerivasi(j);
    if(isTglDalamPeriode(j.tglAmbil, periode)){
      totalAmbil += j.jumlahAmbil;
      totalGantungan += d.sisaGantungan;
    }
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    totalUpahHak += hitungUpah(setorPeriode, j.tarif);
  });

  txPeriode.forEach(t => {
    if(t.jenis === 'panjar') totalPanjar += t.jumlah;
    if(t.jenis === 'pembayaran') totalBayar += t.jumlah;
  });

  const totalSisaUpah = Math.max(0, totalUpahHak - totalPanjar - totalBayar);

  $('dashStats').innerHTML = `
    <div class="stat-box"><div class="lbl">Pekerja Aktif</div><div class="val">${aktifWorkers.length}</div></div>
    <div class="stat-box"><div class="lbl">Tersedia</div><div class="val ok">${tersedia.length}</div></div>
    <div class="stat-box"><div class="lbl">Terkunci</div><div class="val warn">${terkunci.length}</div></div>
    <div class="stat-box"><div class="lbl">Gantungan</div><div class="val warn">${totalGantungan} pcs</div></div>
    <div class="stat-box"><div class="lbl">Pcs Diambil</div><div class="val">${totalAmbil}</div></div>
    <div class="stat-box"><div class="lbl">Pcs Disetor</div><div class="val ok">${totalSetor}</div></div>
    <div class="stat-box"><div class="lbl">Upah Hak</div><div class="val">${rp(totalUpahHak)}</div></div>
    <div class="stat-box"><div class="lbl">Panjar</div><div class="val warn">${rp(totalPanjar)}</div></div>
    <div class="stat-box"><div class="lbl">Bayar</div><div class="val ok">${rp(totalBayar)}</div></div>
    <div class="stat-box"><div class="lbl">Sisa Upah</div><div class="val danger">${rp(totalSisaUpah)}</div></div>
  `;

  const txs = txPeriode.sort((a,b) => new Date(b.tgl) - new Date(a.tgl)).slice(0,5);
  if(txs.length === 0){
    $('dashTransaksi').innerHTML = '<div class="empty" style="padding:16px;">Belum ada transaksi</div>';
  } else {
    $('dashTransaksi').innerHTML = txs.map(t => {
      const w = S.workers.find(x => x.id === t.workerId);
      return `<div class="card ${t.jenis === 'panjar' ? 'gantung' : 'done'}">
        <div class="card-info">${t.jenis === 'panjar' ? '🟡 Panjar' : '💰 Bayar'} — <b>${esc(w ? w.nama : '—')}</b> — ${rp(t.jumlah)}</div>
        <div class="card-info">${fmtDate(t.tgl)}</div>
      </div>`;
    }).join('');
  }
}

/* ═══════════════════════════════════════════════════
   RENDER PEKERJAAN
   ═══════════════════════════════════════════════════ */
const STATUS_FILTER = [
  { id: 'semua', label: 'Semua' },
  { id: 'aktif', label: 'Aktif' },
  { id: 'gantungan', label: 'Gantungan' },
  { id: 'selesai', label: 'Selesai' },
];

function renderFilterStatus(){
  $('filterStatusRow').innerHTML = STATUS_FILTER.map(s => `
    <div class="chip ${S.filterStatus === s.id ? 'active' : ''}" onclick="setFilterStatus('${s.id}')">${s.label}</div>
  `).join('');
}
window.setFilterStatus = function(s){
  S.filterStatus = s;
  renderPekerjaan();
};

function renderPekerjaan(){
  renderFilterStatus();
  const periode = periodeAktif();
  const cari = ($('filterCari').value || '').toLowerCase().trim();

  let list = S.jobs.filter(j => jobAdaDiPeriode(j, periode));
  if(S.filterStatus !== 'semua'){
    list = list.filter(j => jobDerivasi(j).statusFisik === S.filterStatus);
  }
  if(cari){
    list = list.filter(j =>
      (j.workerNama || '').toLowerCase().includes(cari) ||
      (j.barang || '').toLowerCase().includes(cari)
    );
  }
  list.sort((a,b) => new Date(b.tglAmbil) - new Date(a.tglAmbil));

  const wrap = $('pekerjaanList');
  if(list.length === 0){
    wrap.innerHTML = '<div class="empty"><span class="big">📦</span>Belum ada pekerjaan</div>';
    return;
  }

  wrap.innerHTML = list.map(j => {
    const d = jobDerivasi(j);
    const progress = j.jumlahAmbil > 0 ? Math.min(100, (d.totalSetor / j.jumlahAmbil) * 100) : 0;

    let badge = '';
    if(d.statusFisik === 'aktif') badge = '<span class="badge blue">AKTIF</span>';
    if(d.statusFisik === 'gantungan') badge = '<span class="badge warn">GANTUNGAN</span>';
    if(d.statusFisik === 'selesai') badge = '<span class="badge ok">SELESAI</span>';

    let gajiInfo = '';
    if(d.upahHak > 0){
      gajiInfo = `<div class="card-info">💰 Upah: <b>${rp(d.upahHak)}</b> • Panjar: <b>${rp(d.totalPanjar)}</b> • Bayar: <b>${rp(d.totalBayar)}</b></div>`;
      if(d.sisaUpah > 0) gajiInfo += `<div class="card-info" style="color:var(--neon2);">💵 Sisa: <b>${rp(d.sisaUpah)}</b></div>`;
    }

    let actions = '';
    if(d.statusFisik !== 'selesai'){
      actions += `<div class="row2btn">
        <button class="btn btn-done" onclick="openSetor('${j.id}')">📦 SETOR</button>
        <button class="btn btn-warn" onclick="openPanjar('${j.id}')">🟡 PANJAR</button>
      </div>`;
    }
    if(d.sisaUpah > 0){
      actions += `<button class="btn btn-primary" onclick="openBayar('${j.id}')">💰 BAYAR ${rp(d.sisaUpah)}</button>`;
    }
    actions += `<button class="btn btn-ghost" onclick="openDetailJob('${j.id}')">📄 DETAIL</button>`;

    return `<div class="card ${d.statusFisik === 'selesai' ? 'done' : d.statusFisik === 'gantungan' ? 'gantung' : ''}">
      <div class="card-head">
        <span class="card-code">${esc(j.barang)} ${esc(j.jenis)}</span>
        ${badge}
      </div>
      <div class="card-name">${esc(j.workerNama)}</div>
      <div class="card-info">📅 ${fmtDate(j.tglAmbil)} • 🎯 ${j.jumlahAmbil} pcs @ ${rp(j.tarif)}/lusin</div>
      <div class="card-info">📦 Setor: <b>${d.totalSetor} pcs</b> • Sisa: <b>${d.sisaGantungan} pcs</b></div>
      <div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div>
      ${gajiInfo}
      ${actions}
    </div>`;
  }).join('');
}

/* ── AMBIL BARANG ── */
window.openAmbilModal = function(){
  const tersedia = S.workers.filter(w => w.aktif && !isWorkerTerkunci(w.id));
  const terkunci = S.workers.filter(w => w.aktif && isWorkerTerkunci(w.id));

  if(S.workers.filter(w => w.aktif).length === 0){
    toast('Belum ada pekerja aktif. Tambah dulu di tab LAIN.', true);
    return;
  }
  if(tersedia.length === 0){
    toast('Semua pekerja terkunci (gantungan)', true);
    return;
  }

  $('am_worker').innerHTML = '<option value="">— Pilih Pekerja —</option>' +
    tersedia.map(w => `<option value="${w.id}">${esc(w.nama)}</option>`).join('');

  let info = '';
  if(terkunci.length > 0){
    info = `<div class="alert warn">ℹ️ ${terkunci.length} pekerja terkunci: ${terkunci.map(w => esc(w.nama)).join(', ')}</div>`;
  }
  $('am_workerInfo').innerHTML = info;

  $('am_barang').value = '';
  $('am_jenis').value = 'Oblong';
  $('am_jumlah').value = '';
  $('am_tarif').value = S.tarif.tarif;
  $('am_tgl').value = todayISO();
  $('am_preview').style.display = 'none';
  window.openModal('ambilModal');
};

function updateAmbilPreview(){
  const jumlah = parseInt($('am_jumlah').value) || 0;
  const tarif = parseFloat($('am_tarif').value) || 0;
  const el = $('am_preview');
  if(jumlah > 0 && tarif > 0){
    const upah = hitungUpah(jumlah, tarif);
    el.innerHTML = `Potensi upah: <b>${rp(upah)}</b> <small>(${jumlah} pcs = ${fmtNum(jumlah/12)} lusin × ${rp(tarif)})</small>`;
    el.style.display = 'block';
  } else el.style.display = 'none';
}

window.simpanAmbil = function(){
  const workerId = $('am_worker').value;
  const barang = $('am_barang').value.trim();
  const jenis = $('am_jenis').value;
  const jumlah = parseInt($('am_jumlah').value);
  const tarif = parseFloat($('am_tarif').value);
  const tgl = $('am_tgl').value;

  if(!workerId){ toast('Pilih pekerja', true); return; }
  if(!barang){ toast('Isi nama barang', true); return; }
  if(!jumlah || jumlah <= 0){ toast('Jumlah tidak valid', true); return; }
  if(!tarif || tarif <= 0){ toast('Tarif tidak valid', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  const w = S.workers.find(x => x.id === workerId);
  if(!w){ toast('Pekerja tidak ditemukan', true); return; }
  if(!w.aktif){ toast('Pekerja nonaktif', true); return; }
  if(isWorkerTerkunci(workerId)){ toast('Pekerja masih terkunci', true); return; }

  const job = {
    id: uid(),
    workerId,
    workerNama: w.nama,
    barang, jenis,
    jumlahAmbil: jumlah,
    tarif,
    tglAmbil: tgl + 'T00:00:00.000+07:00',
    setoran: [],
    createdAt: nowISO(),
  };

  S.jobs.push(job);
  saveCurrentRoomData();
  window.closeModal('ambilModal');
  toast('✓ Barang diambil oleh ' + w.nama);
  renderAllRoom();
};

/* ── SETOR ── */
window.openSetor = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  if(d.sisaGantungan <= 0){ toast('Sudah setor penuh', true); return; }

  S.currentJobId = jobId;
  $('setorInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.workerNama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(j.barang)} ${esc(j.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlahAmbil} pcs</span></div>
    <div class="info-line"><span>Sudah setor</span><span>${d.totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa gantungan</span><span style="color:var(--warn);">${d.sisaGantungan} pcs</span></div>
  `;
  $('st_pcs').value = d.sisaGantungan;
  $('st_tgl').value = todayISO();
  $('st_ket').value = '';
  $('st_alert').innerHTML = '';
  updateSetorAlert();
  window.openModal('setorModal');
};

function updateSetorAlert(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j) return;
  const d = jobDerivasi(j);
  const pcs = parseInt($('st_pcs').value) || 0;
  const alertEl = $('st_alert');

  if(pcs <= 0){ alertEl.innerHTML = '<div class="alert danger">Isi jumlah > 0</div>'; return; }
  if(pcs > d.sisaGantungan){
    alertEl.innerHTML = `<div class="alert danger">Melebihi sisa (${d.sisaGantungan} pcs)</div>`; return;
  }
  alertEl.innerHTML = `<div class="alert ok">Sisa setelah setor: ${d.sisaGantungan - pcs} pcs</div>`;
}

window.simpanSetor = function(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const pcs = parseInt($('st_pcs').value);
  const tgl = $('st_tgl').value;
  const ket = $('st_ket').value.trim();

  if(!pcs || pcs <= 0){ toast('Jumlah tidak valid', true); return; }
  if(pcs > d.sisaGantungan){ toast('Melebihi sisa', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  j.setoran.push({
    id: uid(),
    tgl: tgl + 'T00:00:00.000+07:00',
    pcs,
    keterangan: ket,
    createdAt: nowISO(),
  });

  saveCurrentRoomData();
  window.closeModal('setorModal');
  toast('✓ Setor ' + pcs + ' pcs');
  renderAllRoom();
};

/* ── PANJAR ── */
window.openPanjar = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const potensiUpah = hitungUpah(j.jumlahAmbil, j.tarif);
  const sisaBisaPanjar = Math.max(0, potensiUpah - d.totalPanjar);

  if(sisaBisaPanjar <= 0){ toast('Panjar sudah mencapai batas', true); return; }

  S.currentJobId = jobId;
  $('panjarInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.workerNama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(j.barang)} ${esc(j.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlahAmbil} pcs</span></div>
    <div class="info-line"><span>Potensi upah</span><span>${rp(potensiUpah)}</span></div>
    <div class="info-line"><span>Sudah dipanjar</span><span>${rp(d.totalPanjar)}</span></div>
    <div class="info-line"><span>Bisa dipanjar lagi</span><span style="color:var(--warn);">${rp(sisaBisaPanjar)}</span></div>
  `;
  $('pj_jumlah').value = '';
  $('pj_tgl').value = todayISO();
  $('pj_ket').value = '';
  $('pj_alert').innerHTML = '';
  window.openModal('panjarModal');
};

function updatePanjarAlert(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j) return;
  const d = jobDerivasi(j);
  const potensiUpah = hitungUpah(j.jumlahAmbil, j.tarif);
  const sisaBisa = Math.max(0, potensiUpah - d.totalPanjar);
  const jumlah = parseFloat($('pj_jumlah').value) || 0;

  if(jumlah <= 0){ $('pj_alert').innerHTML = ''; return; }
  if(jumlah > sisaBisa){
    $('pj_alert').innerHTML = `<div class="alert danger">Melebihi batas. Maks: ${rp(sisaBisa)}</div>`; return;
  }
  $('pj_alert').innerHTML = `<div class="alert ok">Sisa bisa dipanjar setelah ini: ${rp(sisaBisa - jumlah)}</div>`;
}

window.simpanPanjar = function(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const potensiUpah = hitungUpah(j.jumlahAmbil, j.tarif);
  const sisaBisa = Math.max(0, potensiUpah - d.totalPanjar);

  const jumlah = parseFloat($('pj_jumlah').value);
  const tgl = $('pj_tgl').value;
  const ket = $('pj_ket').value.trim();

  if(!jumlah || jumlah <= 0){ toast('Jumlah tidak valid', true); return; }
  if(jumlah > sisaBisa){ toast('Melebihi batas panjar', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  const periode = cariPeriodeDariTanggal(tgl);

  S.transactions.push({
    id: uid(),
    workerId: j.workerId,
    jobId: j.id,
    jenis: 'panjar',
    jumlah: Math.round(jumlah),
    tgl: tgl + 'T00:00:00.000+07:00',
    periodeId: periode.id,
    keterangan: ket,
    createdAt: nowISO(),
  });

  saveCurrentRoomData();
  window.closeModal('panjarModal');
  toast('✓ Panjar ' + rp(jumlah));
  renderAllRoom();
};

/* ── BAYAR ── */
window.openBayar = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);

  if(d.sisaUpah <= 0){ toast('Tidak ada sisa upah', true); return; }

  S.currentJobId = jobId;
  $('bayarInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.workerNama)}</span></div>
    <div class="info-line"><span>Upah hak</span><span>${rp(d.upahHak)}</span></div>
    <div class="info-line"><span>Panjar</span><span>${rp(d.totalPanjar)}</span></div>
    <div class="info-line"><span>Bayar sebelumnya</span><span>${rp(d.totalBayar)}</span></div>
    <div class="info-line total"><span>Sisa upah</span><span>${rp(d.sisaUpah)}</span></div>
  `;
  $('by_jumlah').value = d.sisaUpah;
  $('by_tgl').value = todayISO();
  $('by_ket').value = '';
  $('by_alert').innerHTML = '';
  updateBayarAlert();
  window.openModal('bayarModal');
};

function updateBayarAlert(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j) return;
  const d = jobDerivasi(j);
  const jumlah = parseFloat($('by_jumlah').value) || 0;
  const alertEl = $('by_alert');

  if(jumlah <= 0){ alertEl.innerHTML = ''; return; }
  if(jumlah > d.sisaUpah){
    alertEl.innerHTML = `<div class="alert danger">Melebihi sisa upah (${rp(d.sisaUpah)})</div>`; return;
  }
  alertEl.innerHTML = `<div class="alert ok">Sisa upah setelah ini: ${rp(d.sisaUpah - jumlah)}</div>`;
}

window.simpanBayar = function(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const jumlah = parseFloat($('by_jumlah').value);
  const tgl = $('by_tgl').value;
  const ket = $('by_ket').value.trim();

  if(!jumlah || jumlah <= 0){ toast('Jumlah tidak valid', true); return; }
  if(jumlah > d.sisaUpah){ toast('Melebihi sisa upah', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  const periode = cariPeriodeDariTanggal(tgl);

  S.transactions.push({
    id: uid(),
    workerId: j.workerId,
    jobId: j.id,
    jenis: 'pembayaran',
    jumlah: Math.round(jumlah),
    tgl: tgl + 'T00:00:00.000+07:00',
    periodeId: periode.id,
    keterangan: ket,
    createdAt: nowISO(),
  });

  saveCurrentRoomData();
  window.closeModal('bayarModal');
  toast('✓ Bayar ' + rp(jumlah));
  renderAllRoom();
};

/* ── DETAIL JOB ── */
window.openDetailJob = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j) return;
  const d = jobDerivasi(j);

  const setoranHtml = j.setoran.length === 0
    ? '<div class="card-info">Belum ada setoran</div>'
    : j.setoran.map(s => `
      <div class="info-line"><span>${fmtDate(s.tgl)}</span><span>${s.pcs} pcs</span></div>
      ${s.keterangan ? `<div class="card-info" style="font-size:.7rem;">📝 ${esc(s.keterangan)}</div>` : ''}
    `).join('');

  const txs = S.transactions.filter(t => t.jobId === j.id);
  const txHtml = txs.length === 0
    ? '<div class="card-info">Belum ada transaksi</div>'
    : txs.map(t => `
      <div class="info-line">
        <span>${t.jenis === 'panjar' ? '🟡 Panjar' : '💰 Bayar'} — ${fmtDate(t.tgl)}</span>
        <span>${rp(t.jumlah)}</span>
      </div>
    `).join('');

  $('dj_title').textContent = j.barang + ' ' + j.jenis;
  $('dj_content').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.workerNama)}</span></div>
    <div class="info-line"><span>Tanggal ambil</span><span>${fmtDate(j.tglAmbil)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlahAmbil} pcs</span></div>
    <div class="info-line"><span>Tarif</span><span>${rp(j.tarif)}/lusin</span></div>
    <div class="divider"></div>
    <div class="card-info"><b>SETORAN</b></div>
    ${setoranHtml}
    <div class="info-line total"><span>Total setor</span><span>${d.totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa gantungan</span><span style="color:var(--warn);">${d.sisaGantungan} pcs</span></div>
    <div class="divider"></div>
    <div class="card-info"><b>UPAH</b></div>
    <div class="info-line"><span>Upah hak</span><span>${rp(d.upahHak)}</span></div>
    <div class="info-line"><span>Panjar</span><span>${rp(d.totalPanjar)}</span></div>
    <div class="info-line"><span>Bayar</span><span>${rp(d.totalBayar)}</span></div>
    <div class="info-line total"><span>Sisa upah</span><span>${rp(d.sisaUpah)}</span></div>
    ${d.lebihBayar > 0 ? `<div class="alert danger">⚠️ Lebih bayar: ${rp(d.lebihBayar)}</div>` : ''}
    <div class="divider"></div>
    <div class="card-info"><b>TRANSAKSI</b></div>
    ${txHtml}
  `;
  window.openModal('detailJobModal');
};

/* ═══════════════════════════════════════════════════
   RENDER FISIK
   ═══════════════════════════════════════════════════ */
function renderFisik(){
  const periode = periodeAktif();
  if(!periode){
    $('fisikStats').innerHTML = '';
    $('fisikTbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--dim);">Belum ada periode aktif</td></tr>';
    return;
  }

  const jobsPeriode = S.jobs.filter(j => jobAdaDiPeriode(j, periode));

  let totalAmbil = 0, totalSetor = 0, totalSisa = 0;
  jobsPeriode.forEach(j => {
    const d = jobDerivasi(j);
    if(isTglDalamPeriode(j.tglAmbil, periode)) totalAmbil += j.jumlahAmbil;
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    if(isTglDalamPeriode(j.tglAmbil, periode)) totalSisa += d.sisaGantungan;
  });

  const jobAktifPeriode = jobsPeriode.filter(j =>
    jobDerivasi(j).statusFisik !== 'selesai' && isTglDalamPeriode(j.tglAmbil, periode)
  );

  $('fisikStats').innerHTML = `
    <div class="stat-box"><div class="lbl">Diambil</div><div class="val">${totalAmbil} pcs</div></div>
    <div class="stat-box"><div class="lbl">Disetor</div><div class="val ok">${totalSetor} pcs</div></div>
    <div class="stat-box"><div class="lbl">Gantungan</div><div class="val warn">${totalSisa} pcs</div></div>
    <div class="stat-box"><div class="lbl">Job Aktif</div><div class="val">${jobAktifPeriode.length}</div></div>
  `;

  const list = [...jobsPeriode].sort((a,b) => new Date(b.tglAmbil) - new Date(a.tglAmbil));
  if(list.length === 0){
    $('fisikTbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--dim);">Belum ada data</td></tr>';
    return;
  }

  $('fisikTbody').innerHTML = list.map(j => {
    const d = jobDerivasi(j);
    let statusBadge = '';
    if(d.statusFisik === 'aktif') statusBadge = '<span class="badge blue">AKTIF</span>';
    if(d.statusFisik === 'gantungan') statusBadge = '<span class="badge warn">GANTUNGAN</span>';
    if(d.statusFisik === 'selesai') statusBadge = '<span class="badge ok">SELESAI</span>';

    return `<tr>
      <td>${fmtDate(j.tglAmbil)}</td>
      <td>${esc(j.workerNama)}</td>
      <td>${esc(j.barang)} ${esc(j.jenis)}</td>
      <td>${j.jumlahAmbil}</td>
      <td>${d.totalSetor}</td>
      <td style="color:var(--warn);">${d.sisaGantungan}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════
   RENDER PAYROLL
   ═══════════════════════════════════════════════════ */
function renderPayroll(){
  const periode = periodeAktif();
  if(!periode){ $('payrollList').innerHTML = '<div class="empty">Belum ada periode aktif</div>'; return; }

  const selW = $('payrollWorkerFilter');
  const curW = selW.value;
  selW.innerHTML = '<option value="">— Semua Pekerja —</option>' +
    S.workers.map(w => `<option value="${w.id}">${esc(w.nama)}</option>`).join('');
  selW.value = curW;

  const wFilter = selW.value;

  const txPeriode = S.transactions.filter(t => txAdaDiPeriode(t, periode));
  const jobsPeriode = S.jobs.filter(j => jobAdaDiPeriode(j, periode));

  const byWorker = {};
  jobsPeriode.forEach(j => {
    if(wFilter && j.workerId !== wFilter) return;
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);
    if(setorPeriode === 0) return;

    const upahHak = hitungUpah(setorPeriode, j.tarif);
    const panjarJob = txPeriode.filter(t => t.jobId === j.id && t.jenis === 'panjar').reduce((s,t) => s + t.jumlah, 0);
    const bayarJob = txPeriode.filter(t => t.jobId === j.id && t.jenis === 'pembayaran').reduce((s,t) => s + t.jumlah, 0);

    if(!byWorker[j.workerId]) byWorker[j.workerId] = { nama: j.workerNama, upahHak: 0, panjar: 0, bayar: 0 };
    byWorker[j.workerId].upahHak += upahHak;
    byWorker[j.workerId].panjar += panjarJob;
    byWorker[j.workerId].bayar += bayarJob;
  });

  Object.values(byWorker).forEach(w => {
    w.sisa = Math.max(0, w.upahHak - w.panjar - w.bayar);
  });

  const arr = Object.entries(byWorker).map(([id, v]) => ({ id, ...v }));
  if(arr.length === 0){
    $('payrollList').innerHTML = '<div class="empty"><span class="big">💰</span>Belum ada data payroll</div>';
  } else {
    $('payrollList').innerHTML = arr.map(w => `
      <div class="card" style="border-left-color:var(--ok)">
        <div class="card-name">${esc(w.nama).toUpperCase()}</div>
        <div class="card-info">💰 Upah: <b>${rp(w.upahHak)}</b></div>
        <div class="card-info">🟡 Panjar: <b>${rp(w.panjar)}</b> • ✅ Bayar: <b>${rp(w.bayar)}</b></div>
        <div class="info-line total"><span>Sisa</span><span>${rp(w.sisa)}</span></div>
        <div class="row2btn">
          <button class="btn btn-primary" onclick="lihatSlip('${w.id}')">📄 SLIP</button>
          <button class="btn btn-done" onclick="cetakSlip('${w.id}')">🖨️ CETAK</button>
        </div>
      </div>
    `).join('');
  }

  let txs = [...txPeriode];
  if(wFilter) txs = txs.filter(t => t.workerId === wFilter);
  txs.sort((a,b) => new Date(b.tgl) - new Date(a.tgl));

  if(txs.length === 0){
    $('transaksiList').innerHTML = '<div class="empty" style="padding:16px;">Belum ada transaksi</div>';
  } else {
    $('transaksiList').innerHTML = txs.slice(0,30).map(t => {
      const w = S.workers.find(x => x.id === t.workerId);
      return `<div class="card">
        <div class="card-info">${t.jenis === 'panjar' ? '🟡 Panjar' : '💰 Bayar'} — <b>${esc(w ? w.nama : '—')}</b> — ${rp(t.jumlah)}</div>
        <div class="card-info">${fmtDate(t.tgl)}${t.keterangan ? ' • ' + esc(t.keterangan) : ''}</div>
      </div>`;
    }).join('');
  }
}

window.lihatSlip = function(workerId){
  const periode = periodeAktif();
  const w = S.workers.find(x => x.id === workerId);
  if(!w) return;

  const jobsPeriode = S.jobs.filter(j => j.workerId === workerId && jobAdaDiPeriode(j, periode));
  if(jobsPeriode.length === 0){ toast('Belum ada pekerjaan', true); return; }

  let totalHak = 0, totalPanjar = 0, totalBayar = 0;
  const rows = jobsPeriode.map(j => {
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, periode)).reduce((s,x) => s + x.pcs, 0);
    const upahHak = hitungUpah(setorPeriode, j.tarif);
    const panjar = S.transactions.filter(t => t.jobId === j.id && t.jenis === 'panjar' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + t.jumlah, 0);
    const bayar = S.transactions.filter(t => t.jobId === j.id && t.jenis === 'pembayaran' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + t.jumlah, 0);
    totalHak += upahHak; totalPanjar += panjar; totalBayar += bayar;
    return { j, setorPeriode, upahHak, panjar, bayar };
  });

  $('dj_title').textContent = 'Slip — ' + w.nama;
  $('dj_content').innerHTML = rows.map(r => `
    <div class="card">
      <div class="card-name">${esc(r.j.barang)} ${esc(r.j.jenis)}</div>
      <div class="card-info">Setor: ${r.setorPeriode} pcs • Upah: ${rp(r.upahHak)}</div>
      <div class="info-line"><span>Panjar</span><span>${rp(r.panjar)}</span></div>
      <div class="info-line"><span>Bayar</span><span>${rp(r.bayar)}</span></div>
    </div>
  `).join('') + `
    <div class="card" style="border-left-color:var(--neon2)">
      <div class="info-line"><span>Total Upah Hak</span><span>${rp(totalHak)}</span></div>
      <div class="info-line"><span>Total Panjar</span><span>${rp(totalPanjar)}</span></div>
      <div class="info-line"><span>Total Bayar</span><span>${rp(totalBayar)}</span></div>
      <div class="info-line total"><span>Sisa</span><span>${rp(Math.max(0, totalHak - totalPanjar - totalBayar))}</span></div>
    </div>
  `;
  window.openModal('detailJobModal');
};

window.cetakSlip = function(workerId){
  const periode = periodeAktif();
  const w = S.workers.find(x => x.id === workerId);
  if(!w) return;

  const jobsPeriode = S.jobs.filter(j => j.workerId === workerId && jobAdaDiPeriode(j, periode));
  if(jobsPeriode.length === 0){ toast('Belum ada pekerjaan', true); return; }

  const rows = jobsPeriode.map(j => {
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, periode)).reduce((s,x) => s + x.pcs, 0);
    const upahHak = hitungUpah(setorPeriode, j.tarif);
    const panjar = S.transactions.filter(t => t.jobId === j.id && t.jenis === 'panjar' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + t.jumlah, 0);
    const bayar = S.transactions.filter(t => t.jobId === j.id && t.jenis === 'pembayaran' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + t.jumlah, 0);
    return { j, setorPeriode, upahHak, panjar, bayar };
  });

  const totalHak = rows.reduce((s,r) => s + r.upahHak, 0);
  const totalPanjar = rows.reduce((s,r) => s + r.panjar, 0);
  const totalBayar = rows.reduce((s,r) => s + r.bayar, 0);
  const totalSisa = Math.max(0, totalHak - totalPanjar - totalBayar);
  const totalPcs = rows.reduce((s,r) => s + r.setorPeriode, 0);
  const tanggalCetak = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});

  $('printArea').innerHTML = `
    <div class="slip">
      <h4>SLIP GAJI OBRAS</h4>
      <div class="sub">${esc(S.room.nama)}</div>
      <hr>
      <table>
        <tr><td>Nama</td><td class="right"><b>${esc(w.nama)}</b></td></tr>
        ${w.telepon ? `<tr><td>Telepon</td><td class="right">${esc(w.telepon)}</td></tr>` : ''}
        <tr><td>Periode</td><td class="right">${fmtDate(periode.mulai+'T00:00:00')} - ${fmtDate(periode.akhir+'T00:00:00')}</td></tr>
        <tr><td>Dicetak</td><td class="right">${tanggalCetak}</td></tr>
      </table>
      <hr>
      <table>
        <tr style="border-bottom:1px solid #000;">
          <th>No</th><th>Barang</th>
          <th class="right">pcs</th><th class="right">lusin</th>
          <th class="right">Tarif</th><th class="right">Total</th>
        </tr>
        ${rows.map((r, idx) => `
          <tr>
            <td>${idx+1}</td>
            <td>${esc(r.j.barang)} ${esc(r.j.jenis)}</td>
            <td class="right">${r.setorPeriode}</td>
            <td class="right">${fmtNum(r.setorPeriode/12)}</td>
            <td class="right">${r.j.tarif.toLocaleString('id-ID')}</td>
            <td class="right">${r.upahHak.toLocaleString('id-ID')}</td>
          </tr>
        `).join('')}
        <tr style="border-top:1px solid #000;">
          <td colspan="2"><b>TOTAL</b></td>
          <td class="right"><b>${totalPcs}</b></td>
          <td class="right"><b>${fmtNum(totalPcs/12)}</b></td>
          <td></td>
          <td class="right"><b>${totalHak.toLocaleString('id-ID')}</b></td>
        </tr>
      </table>
      <hr>
      <table>
        <tr><td>Total Hak Upah</td><td class="right"><b>${totalHak.toLocaleString('id-ID')}</b></td></tr>
        ${totalPanjar > 0 ? `<tr><td>Panjar Diterima</td><td class="right">${totalPanjar.toLocaleString('id-ID')}</td></tr>` : ''}
        ${totalBayar > 0 ? `<tr><td>Pembayaran Lalu</td><td class="right">${totalBayar.toLocaleString('id-ID')}</td></tr>` : ''}
      </table>
      <hr>
      <table>
        <tr class="total">
          <td><b>SISA UPAH</b></td>
          <td class="right"><b>${rp(totalSisa)}</b></td>
        </tr>
      </table>
      <hr>
      <div class="center" style="font-size:10px;">Terima kasih 🙏</div>
    </div>
  `;
  window.openModal('slipModal');
};

/* ═══════════════════════════════════════════════════
   PEKERJA
   ═══════════════════════════════════════════════════ */
function renderWorkers(){
  if(S.workers.length === 0){
    $('workerList').innerHTML = '<div class="empty" style="padding:16px;">Belum ada pekerja</div>';
    return;
  }
  $('workerList').innerHTML = S.workers.map(w => {
    const terkunci = isWorkerTerkunci(w.id);
    const gantunganPcs = pekerjaGantunganPcs(w.id);
    let badge = w.aktif
      ? (terkunci ? `<span class="badge warn">${gantunganPcs} pcs gantungan</span>` : '<span class="badge ok">TERSEDIA</span>')
      : '<span class="badge dim">NONAKTIF</span>';

    return `<div class="card" style="padding:9px 11px;">
      <div class="card-name" style="font-size:.92rem;">${esc(w.nama)}</div>
      <div class="card-info">${w.telepon ? '📞 ' + esc(w.telepon) : '(tanpa telepon)'} ${badge}</div>
      <div class="row2btn" style="margin-top:6px;">
        <button class="btn btn-ghost btn-sm" onclick="editWorker('${w.id}')">UBAH</button>
        <button class="btn btn-danger btn-sm" onclick="hapusWorker('${w.id}')">HAPUS</button>
      </div>
    </div>`;
  }).join('');
}

window.openWorkerModal = function(){
  S.editingWorkerId = null;
  $('wm_title').textContent = 'Tambah Pekerja';
  $('wm_nama').value = '';
  $('wm_telepon').value = '';
  $('wm_aktif').value = 'true';
  window.openModal('workerModal');
};

window.editWorker = function(id){
  const w = S.workers.find(x => x.id === id);
  if(!w) return;
  S.editingWorkerId = id;
  $('wm_title').textContent = 'Ubah Pekerja';
  $('wm_nama').value = w.nama;
  $('wm_telepon').value = w.telepon || '';
  $('wm_aktif').value = w.aktif ? 'true' : 'false';
  window.openModal('workerModal');
};

window.simpanWorker = function(){
  const nama = $('wm_nama').value.trim();
  const telepon = $('wm_telepon').value.trim();
  const aktif = $('wm_aktif').value === 'true';

  if(!nama){ toast('Isi nama', true); return; }

  if(S.editingWorkerId){
    const w = S.workers.find(x => x.id === S.editingWorkerId);
    if(w){ w.nama = nama; w.telepon = telepon; w.aktif = aktif; }
  } else {
    S.workers.push({ id: uid(), nama, telepon, aktif, createdAt: nowISO() });
  }
  saveCurrentRoomData();
  window.closeModal('workerModal');
  toast('✓ Tersimpan');
  renderAllRoom();
};

window.hapusWorker = function(id){
  const jobs = S.jobs.filter(j => j.workerId === id);
  if(jobs.length > 0){
    if(!confirm(`Pekerja ini punya ${jobs.length} riwayat pekerjaan.\nHapus pekerja TANPA hapus riwayat?`)) return;
  } else {
    if(!confirm('Hapus pekerja ini?')) return;
  }
  S.workers = S.workers.filter(w => w.id !== id);
  saveCurrentRoomData();
  toast('Pekerja dihapus');
  renderAllRoom();
};

/* ═══════════════════════════════════════════════════
   PERIODE
   ═══════════════════════════════════════════════════ */
function renderPeriode(){
  const p = periodeAktif();
  if(!p){
    $('periodeInfo').innerHTML = '<div class="card-info">Belum ada periode aktif</div>';
    return;
  }
  $('periodeInfo').innerHTML = `
    <div class="card" style="border-left-color:var(--ok)">
      <div class="info-line"><span>Mulai</span><span>${fmtDate(p.mulai+'T00:00:00')}</span></div>
      <div class="info-line"><span>Akhir</span><span>${fmtDate(p.akhir+'T00:00:00')}</span></div>
      <div class="info-line"><span>Status</span><span style="color:var(--ok);">AKTIF</span></div>
    </div>
  `;
  const closed = S.periods.filter(x => x.status === 'ditutup').sort((a,b) => b.mulai.localeCompare(a.mulai));
  if(closed.length === 0){
    $('periodeHistory').innerHTML = '';
  } else {
    $('periodeHistory').innerHTML = '<div class="card-info" style="margin-bottom:6px;">Riwayat:</div>' +
      closed.slice(0,5).map(x => `
        <div class="card" style="padding:8px 11px;">
          <div class="card-info">${fmtDate(x.mulai+'T00:00:00')} - ${fmtDate(x.akhir+'T00:00:00')} <span class="badge dim">CLOSED</span></div>
        </div>
      `).join('');
  }
}

window.openPeriodeModal = function(){
  const p = periodeAktif();
  $('pm_mulai').value = p.mulai;
  $('pm_akhir').value = p.akhir;
  window.openModal('periodeModal');
};

window.simpanPeriode = function(){
  const p = periodeAktif();
  const m = $('pm_mulai').value;
  const a = $('pm_akhir').value;
  if(!m || !a){ toast('Isi tanggal', true); return; }
  if(m > a){ toast('Mulai harus ≤ akhir', true); return; }
  p.mulai = m; p.akhir = a;
  saveCurrentRoomData();
  window.closeModal('periodeModal');
  toast('✓ Periode diubah');
  renderAllRoom();
};

window.tutupPeriode = function(){
  const p = periodeAktif();
  const aktifJobs = S.jobs.filter(j => jobDerivasi(j).statusFisik !== 'selesai');
  let msg = 'Tutup periode dan buka periode baru?';
  if(aktifJobs.length > 0){
    msg = `Masih ada ${aktifJobs.length} pekerjaan belum selesai.\nPekerjaan akan tetap tercatat dan muncul di periode berikutnya.\n\nTetap tutup?`;
  }
  if(!confirm(msg)) return;
  p.status = 'ditutup';
  p.closedAt = nowISO();
  p.snapshot = hitungSnapshot(p);
  const baru = hitungPeriodeBaruSetelah(p.akhir);
  S.periods.push({
    id: uid(),
    mulai: baru.mulai,
    akhir: baru.akhir,
    status: 'aktif',
    createdAt: nowISO(),
    closedAt: null,
    snapshot: null,
  });
  saveCurrentRoomData();
  toast('✓ Periode ditutup, periode baru dibuka');
  renderAllRoom();
};

function hitungSnapshot(p){
  const jobsPeriode = S.jobs.filter(j => jobAdaDiPeriode(j, p));
  const txPeriode = S.transactions.filter(t => txAdaDiPeriode(t, p));
  let totalAmbil = 0, totalSetor = 0, totalGantungan = 0;
  let totalUpahHak = 0, totalPanjar = 0, totalBayar = 0;

  jobsPeriode.forEach(j => {
    if(isTglDalamPeriode(j.tglAmbil, p)){
      totalAmbil += j.jumlahAmbil;
      totalGantungan += jobDerivasi(j).sisaGantungan;
    }
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, p)).reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    totalUpahHak += hitungUpah(setorPeriode, j.tarif);
  });

  txPeriode.forEach(t => {
    if(t.jenis === 'panjar') totalPanjar += t.jumlah;
    if(t.jenis === 'pembayaran') totalBayar += t.jumlah;
  });

  return {
    totalAmbil, totalSetor, totalGantungan,
    totalUpahHak, totalPanjar, totalBayar,
    totalSisaUpah: Math.max(0, totalUpahHak - totalPanjar - totalBayar),
    generatedAt: nowISO(),
  };
}

/* ═══════════════════════════════════════════════════
   TARIF
   ═══════════════════════════════════════════════════ */
function renderTarif(){
  $('tarifInfo').innerHTML = `<div class="card"><div class="card-info">Tarif default: <b>${rp(S.tarif.tarif)}</b> / lusin</div></div>`;
}

window.openTarifModal = function(){
  $('tm_tarif').value = S.tarif.tarif;
  window.openModal('tarifModal');
};

window.simpanTarif = function(){
  const t = parseFloat($('tm_tarif').value);
  if(!t || t <= 0){ toast('Tarif tidak valid', true); return; }
  S.tarif.tarif = Math.round(t);
  saveCurrentRoomData();
  window.closeModal('tarifModal');
  toast('✓ Tarif disimpan');
  renderTarif();
};

/* ═══════════════════════════════════════════════════
   BACKUP / RESTORE ROOM
   ═══════════════════════════════════════════════════ */
window.backupJSON = function(){
  const data = {
    version: 'kh-1.0',
    exportedAt: nowISO(),
    room: S.room,
    workers: S.workers,
    jobs: S.jobs,
    transactions: S.transactions,
    periods: S.periods,
    tarif: S.tarif,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup-' + S.room.slug + '-' + todayISO() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Backup diunduh');
};

window.restoreJSON = function(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const data = JSON.parse(e.target.result);
      if(!confirm('Restore akan MENGGANTI data room ini. Lanjutkan?')) return;
      S.workers = data.workers || [];
      S.jobs = data.jobs || [];
      S.transactions = data.transactions || [];
      S.periods = data.periods || [];
      S.tarif = data.tarif || { tarif: 8000 };
      if(!S.periods.find(p => p.status === 'aktif')){
        const def = hitungPeriodeDefault();
        S.periods.push({
          id: uid(), mulai: def.mulai, akhir: def.akhir,
          status: 'aktif', createdAt: nowISO(), closedAt: null, snapshot: null,
        });
      }
      saveCurrentRoomData();
      toast('✓ Data dipulihkan');
      renderAllRoom();
    } catch(err){
      toast('File rusak', true);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
};

window.resetRoomData = function(){
  if(!confirm('HAPUS SEMUA DATA room ini?')) return;
  if(!confirm('Yakin? Backup dulu lebih aman.')) return;
  S.workers = []; S.jobs = []; S.transactions = [];
  S.periods = [];
  S.tarif = { tarif: 8000 };
  const def = hitungPeriodeDefault();
  S.periods.push({
    id: uid(), mulai: def.mulai, akhir: def.akhir,
    status: 'aktif', createdAt: nowISO(), closedAt: null, snapshot: null,
  });
  saveCurrentRoomData();
  toast('Data room dihapus');
  renderAllRoom();
};

/* ═══════════════════════════════════════════════════
   CLOCK
   ═══════════════════════════════════════════════════ */
function tick(){
  const d = new Date();
  const t = String(d.getHours()).padStart(2,'0')+':'+
            String(d.getMinutes()).padStart(2,'0')+':'+
            String(d.getSeconds()).padStart(2,'0');
  ['saClock','pickerClock','roomClock'].forEach(id => {
    const el = $(id); if(el) el.textContent = t;
  });
}

/* ═══════════════════════════════════════════════════
   RENDER ALL ROOM
   ═══════════════════════════════════════════════════ */
function renderAllRoom(){
  if(!S.room) return;
  saveCurrentRoomData();
  renderDashboard();
  renderPekerjaan();
  renderFisik();
  renderPayroll();
  renderWorkers();
  renderPeriode();
  renderTarif();
}

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  tick(); setInterval(tick, 1000);

  // Event listeners
  $('am_jumlah').addEventListener('input', updateAmbilPreview);
  $('am_tarif').addEventListener('input', updateAmbilPreview);
  $('st_pcs').addEventListener('input', updateSetorAlert);
  $('pj_jumlah').addEventListener('input', updatePanjarAlert);
  $('by_jumlah').addEventListener('input', updateBayarAlert);

  $('loginPassword').addEventListener('keydown', e => {
    if(e.key === 'Enter') $('btnLogin').click();
  });

  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if(e.target === bg) bg.classList.remove('show'); });
  });

  // Cek session
  const sess = getSession();
  if(sess){
    const users = loadUsers();
    const user = users.find(u => u.id === sess.id);
    if(user){
      S.user = user;
      S.profile = { id: user.id, nama: user.nama, role: user.role, email: user.email };
      if(user.role === 'super_admin'){
        loadSuperAdmin();
        showPage('page-superadmin');
      } else {
        loadRoomPicker();
        showPage('page-roompicker');
      }
    } else {
      clearSession();
      showPage('page-login');
    }
  } else {
    showPage('page-login');
  }

  $('bootScreen').style.display = 'none';
});
