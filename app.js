
/* ═══════════════════════════════════════════════════
   KONVEKSI HUB — app.js
   Multi-Room + JAIT4 + Fitur PENDING
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   STATE GLOBAL
   ═══════════════════════════════════════════════════ */
const S = {
  user: null,
  profile: null,
  room: null,
  workers: [],
  jobs: [],
  transactions: [],
  periods: [],
  tarif: { tarif: 8000 },
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
const uid = () => crypto.randomUUID();
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
   AUTH (SUPABASE)
   ═══════════════════════════════════════════════════ */
window.doLogin = async function(){
  const email = $('loginEmail').value.trim().toLowerCase();
  const pass = $('loginPassword').value;
  if(!email || !pass){ toast('Isi email dan password', true); return; }

  $('btnLogin').textContent = 'MEMUAT...';

  try {
    // Login via Supabase
    const user = await Auth.login(email, pass);
    S.user = user;
    
    // Ambil profile
    S.profile = await Profiles.get(user.id);
    if(!S.profile){
      toast('Profile tidak ditemukan. Hubungi admin.', true);
      await Auth.logout();
      $('btnLogin').textContent = 'MASUK';
      return;
    }

    // Route
    if(S.profile.role === 'super_admin'){
      await loadSuperAdmin();
      showPage('page-superadmin');
    } else {
      await loadRoomPicker();
      showPage('page-roompicker');
    }

    toast('✓ Selamat datang, ' + S.profile.nama);
  } catch(e) {
    toast('Login gagal: ' + e.message, true);
    $('btnLogin').textContent = 'MASUK';
  }
};

window.doLogout = async function(){
  try { await Auth.logout(); } catch(e){}
  S.user = null; S.profile = null; S.room = null;
  S.workers = []; S.jobs = []; S.transactions = []; S.periods = [];
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  $('btnLogin').textContent = 'MASUK';
  showPage('page-login');
  toast('Keluar');
};

/* ═══════════════════════════════════════════════════
   SUPER ADMIN
   ═══════════════════════════════════════════════════ */
async function loadSuperAdmin(){
  const rooms = await Rooms.listAll();
  const profiles = await Profiles.listAll();

  let totalWorkers = 0, totalJobs = 0;
  for(const r of rooms){
    try {
      const w = await Workers.list(r.id);
      const j = await Jobs.list(r.id);
      totalWorkers += w.length;
      totalJobs += j.length;
    } catch(e){ console.warn(e); }
  }

  $('saStats').innerHTML = `
    <div class="stat-card"><div class="lbl">Total Room</div><div class="val">${rooms.length}</div></div>
    <div class="stat-card"><div class="lbl">Total Akun</div><div class="val">${profiles.length}</div></div>
    <div class="stat-card"><div class="lbl">Total Pekerja</div><div class="val">${totalWorkers}</div></div>
    <div class="stat-card"><div class="lbl">Total Pekerjaan</div><div class="val">${totalJobs}</div></div>
  `;

  renderSaRooms(rooms, profiles);
  renderSaUsers(profiles);
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
    const statusClass = r.status === 'aktif' ? 'ok' : 'dim';
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
        <span class="badge ${statusClass}">${r.status.toUpperCase()}</span>
      </div>
      <div class="card-name">${esc(r.nama)}</div>
      <div class="card-info"><b>Pemilik:</b> ${esc(ownerName)} • ${esc(ownerEmail)}</div>
      <div class="card-info"><b>Paket:</b> ${esc(r.paket || 'basic')} • <b>Berakhir:</b> ${r.berakhir_at || '—'}${sisaHari}</div>
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
  if(users.length === 0){
    wrap.innerHTML = '<div class="empty" style="padding:16px;">Belum ada akun</div>';
    return;
  }
  wrap.innerHTML = users.map(u => `
    <div class="card" style="padding:9px 11px;">
      <div class="card-name" style="font-size:.88rem;">${esc(u.nama)} <span class="badge ${u.role==='super_admin'?'warn':'blue'}">${u.role.toUpperCase()}</span></div>
      <div class="card-info">📧 ${esc(u.email || '—')}</div>
    </div>
  `).join('');
}

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

window.editRoom = async function(id){
  try {
    const r = await Rooms.get(id);
    if(!r) return;
    S.editingRoomId = id;
    const owner = r.pemilik_id ? await Profiles.get(r.pemilik_id) : null;
    $('rm_title').textContent = 'Ubah Room';
    $('rm_nama').value = r.nama;
    $('rm_slug').value = r.slug;
    $('rm_owner').value = owner ? owner.nama : '';
    $('rm_email').value = owner ? owner.email : '';
    $('rm_password').value = '';
    $('rm_paket').value = r.paket || 'basic';
    $('rm_status').value = r.status || 'aktif';
    if(r.berakhir_at){
      const diff = Math.ceil((new Date(r.berakhir_at) - new Date()) / 86400000);
      $('rm_masa').value = Math.max(0, diff);
    } else {
      $('rm_masa').value = 30;
    }
    window.openModal('roomModal');
  } catch(e){ toast('Gagal load room: ' + e.message, true); }
};

window.saveRoom = async function(){
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

  const berakhirAt = new Date(Date.now() + masa * 86400000).toISOString().slice(0,10);

  try {
    if(S.editingRoomId){
      await Rooms.update(S.editingRoomId, {
        nama, slug, paket, status, berakhir_at: berakhirAt
      });
      toast('✓ Room diubah');
    } else {
      if(!ownerEmail){ toast('Isi email pemilik', true); return; }
      if(ownerPass.length < 6){ toast('Password minimal 6 karakter', true); return; }

      // Cek email existing
      const profiles = await Profiles.listAll();
      if(profiles.some(u => u.email && u.email.toLowerCase() === ownerEmail)){
        toast('Email sudah terdaftar', true); return;
      }

      // Bikin user via Supabase Auth
      $('btnLogin').textContent = 'MEMBUAT...';
      let newUser;
      try {
        newUser = await Auth.createUser(ownerEmail, ownerPass, ownerNama || ownerEmail.split('@')[0]);
      } catch(e) {
        toast('Gagal buat user: ' + e.message, true);
        return;
      }

      if(!newUser){ toast('Gagal buat user', true); return; }

      // Bikin room
      const room = await Rooms.create({
        nama, slug,
        pemilik_id: newUser.id,
        paket, status,
        mulai_at: todayISO(),
        berakhir_at: berakhirAt,
      });

      // Tambah member (trigger di SQL juga handle ini, tapi double-safety)
      try { await Rooms.addMember(room.id, newUser.id, 'owner'); } catch(e){}

      toast('✓ Room dibuat. Owner: ' + ownerEmail);
    }

    window.closeModal('roomModal');
    await loadSuperAdmin();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

window.toggleRoomStatus = async function(id){
  try {
    const r = await Rooms.get(id);
    if(!r) return;
    const newStatus = r.status === 'aktif' ? 'ditangguhkan' : 'aktif';
    await Rooms.update(id, { status: newStatus });
    toast(newStatus === 'aktif' ? '✓ Room diaktifkan' : '⚠ Room ditangguhkan');
    await loadSuperAdmin();
  } catch(e){ toast('Gagal: ' + e.message, true); }
};

window.deleteRoom = async function(id){
  if(!confirm('Hapus room ini beserta SEMUA data?')) return;
  try {
    await Rooms.delete(id);
    toast('Room dihapus');
    await loadSuperAdmin();
  } catch(e){ toast('Gagal: ' + e.message, true); }
};

window.masukRoom = async function(roomId){
  try {
    const room = await Rooms.get(roomId);
    if(!room){ toast('Room tidak ditemukan', true); return; }
    await enterRoom(room);
  } catch(e){ toast('Gagal masuk room: ' + e.message, true); }
};

/* ═══════════════════════════════════════════════════
   ROOM PICKER
   ═══════════════════════════════════════════════════ */
async function loadRoomPicker(){
  try {
    const rooms = await Rooms.listForUser(S.user.id);
    const wrap = $('pickerList');
    if(rooms.length === 0){
      wrap.innerHTML = '';
      $('pickerEmpty').style.display = 'block';
      return;
    }
    $('pickerEmpty').style.display = 'none';
    wrap.innerHTML = rooms.map(r => {
      const blocked = r.status !== 'aktif';
      return `<div class="card" style="${blocked ? 'opacity:0.6;' : 'cursor:pointer;'}"
                   ${blocked ? '' : `onclick="enterRoomById('${r.id}')"`}>
        <div class="card-head">
          <span class="card-code">/${esc(r.slug)}</span>
          <span class="badge ${blocked?'dim':'ok'}">${r.status.toUpperCase()}</span>
        </div>
        <div class="card-name">${esc(r.nama)}</div>
        <div class="card-info">Paket: ${esc(r.paket || 'basic')} • Berakhir: ${r.berakhir_at || '—'}</div>
        ${blocked ? '<div class="card-info" style="color:var(--danger);">Room tidak aktif. Hubungi Super Admin.</div>' : ''}
      </div>`;
    }).join('');
  } catch(e){ toast('Gagal load room: ' + e.message, true); }
}

window.enterRoomById = async function(roomId){
  try {
    const room = await Rooms.get(roomId);
    if(!room){ toast('Room tidak ditemukan', true); return; }
    await enterRoom(room);
  } catch(e){ toast('Gagal masuk: ' + e.message, true); }
};

/* ═══════════════════════════════════════════════════
   ENTER ROOM
   ═══════════════════════════════════════════════════ */
async function enterRoom(room){
  if(room.status !== 'aktif'){ toast('Room tidak aktif', true); return; }

  S.room = room;
  toast('Loading data...');

  try {
    const data = await loadRoomDataFromSupabase(room.id);
    S.workers = data.workers || [];
    S.jobs = (data.jobs || []).map(normalizeJobFromDB);
    S.transactions = data.transactions || [];
    S.periods = data.periods || [];
    S.tarif = data.tarif || { tarif: 8000 };

    // Pastikan ada periode aktif
    if(!S.periods.find(p => p.status === 'aktif')){
      const def = hitungPeriodeDefault();
      const newPeriod = {
        id: uid(),
        room_id: room.id,
        mulai: def.mulai,
        akhir: def.akhir,
        status: 'aktif',
        created_at: nowISO(),
        closed_at: null,
        snapshot: null,
      };
      await Periods.save(newPeriod);
      S.periods.push(newPeriod);
    }

    $('roomTitle').textContent = room.nama.toUpperCase();
    $('roomSub').textContent = '/' + room.slug + ' • ' + (S.profile?.nama || '');

    showPage('page-room');
    window.switchTab('dashboard');
    toast('✓ Masuk room: ' + room.nama);
  } catch(e){
    toast('Gagal load data: ' + e.message, true);
  }
}

// Normalisasi field dari Supabase (snake_case → camelCase)
function normalizeJobFromDB(j){
  return {
    id: j.id,
    room_id: j.room_id,
    worker_id: j.worker_id,
    worker_nama: j.worker_nama,
    barang: j.barang,
    jenis: j.jenis,
    jumlah_ambil: j.jumlah_ambil,
    tarif: Number(j.tarif),
    tgl_ambil: j.tgl_ambil,
    setoran: j.setoran || [],
    created_at: j.created_at,
    // Fitur PENDING
    status: j.status || 'aktif',
    pending_at: j.pending_at,
    pending_alasan: j.pending_alasan,
    pending_dibayar: j.pending_dibayar || false,
    upah_pending: Number(j.upah_pending || 0),
    pending_catatan_bayar: j.pending_catatan_bayar,
  };
}

window.exitRoom = async function(){
  S.room = null;
  S.workers = []; S.jobs = []; S.transactions = []; S.periods = [];
  S.tarif = { tarif: 8000 };

  if(S.profile?.role === 'super_admin'){
    await loadSuperAdmin();
    showPage('page-superadmin');
  } else {
    await loadRoomPicker();
    showPage('page-roompicker');
  }
};

/* ═══════════════════════════════════════════════════
   RUmus & DERIVASI
   ═══════════════════════════════════════════════════ */
function hitungUpah(pcs, tarif){
  if(!pcs || !tarif) return 0;
  return Math.round((pcs/12) * tarif);
}

function jobDerivasi(job){
  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisaGantungan = Math.max(0, job.jumlah_ambil - totalSetor);

  // Upah
  let upahHak;
  if(job.status === 'pending' && job.pending_dibayar){
    upahHak = job.upah_pending || 0;
  } else {
    upahHak = hitungUpah(totalSetor, job.tarif);
  }

  const totalPanjar = S.transactions
    .filter(t => t.job_id === job.id && t.jenis === 'panjar')
    .reduce((s,t) => s + Number(t.jumlah || 0), 0);
  const totalBayar = S.transactions
    .filter(t => t.job_id === job.id && t.jenis === 'pembayaran')
    .reduce((s,t) => s + Number(t.jumlah || 0), 0);
  const sisaUpah = Math.max(0, upahHak - totalPanjar - totalBayar);
  const lebihBayar = Math.max(0, totalPanjar + totalBayar - upahHak);

  // Status fisik
  let statusFisik = 'aktif';
  if(job.status === 'pending'){
    statusFisik = 'pending';
  } else if(totalSetor > 0 && totalSetor < job.jumlah_ambil){
    statusFisik = 'proses dikerjakan';
  } else if(totalSetor >= job.jumlah_ambil){
    statusFisik = 'selesai';
  }

  return { totalSetor, sisaGantungan, upahHak, totalPanjar, totalBayar, sisaUpah, lebihBayar, statusFisik };
}

function pekerjaGantunganPcs(workerId){
  return S.jobs
    .filter(j => j.worker_id === workerId)
    .reduce((s,j) => s + jobDerivasi(j).sisaGantungan, 0);
}

function isWorkerTerkunci(workerId){
  // Terkunci kalau punya job yang BELUM selesai DAN BUKAN pending
  return S.jobs.some(j =>
    j.worker_id === workerId &&
    j.status !== 'selesai' &&
    j.status !== 'pending'
  );
}

/* ═══════════════════════════════════════════════════
   PERIODE
   ═══════════════════════════════════════════════════ */
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

function jobAdaDiPeriode(job, periode){
  if(!periode) return true;
  if(isTglDalamPeriode(job.tgl_ambil, periode)) return true;
  if((job.setoran || []).some(s => isTglDalamPeriode(s.tgl, periode))) return true;
  if(S.transactions.some(t => t.job_id === job.id && isTglDalamPeriode(t.tgl, periode))) return true;
  return false;
}

function txAdaDiPeriode(tx, periode){
  if(!periode) return true;
  if(tx.periode_id === periode.id) return true;
  return isTglDalamPeriode(tx.tgl, periode);
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

  let totalAmbil = 0, totalSetor = 0, totalGantungan = 0, totalPending = 0;
  let totalUpahHak = 0, totalPanjar = 0, totalBayar = 0;

  jobsPeriode.forEach(j => {
    const d = jobDerivasi(j);
    if(isTglDalamPeriode(j.tgl_ambil, periode)){
      totalAmbil += j.jumlah_ambil;
    }
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    totalUpahHak += hitungUpah(setorPeriode, j.tarif);

    if(j.status === 'pending'){
      totalPending += d.sisaGantungan;
    } else if(d.statusFisik === 'gantungan'){
      totalGantungan += d.sisaGantungan;
    }
  });

  txPeriode.forEach(t => {
    if(t.jenis === 'panjar') totalPanjar += Number(t.jumlah);
    if(t.jenis === 'pembayaran') totalBayar += Number(t.jumlah);
  });

  const totalSisaUpah = Math.max(0, totalUpahHak - totalPanjar - totalBayar);

  $('dashStats').innerHTML = `
    <div class="stat-box"><div class="lbl">Pekerja Aktif</div><div class="val">${aktifWorkers.length}</div></div>
    <div class="stat-box"><div class="lbl">Tersedia</div><div class="val ok">${tersedia.length}</div></div>
    <div class="stat-box"><div class="lbl">Terkunci</div><div class="val warn">${terkunci.length}</div></div>
    <div class="stat-box"><div class="lbl">Gantungan</div><div class="val warn">${totalGantungan} pcs</div></div>
    <div class="stat-box"><div class="lbl">Pending</div><div class="val danger">${totalPending} pcs</div></div>
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
      const w = S.workers.find(x => x.id === t.worker_id);
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
  { id: 'pending', label: 'Pending' },
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
    list = list.filter(j => {
      const d = jobDerivasi(j);
      if(S.filterStatus === 'pending') return j.status === 'pending';
      if(S.filterStatus === 'selesai') return j.status === 'selesai' || d.statusFisik === 'selesai';
      return d.statusFisik === S.filterStatus;
    });
  }
  if(cari){
    list = list.filter(j =>
      (j.worker_nama || '').toLowerCase().includes(cari) ||
      (j.barang || '').toLowerCase().includes(cari)
    );
  }
  list.sort((a,b) => new Date(b.tgl_ambil) - new Date(a.tgl_ambil));

  const wrap = $('pekerjaanList');
  if(list.length === 0){
    wrap.innerHTML = '<div class="empty"><span class="big">📦</span>Belum ada pekerjaan</div>';
    return;
  }

  wrap.innerHTML = list.map(j => {
    const d = jobDerivasi(j);
    const progress = j.jumlah_ambil > 0 ? Math.min(100, (d.totalSetor / j.jumlah_ambil) * 100) : 0;

    let badge = '';
    if(j.status === 'pending'){
      badge = '<span class="badge danger">⏸️ PENDING</span>';
    } else if(d.statusFisik === 'aktif'){
      badge = '<span class="badge blue">AKTIF</span>';
    } else if(d.statusFisik === 'gantungan'){
      badge = '<span class="badge warn">GANTUNGAN</span>';
    } else if(d.statusFisik === 'selesai'){
      badge = '<span class="badge ok">SELESAI</span>';
    }

    let gajiInfo = '';
    if(d.upahHak > 0){
      gajiInfo = `<div class="card-info">💰 Upah: <b>${rp(d.upahHak)}</b> • Panjar: <b>${rp(d.totalPanjar)}</b> • Bayar: <b>${rp(d.totalBayar)}</b></div>`;
      if(d.sisaUpah > 0) gajiInfo += `<div class="card-info" style="color:var(--neon2);">💵 Sisa: <b>${rp(d.sisaUpah)}</b></div>`;
      if(d.lebihBayar > 0) gajiInfo += `<div class="card-info" style="color:var(--danger);">⚠️ Lebih bayar: <b>${rp(d.lebihBayar)}</b></div>`;
    }

    let pendingInfo = '';
    if(j.status === 'pending'){
      pendingInfo = `
        <div class="card-info" style="color:var(--danger);">
          ⏸️ Pending sejak ${fmtDate(j.pending_at)}
        </div>
        <div class="card-info" style="color:var(--dim);font-size:.7rem;">
          Alasan: ${esc(j.pending_alasan || '-')}
        </div>
        ${j.pending_dibayar ? `<div class="card-info" style="color:var(--ok);">✅ Sudah dibayar ${rp(j.upah_pending)}</div>` : ''}
      `;
    }

    let actions = '';

    // Kalau AKTIF atau GANTUNGAN (bukan pending, bukan selesai)
    if(j.status !== 'pending' && j.status !== 'selesai'){
      if(d.statusFisik !== 'selesai'){
        actions += `<div class="row2btn">
          <button class="btn btn-done" onclick="openSetor('${j.id}')">📦 SETOR</button>
          <button class="btn btn-warn" onclick="openPanjar('${j.id}')">🟡 PANJAR</button>
        </div>`;
        actions += `<button class="btn btn-danger" onclick="openPendingDariCard('${j.id}')">⏸️ PENDING</button>`;
      }
      if(d.sisaUpah > 0){
        actions += `<button class="btn btn-primary" onclick="openBayar('${j.id}')">💰 BAYAR ${rp(d.sisaUpah)}</button>`;
      }
    }

    // Kalau PENDING
    if(j.status === 'pending'){
      if(!j.pending_dibayar){
        actions += `<button class="btn btn-warn" onclick="openBayarPending('${j.id}')">💰 BAYAR PENDING</button>`;
      }
      actions += `<button class="btn btn-done" onclick="openSetorFisik('${j.id}')">📦 SETOR FISIK</button>`;
    }

    actions += `<button class="btn btn-ghost" onclick="openDetailJob('${j.id}')">📄 DETAIL</button>`;

    return `<div class="card ${j.status === 'pending' ? 'danger' : d.statusFisik === 'selesai' ? 'done' : d.statusFisik === 'gantungan' ? 'gantung' : ''}">
      <div class="card-head">
        <span class="card-code">${esc(j.barang)} ${esc(j.jenis)}</span>
        ${badge}
      </div>
      <div class="card-name">${esc(j.worker_nama)}</div>
      <div class="card-info">📅 ${fmtDate(j.tgl_ambil)} • 🎯 ${j.jumlah_ambil} pcs @ ${rp(j.tarif)}/lusin</div>
      <div class="card-info">📦 Setor: <b>${d.totalSetor} pcs</b> • Sisa: <b>${d.sisaGantungan} pcs</b></div>
      <div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div>
      ${pendingInfo}
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
  if(tersedia.length === 0 && terkunci.length === 0){
    toast('Semua pekerja terkunci', true);
    return;
  }

  $('am_worker').innerHTML = '<option value="">— Pilih Pekerja —</option>' +
    tersedia.map(w => `<option value="${w.id}">${esc(w.nama)}</option>`).join('');

  // Info pekerja terkunci + tombol PENDING
  let info = '';
  if(terkunci.length > 0){
    info = `<div class="alert danger">
      ⚠️ <b>${terkunci.length} pekerja terkunci:</b>
      ${terkunci.map(w => `
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="color:var(--txt);font-weight:700;">${esc(w.nama)}</span>
          <button class="btn btn-sm btn-warn" style="margin:0;padding:5px 12px;font-size:.7rem;" 
                  onclick="openPendingFromAmbil('${w.id}')">⏸️ PENDING</button>
        </div>
      `).join('')}
    </div>`;
  }
  $('am_workerInfo').innerHTML = info;

  $('am_barang').value = '';
  $('am_jenis').value = 'Oblong';
  $('am_jumlah').value = '';
  $('am_tarif').value = S.tarif.tarif || 8000;
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

window.simpanAmbil = async function(){
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

  try {
    const job = {
      id: uid(),
      room_id: S.room.id,
      worker_id: workerId,
      worker_nama: w.nama,
      barang, jenis,
      jumlah_ambil: jumlah,
      tarif,
      tgl_ambil: tgl + 'T00:00:00.000+07:00',
      setoran: [],
      status: 'aktif',
    };

    const saved = await Jobs.save(job);
    S.jobs.push(normalizeJobFromDB(saved));

    window.closeModal('ambilModal');
    toast('✓ Barang diambil oleh ' + w.nama);
    renderAllRoom();
  } catch(e){
    toast('Gagal simpan: ' + e.message, true);
  }
};

/* ── SETOR ── */
window.openSetor = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  if(d.sisaGantungan <= 0){ toast('Sudah setor penuh', true); return; }

  S.currentJobId = jobId;
  $('setorInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.worker_nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(j.barang)} ${esc(j.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlah_ambil} pcs</span></div>
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

window.simpanSetor = async function(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const pcs = parseInt($('st_pcs').value);
  const tgl = $('st_tgl').value;
  const ket = $('st_ket').value.trim();

  if(!pcs || pcs <= 0){ toast('Jumlah tidak valid', true); return; }
  if(pcs > d.sisaGantungan){ toast('Melebihi sisa', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  try {
    j.setoran = j.setoran || [];
    j.setoran.push({
      id: uid(),
      tgl: tgl + 'T00:00:00.000+07:00',
      pcs,
      keterangan: ket,
      created_at: nowISO(),
    });

    // Cek selesai
    const newTotal = j.setoran.reduce((s,x) => s + x.pcs, 0);
    if(newTotal >= j.jumlah_ambil){
      j.status = 'selesai';
    }

    await Jobs.save({
      id: j.id,
      room_id: j.room_id,
      worker_id: j.worker_id,
      worker_nama: j.worker_nama,
      barang: j.barang,
      jenis: j.jenis,
      jumlah_ambil: j.jumlah_ambil,
      tarif: j.tarif,
      tgl_ambil: j.tgl_ambil,
      setoran: j.setoran,
      status: j.status,
      pending_at: j.pending_at,
      pending_alasan: j.pending_alasan,
      pending_dibayar: j.pending_dibayar,
      upah_pending: j.upah_pending,
      pending_catatan_bayar: j.pending_catatan_bayar,
    });

    window.closeModal('setorModal');
    toast('✓ Setor ' + pcs + ' pcs');
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

/* ── PANJAR ── */
window.openPanjar = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const potensiUpah = hitungUpah(j.jumlah_ambil, j.tarif);
  const sisaBisaPanjar = Math.max(0, potensiUpah - d.totalPanjar);

  if(sisaBisaPanjar <= 0){ toast('Panjar sudah mencapai batas', true); return; }

  S.currentJobId = jobId;
  $('panjarInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.worker_nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(j.barang)} ${esc(j.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlah_ambil} pcs</span></div>
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
  const potensiUpah = hitungUpah(j.jumlah_ambil, j.tarif);
  const sisaBisa = Math.max(0, potensiUpah - d.totalPanjar);
  const jumlah = parseFloat($('pj_jumlah').value) || 0;

  if(jumlah <= 0){ $('pj_alert').innerHTML = ''; return; }
  if(jumlah > sisaBisa){
    $('pj_alert').innerHTML = `<div class="alert danger">Melebihi batas. Maks: ${rp(sisaBisa)}</div>`; return;
  }
  $('pj_alert').innerHTML = `<div class="alert ok">Sisa bisa dipanjar setelah ini: ${rp(sisaBisa - jumlah)}</div>`;
}

window.simpanPanjar = async function(){
  const j = S.jobs.find(x => x.id === S.currentJobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);
  const potensiUpah = hitungUpah(j.jumlah_ambil, j.tarif);
  const sisaBisa = Math.max(0, potensiUpah - d.totalPanjar);

  const jumlah = parseFloat($('pj_jumlah').value);
  const tgl = $('pj_tgl').value;
  const ket = $('pj_ket').value.trim();

  if(!jumlah || jumlah <= 0){ toast('Jumlah tidak valid', true); return; }
  if(jumlah > sisaBisa){ toast('Melebihi batas panjar', true); return; }
  if(!tgl){ toast('Isi tanggal', true); return; }

  const periode = cariPeriodeDariTanggal(tgl);

  try {
    const tx = {
      id: uid(),
      room_id: S.room.id,
      worker_id: j.worker_id,
      job_id: j.id,
      jenis: 'panjar',
      jumlah: Math.round(jumlah),
      tgl: tgl + 'T00:00:00.000+07:00',
      periode_id: periode ? periode.id : null,
      keterangan: ket,
    };

    const saved = await Transactions.save(tx);
    S.transactions.push(saved);

    window.closeModal('panjarModal');
    toast('✓ Panjar ' + rp(jumlah));
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

/* ── BAYAR ── */
window.openBayar = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j){ toast('Job tidak ditemukan', true); return; }
  const d = jobDerivasi(j);

  if(d.sisaUpah <= 0){ toast('Tidak ada sisa upah', true); return; }

  S.currentJobId = jobId;
  $('bayarInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.worker_nama)}</span></div>
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

window.simpanBayar = async function(){
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

  try {
    const tx = {
      id: uid(),
      room_id: S.room.id,
      worker_id: j.worker_id,
      job_id: j.id,
      jenis: 'pembayaran',
      jumlah: Math.round(jumlah),
      tgl: tgl + 'T00:00:00.000+07:00',
      periode_id: periode ? periode.id : null,
      keterangan: ket,
    };

    const saved = await Transactions.save(tx);
    S.transactions.push(saved);

    window.closeModal('bayarModal');
    toast('✓ Bayar ' + rp(jumlah));
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

/* ═══════════════════════════════════════════════════
   FITUR PENDING
   ═══════════════════════════════════════════════════ */

window.openPendingFromAmbil = function(workerId){
  const w = S.workers.find(x => x.id === workerId);
  if(!w){ toast('Pekerja tidak ditemukan', true); return; }

  const jobAktif = S.jobs.find(j =>
    j.worker_id === workerId &&
    j.status !== 'selesai' &&
    j.status !== 'pending'
  );

  if(!jobAktif){
    toast('Tidak ada job aktif untuk ' + w.nama, true);
    return;
  }

  S.currentJobId = jobAktif.id;

  const totalSetor = (jobAktif.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = jobAktif.jumlah_ambil - totalSetor;

  $('pendingInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(w.nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(jobAktif.barang)} ${esc(jobAktif.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${jobAktif.jumlah_ambil} pcs</span></div>
    <div class="info-line"><span>Setor</span><span>${totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa</span><span style="color:var(--danger);">${sisa} pcs</span></div>
  `;

  $('pendingAlasan').value = '';
  window.openModal('pendingModal');
};

window.openPendingDariCard = function(jobId){
  const job = S.jobs.find(j => j.id === jobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }

  S.currentJobId = jobId;

  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;

  $('pendingInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(job.worker_nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(job.barang)} ${esc(job.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${job.jumlah_ambil} pcs</span></div>
    <div class="info-line"><span>Setor</span><span>${totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa</span><span style="color:var(--danger);">${sisa} pcs</span></div>
  `;

  $('pendingAlasan').value = '';
  window.openModal('pendingModal');
};

window.konfirmasiPending = async function(){
  const alasan = $('pendingAlasan').value.trim();
  if(!alasan){ toast('Isi alasan pending', true); return; }

  const job = S.jobs.find(j => j.id === S.currentJobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }

  job.status = 'pending';
  job.pending_at = nowISO();
  job.pending_alasan = alasan;
  job.pending_dibayar = false;
  job.upah_pending = 0;
  job.pending_catatan_bayar = '';

  try {
    await Jobs.save({
      id: job.id,
      room_id: job.room_id,
      worker_id: job.worker_id,
      worker_nama: job.worker_nama,
      barang: job.barang,
      jenis: job.jenis,
      jumlah_ambil: job.jumlah_ambil,
      tarif: job.tarif,
      tgl_ambil: job.tgl_ambil,
      setoran: job.setoran,
      status: job.status,
      pending_at: job.pending_at,
      pending_alasan: job.pending_alasan,
      pending_dibayar: job.pending_dibayar,
      upah_pending: job.upah_pending,
      pending_catatan_bayar: job.pending_catatan_bayar,
    });

    window.closeModal('pendingModal');
    window.closeModal('ambilModal');
    toast('✓ ' + job.worker_nama + ' dipending');

    // Auto refresh modal ambil barang
    setTimeout(() => {
      window.openAmbilModal();
    }, 400);
  } catch(e){
    toast('Gagal pending: ' + e.message, true);
  }
};

window.openBayarPending = function(jobId){
  const job = S.jobs.find(j => j.id === jobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }
  if(job.status !== 'pending'){ toast('Job bukan pending', true); return; }
  if(job.pending_dibayar){ toast('Pending sudah dibayar', true); return; }

  S.currentJobId = jobId;

  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;

  $('bayarPendingInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(job.worker_nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(job.barang)} ${esc(job.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${job.jumlah_ambil} pcs</span></div>
    <div class="info-line"><span>Setor</span><span>${totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa</span><span style="color:var(--danger);">${sisa} pcs</span></div>
    <div class="info-line"><span>Alasan pending</span><span>${esc(job.pending_alasan || '-')}</span></div>
  `;

  const upahDefault = Math.round((job.jumlah_ambil / 12) * job.tarif);
  $('bp_jumlah').value = upahDefault;
  $('bp_catatan').value = 'Sudah dibayar, menunggu setor fisik';

  window.openModal('bayarPendingModal');
};

window.konfirmasiBayarPending = async function(){
  const job = S.jobs.find(j => j.id === S.currentJobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }
  if(job.pending_dibayar){ toast('Sudah dibayar', true); return; }

  const jumlah = parseFloat($('bp_jumlah').value);
  const catatan = $('bp_catatan').value.trim();

  if(!jumlah || jumlah <= 0){ toast('Nominal tidak valid', true); return; }
  if(!catatan){ toast('Isi catatan', true); return; }

  job.pending_dibayar = true;
  job.upah_pending = Math.round(jumlah);
  job.pending_catatan_bayar = catatan;

  // Catat transaksi
  const periode = periodeAktif();

  try {
    const tx = {
      id: uid(),
      room_id: S.room.id,
      worker_id: job.worker_id,
      job_id: job.id,
      jenis: 'pembayaran',
      jumlah: Math.round(jumlah),
      tgl: nowISO(),
      periode_id: periode ? periode.id : null,
      keterangan: 'Bayar pending: ' + catatan,
    };

    const savedTx = await Transactions.save(tx);
    S.transactions.push(savedTx);

    await Jobs.save({
      id: job.id,
      room_id: job.room_id,
      worker_id: job.worker_id,
      worker_nama: job.worker_nama,
      barang: job.barang,
      jenis: job.jenis,
      jumlah_ambil: job.jumlah_ambil,
      tarif: job.tarif,
      tgl_ambil: job.tgl_ambil,
      setoran: job.setoran,
      status: job.status,
      pending_at: job.pending_at,
      pending_alasan: job.pending_alasan,
      pending_dibayar: job.pending_dibayar,
      upah_pending: job.upah_pending,
      pending_catatan_bayar: job.pending_catatan_bayar,
    });

    window.closeModal('bayarPendingModal');
    toast('✓ Bayar pending ' + rp(jumlah));
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

window.openSetorFisik = function(jobId){
  const job = S.jobs.find(j => j.id === jobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }
  if(job.status !== 'pending'){ toast('Job bukan pending', true); return; }

  S.currentJobId = jobId;

  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;

  $('setorFisikInfo').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(job.worker_nama)}</span></div>
    <div class="info-line"><span>Barang</span><span>${esc(job.barang)} ${esc(job.jenis)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${job.jumlah_ambil} pcs</span></div>
    <div class="info-line"><span>Setor sebelumnya</span><span>${totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa</span><span style="color:var(--danger);">${sisa} pcs</span></div>
  `;

  $('sf_pcs').value = sisa;
  $('sf_alert').innerHTML = '';
  updateSetorFisikAlert();
  window.openModal('setorFisikModal');
};

function updateSetorFisikAlert(){
  const job = S.jobs.find(j => j.id === S.currentJobId);
  if(!job) return;
  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;
  const pcs = parseInt($('sf_pcs').value) || 0;

  if(pcs <= 0){
    $('sf_alert').innerHTML = '<div class="alert danger">Isi jumlah > 0</div>';
    return;
  }
  if(pcs > sisa){
    $('sf_alert').innerHTML = `<div class="alert danger">Melebihi sisa (${sisa} pcs)</div>`;
    return;
  }
  $('sf_alert').innerHTML = `<div class="alert ok">Sisa setelah setor: ${sisa - pcs} pcs</div>`;
}

window.konfirmasiSetorFisik = async function(){
  const job = S.jobs.find(j => j.id === S.currentJobId);
  if(!job){ toast('Job tidak ditemukan', true); return; }

  const pcs = parseInt($('sf_pcs').value);
  if(!pcs || pcs <= 0){ toast('Jumlah tidak valid', true); return; }

  const totalSetor = (job.setoran || []).reduce((s,x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;

  if(pcs > sisa){ toast('Melebihi sisa', true); return; }

  job.setoran = job.setoran || [];
  job.setoran.push({
    id: uid(),
    tgl: nowISO(),
    pcs,
    keterangan: 'Setor fisik (pending)',
    created_at: nowISO(),
  });

  const newTotal = job.setoran.reduce((s,x) => s + x.pcs, 0);
  if(newTotal >= job.jumlah_ambil){
    job.status = 'selesai';
  }

  try {
    await Jobs.save({
      id: job.id,
      room_id: job.room_id,
      worker_id: job.worker_id,
      worker_nama: job.worker_nama,
      barang: job.barang,
      jenis: job.jenis,
      jumlah_ambil: job.jumlah_ambil,
      tarif: job.tarif,
      tgl_ambil: job.tgl_ambil,
      setoran: job.setoran,
      status: job.status,
      pending_at: job.pending_at,
      pending_alasan: job.pending_alasan,
      pending_dibayar: job.pending_dibayar,
      upah_pending: job.upah_pending,
      pending_catatan_bayar: job.pending_catatan_bayar,
    });

    window.closeModal('setorFisikModal');
    toast('✓ Setor ' + pcs + ' pcs' + (job.status === 'selesai' ? ' — SELESAI' : ''));
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

/* ═══════════════════════════════════════════════════
   DETAIL JOB
   ═══════════════════════════════════════════════════ */
window.openDetailJob = function(jobId){
  const j = S.jobs.find(x => x.id === jobId);
  if(!j) return;
  const d = jobDerivasi(j);

  const setoranHtml = (j.setoran || []).length === 0
    ? '<div class="card-info">Belum ada setoran</div>'
    : j.setoran.map(s => `
      <div class="info-line"><span>${fmtDate(s.tgl)}</span><span>${s.pcs} pcs</span></div>
      ${s.keterangan ? `<div class="card-info" style="font-size:.7rem;">📝 ${esc(s.keterangan)}</div>` : ''}
    `).join('');

  const txs = S.transactions.filter(t => t.job_id === j.id);
  const txHtml = txs.length === 0
    ? '<div class="card-info">Belum ada transaksi</div>'
    : txs.map(t => `
      <div class="info-line">
        <span>${t.jenis === 'panjar' ? '🟡 Panjar' : '💰 Bayar'} — ${fmtDate(t.tgl)}</span>
        <span>${rp(t.jumlah)}</span>
      </div>
    `).join('');

  let pendingBlock = '';
  if(j.status === 'pending'){
    pendingBlock = `
      <div class="divider"></div>
      <div class="card-info" style="color:var(--danger);"><b>⏸️ STATUS PENDING</b></div>
      <div class="info-line"><span>Sejak</span><span>${fmtDate(j.pending_at)}</span></div>
      <div class="info-line"><span>Alasan</span><span>${esc(j.pending_alasan || '-')}</span></div>
      ${j.pending_dibayar ? `
        <div class="info-line"><span>Dibayar</span><span style="color:var(--ok);">${rp(j.upah_pending)}</span></div>
        <div class="info-line"><span>Catatan</span><span>${esc(j.pending_catatan_bayar || '-')}</span></div>
      ` : ''}
    `;
  }

  $('dj_title').textContent = j.barang + ' ' + j.jenis;
  $('dj_content').innerHTML = `
    <div class="info-line"><span>Pekerja</span><span>${esc(j.worker_nama)}</span></div>
    <div class="info-line"><span>Tanggal ambil</span><span>${fmtDate(j.tgl_ambil)}</span></div>
    <div class="info-line"><span>Ambil</span><span>${j.jumlah_ambil} pcs</span></div>
    <div class="info-line"><span>Tarif</span><span>${rp(j.tarif)}/lusin</span></div>
    ${pendingBlock}
    <div class="divider"></div>
    <div class="card-info"><b>SETORAN</b></div>
    ${setoranHtml}
    <div class="info-line total"><span>Total setor</span><span>${d.totalSetor} pcs</span></div>
    <div class="info-line"><span>Sisa</span><span style="color:var(--warn);">${d.sisaGantungan} pcs</span></div>
    <div class="divider"></div>
    <div class="card-info"><b>UPAH</b></div>
    <div class="info-line"><span>Upah hak</span><span>${rp(d.upahHak)}</span></div>
    <div class="info-line"><span>Panjar</span><span>${rp(d.totalPanjar)}</span></div>
    <div class="info-line"><span>Bayar</span><span>${rp(d.totalBayar)}</span></div>
    <div class="info-line total"><span>Sisa upah</span><span>${rp(d.sisaUpah)}</span></div>
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

  let totalAmbil = 0, totalSetor = 0, totalSisa = 0, totalPending = 0;
  jobsPeriode.forEach(j => {
    const d = jobDerivasi(j);
    if(isTglDalamPeriode(j.tgl_ambil, periode)) totalAmbil += j.jumlah_ambil;
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    if(j.status === 'pending') totalPending += d.sisaGantungan;
    else if(isTglDalamPeriode(j.tgl_ambil, periode)) totalSisa += d.sisaGantungan;
  });

  $('fisikStats').innerHTML = `
    <div class="stat-box"><div class="lbl">Diambil</div><div class="val">${totalAmbil} pcs</div></div>
    <div class="stat-box"><div class="lbl">Disetor</div><div class="val ok">${totalSetor} pcs</div></div>
    <div class="stat-box"><div class="lbl">Gantungan</div><div class="val warn">${totalSisa} pcs</div></div>
    <div class="stat-box"><div class="lbl">Pending</div><div class="val danger">${totalPending} pcs</div></div>
  `;

  const list = [...jobsPeriode].sort((a,b) => new Date(b.tgl_ambil) - new Date(a.tgl_ambil));
  if(list.length === 0){
    $('fisikTbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--dim);">Belum ada data</td></tr>';
    return;
  }

  $('fisikTbody').innerHTML = list.map(j => {
    const d = jobDerivasi(j);
    let statusBadge = '';
    if(j.status === 'pending') statusBadge = '<span class="badge danger">PENDING</span>';
    else if(d.statusFisik === 'aktif') statusBadge = '<span class="badge blue">AKTIF</span>';
    else if(d.statusFisik === 'gantungan') statusBadge = '<span class="badge warn">GANTUNGAN</span>';
    else if(d.statusFisik === 'selesai') statusBadge = '<span class="badge ok">SELESAI</span>';

    return `<tr>
      <td>${fmtDate(j.tgl_ambil)}</td>
      <td>${esc(j.worker_nama)}</td>
      <td>${esc(j.barang)} ${esc(j.jenis)}</td>
      <td>${j.jumlah_ambil}</td>
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
    if(wFilter && j.worker_id !== wFilter) return;
    const setorPeriode = (j.setoran || [])
      .filter(s => isTglDalamPeriode(s.tgl, periode))
      .reduce((s,x) => s + x.pcs, 0);

    const upahSetor = hitungUpah(setorPeriode, j.tarif);
    const upahPending = (j.status === 'pending' && j.pending_dibayar) ? (j.upah_pending || 0) : 0;
    const upahTotal = Math.max(upahSetor, upahPending);

    if(upahTotal === 0 && setorPeriode === 0) return;

    const panjarJob = txPeriode.filter(t => t.job_id === j.id && t.jenis === 'panjar').reduce((s,t) => s + Number(t.jumlah), 0);
    const bayarJob = txPeriode.filter(t => t.job_id === j.id && t.jenis === 'pembayaran').reduce((s,t) => s + Number(t.jumlah), 0);

    if(!byWorker[j.worker_id]) byWorker[j.worker_id] = { nama: j.worker_nama, upahHak: 0, panjar: 0, bayar: 0 };
    byWorker[j.worker_id].upahHak += upahTotal;
    byWorker[j.worker_id].panjar += panjarJob;
    byWorker[j.worker_id].bayar += bayarJob;
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
  if(wFilter) txs = txs.filter(t => t.worker_id === wFilter);
  txs.sort((a,b) => new Date(b.tgl) - new Date(a.tgl));

  if(txs.length === 0){
    $('transaksiList').innerHTML = '<div class="empty" style="padding:16px;">Belum ada transaksi</div>';
  } else {
    $('transaksiList').innerHTML = txs.slice(0,30).map(t => {
      const w = S.workers.find(x => x.id === t.worker_id);
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

  const jobsPeriode = S.jobs.filter(j => j.worker_id === workerId && jobAdaDiPeriode(j, periode));
  if(jobsPeriode.length === 0){ toast('Belum ada pekerjaan', true); return; }

  let totalHak = 0, totalPanjar = 0, totalBayar = 0;
  const rows = jobsPeriode.map(j => {
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, periode)).reduce((s,x) => s + x.pcs, 0);
    const upahSetor = hitungUpah(setorPeriode, j.tarif);
    const upahPending = (j.status === 'pending' && j.pending_dibayar) ? (j.upah_pending || 0) : 0;
    const upahHak = Math.max(upahSetor, upahPending);
    const panjar = S.transactions.filter(t => t.job_id === j.id && t.jenis === 'panjar' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + Number(t.jumlah), 0);
    const bayar = S.transactions.filter(t => t.job_id === j.id && t.jenis === 'pembayaran' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + Number(t.jumlah), 0);
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

  const jobsPeriode = S.jobs.filter(j => j.worker_id === workerId && jobAdaDiPeriode(j, periode));
  if(jobsPeriode.length === 0){ toast('Belum ada pekerjaan', true); return; }

  const rows = jobsPeriode.map(j => {
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, periode)).reduce((s,x) => s + x.pcs, 0);
    const upahSetor = hitungUpah(setorPeriode, j.tarif);
    const upahPending = (j.status === 'pending' && j.pending_dibayar) ? (j.upah_pending || 0) : 0;
    const upahHak = Math.max(upahSetor, upahPending);
    const panjar = S.transactions.filter(t => t.job_id === j.id && t.jenis === 'panjar' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + Number(t.jumlah), 0);
    const bayar = S.transactions.filter(t => t.job_id === j.id && t.jenis === 'pembayaran' && txAdaDiPeriode(t, periode)).reduce((s,t) => s + Number(t.jumlah), 0);
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
            <td>${esc(r.j.barang)} ${esc(r.j.jenis)}${r.j.status === 'pending' ? ' ⏸️' : ''}</td>
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
    const pendingCount = S.jobs.filter(j => j.worker_id === w.id && j.status === 'pending').length;

    let badge = w.aktif
      ? (terkunci ? `<span class="badge warn">${gantunganPcs} pcs gantungan</span>` : '<span class="badge ok">TERSEDIA</span>')
      : '<span class="badge dim">NONAKTIF</span>';

    return `<div class="card" style="padding:9px 11px;">
      <div class="card-name" style="font-size:.92rem;">${esc(w.nama)}</div>
      <div class="card-info">${w.telepon ? '📞 ' + esc(w.telepon) : '(tanpa telepon)'} ${badge}</div>
      ${pendingCount > 0 ? `<div class="card-info" style="color:var(--danger);">⏸️ ${pendingCount} job pending</div>` : ''}
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

window.simpanWorker = async function(){
  const nama = $('wm_nama').value.trim();
  const telepon = $('wm_telepon').value.trim();
  const aktif = $('wm_aktif').value === 'true';

  if(!nama){ toast('Isi nama', true); return; }

  try {
    if(S.editingWorkerId){
      const w = S.workers.find(x => x.id === S.editingWorkerId);
      w.nama = nama;
      w.telepon = telepon;
      w.aktif = aktif;
      await Workers.save({
        id: w.id,
        room_id: S.room.id,
        nama, telepon, aktif,
      });
    } else {
      const w = {
        id: uid(),
        room_id: S.room.id,
        nama, telepon, aktif,
      };
      const saved = await Workers.save(w);
      S.workers.push(saved);
    }
    window.closeModal('workerModal');
    toast('✓ Tersimpan');
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

window.hapusWorker = async function(id){
  const jobs = S.jobs.filter(j => j.worker_id === id);
  if(jobs.length > 0){
    if(!confirm(`Pekerja ini punya ${jobs.length} riwayat pekerjaan.\nHapus pekerja TANPA hapus riwayat?`)) return;
  } else {
    if(!confirm('Hapus pekerja ini?')) return;
  }
  try {
    await Workers.delete(id);
    S.workers = S.workers.filter(w => w.id !== id);
    toast('Pekerja dihapus');
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
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

window.simpanPeriode = async function(){
  const p = periodeAktif();
  const m = $('pm_mulai').value;
  const a = $('pm_akhir').value;
  if(!m || !a){ toast('Isi tanggal', true); return; }
  if(m > a){ toast('Mulai harus ≤ akhir', true); return; }

  try {
    p.mulai = m; p.akhir = a;
    await Periods.save({
      id: p.id,
      room_id: S.room.id,
      mulai: p.mulai,
      akhir: p.akhir,
      status: p.status,
      snapshot: p.snapshot,
      closed_at: p.closed_at,
    });
    window.closeModal('periodeModal');
    toast('✓ Periode diubah');
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

window.tutupPeriode = async function(){
  const p = periodeAktif();
  const aktifJobs = S.jobs.filter(j => j.status !== 'selesai');
  let msg = 'Tutup periode dan buka periode baru?';
  if(aktifJobs.length > 0){
    msg = `Masih ada ${aktifJobs.length} pekerjaan belum selesai.\nPekerjaan akan tetap tercatat dan muncul di periode berikutnya.\n\nTetap tutup?`;
  }
  if(!confirm(msg)) return;

  try {
    p.status = 'ditutup';
    p.closed_at = nowISO();
    p.snapshot = hitungSnapshot(p);

    await Periods.save({
      id: p.id,
      room_id: S.room.id,
      mulai: p.mulai,
      akhir: p.akhir,
      status: p.status,
      snapshot: p.snapshot,
      closed_at: p.closed_at,
    });

    const baru = hitungPeriodeBaruSetelah(p.akhir);
    const newPeriod = {
      id: uid(),
      room_id: S.room.id,
      mulai: baru.mulai,
      akhir: baru.akhir,
      status: 'aktif',
      created_at: nowISO(),
      closed_at: null,
      snapshot: null,
    };
    await Periods.save(newPeriod);
    S.periods.push(newPeriod);

    toast('✓ Periode ditutup, periode baru dibuka');
    renderAllRoom();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

function hitungSnapshot(p){
  const jobsPeriode = S.jobs.filter(j => jobAdaDiPeriode(j, p));
  const txPeriode = S.transactions.filter(t => txAdaDiPeriode(t, p));
  let totalAmbil = 0, totalSetor = 0, totalGantungan = 0;
  let totalUpahHak = 0, totalPanjar = 0, totalBayar = 0;

  jobsPeriode.forEach(j => {
    if(isTglDalamPeriode(j.tgl_ambil, p)){
      totalAmbil += j.jumlah_ambil;
      totalGantungan += jobDerivasi(j).sisaGantungan;
    }
    const setorPeriode = (j.setoran || []).filter(s => isTglDalamPeriode(s.tgl, p)).reduce((s,x) => s + x.pcs, 0);
    totalSetor += setorPeriode;
    totalUpahHak += hitungUpah(setorPeriode, j.tarif);
  });

  txPeriode.forEach(t => {
    if(t.jenis === 'panjar') totalPanjar += Number(t.jumlah);
    if(t.jenis === 'pembayaran') totalBayar += Number(t.jumlah);
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

window.simpanTarif = async function(){
  const t = parseFloat($('tm_tarif').value);
  if(!t || t <= 0){ toast('Tarif tidak valid', true); return; }

  try {
    S.tarif.tarif = Math.round(t);
    await Tarifs.save(S.room.id, S.tarif.tarif);
    window.closeModal('tarifModal');
    toast('✓ Tarif disimpan');
    renderTarif();
  } catch(e){
    toast('Gagal: ' + e.message, true);
  }
};

/* ═══════════════════════════════════════════════════
   BACKUP / RESTORE
   ═══════════════════════════════════════════════════ */
window.backupJSON = function(){
  const data = {
    version: 'kh-2.0',
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
      S.jobs = (data.jobs || []).map(normalizeJobFromDB);
      S.transactions = data.transactions || [];
      S.periods = data.periods || [];
      S.tarif = data.tarif || { tarif: 8000 };
      toast('✓ Data dipulihkan di layar. Backup lokal lama masih tersimpan.');
      renderAllRoom();
    } catch(err){
      toast('File rusak', true);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
};

window.resetRoomData = function(){
  if(!confirm('Reset TIDAK disarankan. Data di Supabase tetap utuh.\nCukup logout dan login ulang.\n\nLanjut reset tampilan?')) return;
  location.reload();
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
   RENDER ALL
   ═══════════════════════════════════════════════════ */
function renderAllRoom(){
  if(!S.room) return;
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
window.addEventListener('DOMContentLoaded', async () => {
  tick(); setInterval(tick, 1000);

  // Event listeners
  $('am_jumlah').addEventListener('input', updateAmbilPreview);
  $('am_tarif').addEventListener('input', updateAmbilPreview);
  $('st_pcs').addEventListener('input', updateSetorAlert);
  $('pj_jumlah').addEventListener('input', updatePanjarAlert);
  $('by_jumlah').addEventListener('input', updateBayarAlert);

  const sfPcs = $('sf_pcs');
  if(sfPcs) sfPcs.addEventListener('input', updateSetorFisikAlert);

  $('loginPassword').addEventListener('keydown', e => {
    if(e.key === 'Enter') $('btnLogin').click();
  });

  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if(e.target === bg) bg.classList.remove('show'); });
  });

  // Cek session
  try {
    const user = await Auth.currentUser();
    if(user){
      S.user = user;
      S.profile = await Profiles.get(user.id);
      if(S.profile){
        if(S.profile.role === 'super_admin'){
          await loadSuperAdmin();
          showPage('page-superadmin');
        } else {
          await loadRoomPicker();
          showPage('page-roompicker');
        }
      } else {
        showPage('page-login');
      }
    } else {
      showPage('page-login');
    }
  } catch(e){
    console.warn('Session check error', e);
    showPage('page-login');
  }

  $('bootScreen').style.display = 'none';
});
