/* ═══════════════════════════════════════════════════
   KONVEKSI HUB v2 — Jobs Module
   CRUD job, setoran, pending, timeline, bayar
   ═══════════════════════════════════════════════════ */

import { Jobs, Transactions, Workers, hitungUpah } from './supabase.js';
import { STATUS_JOB, PENDING_WARNING_HARI } from './config.js';

/* ═══════ UTIL ═══════ */
export function uid(){
  return crypto.randomUUID();
}

export function todayISO(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

export function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  const b = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return d.getDate() + ' ' + b[d.getMonth()] + ' ' + d.getFullYear();
}

export function rp(n){
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

/* ═══════ DERIVASI JOB ═══════ */
export function jobDerivasi(job, transactions){
  const totalSetor = (job.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
  const sisaGantungan = Math.max(0, job.jumlah_ambil - totalSetor);

  const upahSetor = hitungUpah(totalSetor, job.tarif);
  const upahAmbil = hitungUpah(job.jumlah_ambil, job.tarif);
  const upahHak = job.status === 'pending' && job.pending_dibayar
    ? (job.upah_pending || 0)
    : upahSetor;

  const txs = (transactions || []).filter(t => t.job_id === job.id);
  const totalPanjar = txs.filter(t => t.jenis === 'panjar').reduce((s, t) => s + Number(t.jumlah || 0), 0);
  const totalBayar = txs.filter(t => t.jenis === 'pembayaran').reduce((s, t) => s + Number(t.jumlah || 0), 0);
  const sisaUpah = Math.max(0, upahHak - totalPanjar - totalBayar);
  const lebihBayar = Math.max(0, totalPanjar + totalBayar - upahHak);

  let statusFisik = 'aktif';
  if(job.status === 'pending'){
    statusFisik = 'pending';
  } else if(totalSetor > 0 && totalSetor < job.jumlah_ambil){
    statusFisik = 'gantungan';
  } else if(totalSetor >= job.jumlah_ambil){
    statusFisik = 'selesai';
  }

  return {
    totalSetor, sisaGantungan,
    upahSetor, upahAmbil, upahHak,
    totalPanjar, totalBayar, sisaUpah, lebihBayar,
    statusFisik,
  };
}

/* ═══════ TUKANG TERKUNCI ═══════ */
export function isWorkerTerkunci(workerId, jobs){
  return jobs.some(j =>
    j.worker_id === workerId &&
    j.status !== 'selesai' &&
    j.status !== 'pending'
  );
}

/* ═══════ DURASI PENDING ═══════ */
export function durasiPendingHari(job){
  if(job.status !== 'pending' || !job.pending_at) return 0;
  const diff = Date.now() - new Date(job.pending_at).getTime();
  return Math.floor(diff / 86400000);
}

export function isPendingLewat(job){
  return durasiPendingHari(job) > PENDING_WARNING_HARI;
}

/* ═══════ AMBIL BARANG ═══════ */
export async function ambilBarang({ roomId, worker, barang, jenis, jumlah, tarif, tgl }){
  if(!worker) throw new Error('Pilih pekerja');
  if(!barang) throw new Error('Isi nama barang');
  if(!jumlah || jumlah <= 0) throw new Error('Jumlah tidak valid');
  if(!tarif || tarif <= 0) throw new Error('Tarif tidak valid');
  if(!tgl) throw new Error('Pilih tanggal');

  const job = {
    id: uid(),
    room_id: roomId,
    worker_id: worker.id,
    worker_nama: worker.nama,
    barang,
    jenis,
    jumlah_ambil: jumlah,
    tarif,
    tgl_ambil: tgl + 'T00:00:00.000+07:00',
    setoran: [],
    status: STATUS_JOB.AKTIF,
  };

  return await Jobs.save(job);
}

/* ═══════ SETOR ═══════ */
export async function setorBarang({ job, pcs, tgl, keterangan }){
  if(!pcs || pcs <= 0) throw new Error('Jumlah tidak valid');
  if(!tgl) throw new Error('Pilih tanggal');

  const totalSetor = (job.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;
  if(pcs > sisa) throw new Error(`Melebihi sisa gantungan (${sisa} pcs)`);

  const newSetoran = [...(job.setoran || []), {
    id: uid(),
    tgl: tgl + 'T00:00:00.000+07:00',
    pcs,
    keterangan: keterangan || '',
    created_at: new Date().toISOString(),
  }];

  const newTotal = newSetoran.reduce((s, x) => s + x.pcs, 0);
  const newStatus = newTotal >= job.jumlah_ambil ? STATUS_JOB.SELESAI : STATUS_JOB.GANTUNGAN;

  const updated = {
    ...job,
    setoran: newSetoran,
    status: newStatus,
  };

  return await Jobs.save(updated);
}

/* ═══════ PENDING ═══════ */
export async function pendingJob({ job, alasan }){
  if(!alasan || !alasan.trim()) throw new Error('Isi alasan pending');

  const updated = {
    ...job,
    status: STATUS_JOB.PENDING,
    pending_at: new Date().toISOString(),
    pending_alasan: alasan.trim(),
    pending_dibayar: false,
    upah_pending: 0,
    pending_catatan_bayar: '',
  };

  return await Jobs.save(updated);
}

/* ═══════ BAYAR PENDING ═══════ */
export async function bayarPending({ job, jumlah, catatan, roomId, periodeId }){
  if(!jumlah || jumlah <= 0) throw new Error('Nominal tidak valid');
  if(!catatan || !catatan.trim()) throw new Error('Isi catatan');
  if(job.pending_dibayar) throw new Error('Pending sudah dibayar');

  // Catat transaksi
  const tx = {
    id: uid(),
    room_id: roomId,
    worker_id: job.worker_id,
    job_id: job.id,
    jenis: 'pembayaran',
    jumlah: Math.round(jumlah),
    tgl: new Date().toISOString(),
    periode_id: periodeId || null,
    keterangan: 'Bayar pending: ' + catatan.trim(),
  };
  const savedTx = await Transactions.save(tx);

  // Update job
  const updated = {
    ...job,
    pending_dibayar: true,
    upah_pending: Math.round(jumlah),
    pending_catatan_bayar: catatan.trim(),
  };
  const savedJob = await Jobs.save(updated);

  return { job: savedJob, tx: savedTx };
}

/* ═══════ SETOR FISIK PENDING ═══════ */
export async function setorFisikPending({ job, pcs }){
  if(!pcs || pcs <= 0) throw new Error('Jumlah tidak valid');
  if(job.status !== 'pending') throw new Error('Job bukan pending');

  const totalSetor = (job.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
  const sisa = job.jumlah_ambil - totalSetor;
  if(pcs > sisa) throw new Error(`Melebihi sisa (${sisa} pcs)`);

  const newSetoran = [...(job.setoran || []), {
    id: uid(),
    tgl: new Date().toISOString(),
    pcs,
    keterangan: 'Setor fisik (pending)',
    created_at: new Date().toISOString(),
  }];

  const newTotal = newSetoran.reduce((s, x) => s + x.pcs, 0);
  const newStatus = newTotal >= job.jumlah_ambil ? STATUS_JOB.SELESAI : STATUS_JOB.PENDING;

  const updated = {
    ...job,
    setoran: newSetoran,
    status: newStatus,
  };

  return await Jobs.save(updated);
}

/* ═══════ BAYAR (normal — dari setor atau ambil) ═══════ */
export async function bayarUpah({ job, jumlah, tgl, keterangan, basis, roomId, periodeId, transactions }){
  const d = jobDerivasi(job, transactions);
  if(!jumlah || jumlah <= 0) throw new Error('Jumlah tidak valid');
  if(jumlah > d.sisaUpah) throw new Error(`Melebihi sisa upah (${rp(d.sisaUpah)})`);

  const basisLabel = basis === 'ambil' ? '[Ambil] ' : '[Setor] ';
  const tx = {
    id: uid(),
    room_id: roomId,
    worker_id: job.worker_id,
    job_id: job.id,
    jenis: 'pembayaran',
    jumlah: Math.round(jumlah),
    tgl: (tgl || todayISO()) + 'T00:00:00.000+07:00',
    periode_id: periodeId || null,
    keterangan: basisLabel + (keterangan || ''),
  };
  return await Transactions.save(tx);
}

/* ═══════ PANJAR ═══════ */
export async function panjar({ job, jumlah, tgl, keterangan, roomId, periodeId }){
  if(!jumlah || jumlah <= 0) throw new Error('Jumlah tidak valid');

  // Batas panjar: potensi upah dari jumlah_ambil
  const potensiUpah = hitungUpah(job.jumlah_ambil, job.tarif);
  const existingPanjar = job._totalPanjar || 0;
  const sisaBisaPanjar = Math.max(0, potensiUpah - existingPanjar);

  if(jumlah > sisaBisaPanjar) throw new Error(`Melebihi batas panjar (${rp(sisaBisaPanjar)})`);

  const tx = {
    id: uid(),
    room_id: roomId,
    worker_id: job.worker_id,
    job_id: job.id,
    jenis: 'panjar',
    jumlah: Math.round(jumlah),
    tgl: (tgl || todayISO()) + 'T00:00:00.000+07:00',
    periode_id: periodeId || null,
    keterangan: keterangan || '',
  };
  return await Transactions.save(tx);
}

/* ═══════ RENDER: CARD JOB ═══════ */
export function renderJobCard(job, transactions){
  const d = jobDerivasi(job, transactions);
  const progress = job.jumlah_ambil > 0 ? Math.min(100, (d.totalSetor / job.jumlah_ambil) * 100) : 0;

  let badge = '';
  if(job.status === 'pending'){
    badge = '<span class="badge danger">⏸️ PENDING</span>';
  } else if(d.statusFisik === 'aktif'){
    badge = '<span class="badge blue">AKTIF</span>';
  } else if(d.statusFisik === 'gantungan'){
    badge = '<span class="badge warn">GANTUNGAN</span>';
  } else if(d.statusFisik === 'selesai'){
    badge = '<span class="badge ok">SELESAI</span>';
  }

  let pendingInfo = '';
  if(job.status === 'pending'){
    const hari = durasiPendingHari(job);
    const lewat = isPendingLewat(job);
    pendingInfo = `
      <div class="card-info" style="color:var(--danger);">
        ⏸️ Pending ${hari} hari${lewat ? ' ⚠️ (melebihi 30 hari)' : ''}
      </div>
      <div class="card-info" style="font-size:0.72rem;">
        Alasan: ${escapeHtml(job.pending_alasan || '-')}
      </div>
      ${job.pending_dibayar ? `<div class="card-info" style="color:var(--ok);">✅ Sudah dibayar ${rp(job.upah_pending)}</div>` : ''}
    `;
  }

  let gajiInfo = '';
  if(d.upahHak > 0 || d.totalPanjar > 0 || d.totalBayar > 0){
    gajiInfo = `
      <div class="card-info">💰 Upah: <b>${rp(d.upahHak)}</b></div>
      ${d.totalPanjar > 0 ? `<div class="card-info">🟡 Panjar: <b>${rp(d.totalPanjar)}</b></div>` : ''}
      ${d.totalBayar > 0 ? `<div class="card-info">✅ Bayar: <b>${rp(d.totalBayar)}</b></div>` : ''}
      ${d.sisaUpah > 0 ? `<div class="card-info" style="color:var(--warn);font-weight:700;">💵 Sisa: ${rp(d.sisaUpah)}</div>` : ''}
    `;
  }

  let actions = '';
  if(job.status === 'pending'){
    if(!job.pending_dibayar){
      actions += `<button class="btn btn-warn btn-sm" onclick="openBayarPending('${job.id}')">💰 Bayar Pending</button>`;
    }
    actions += `<button class="btn btn-done btn-sm" onclick="openSetorFisik('${job.id}')">📦 Setor Fisik</button>`;
  } else if(d.statusFisik !== 'selesai'){
    actions += `<button class="btn btn-done btn-sm" onclick="openSetor('${job.id}')">📦 Setor</button>`;
    actions += `<button class="btn btn-warn btn-sm" onclick="openPending('${job.id}')">⏸️ Pending</button>`;
    if(d.sisaUpah > 0){
      actions += `<button class="btn btn-primary btn-sm" onclick="openBayar('${job.id}')">💰 Bayar</button>`;
    }
  }

  const cls = job.status === 'pending' ? 'danger'
    : d.statusFisik === 'selesai' ? 'done'
    : d.statusFisik === 'gantungan' ? 'gantung' : '';

  return `
    <div class="card ${cls}">
      <div class="card-head">
        <span class="card-code">${escapeHtml(job.barang)} ${escapeHtml(job.jenis)}</span>
        ${badge}
      </div>
      <div class="card-name">${escapeHtml(job.worker_nama)}</div>
      <div class="card-info">📅 ${fmtDate(job.tgl_ambil)} • 🎯 ${job.jumlah_ambil} pcs @ ${rp(job.tarif)}/lusin</div>
      <div class="card-info">📦 Setor: <b>${d.totalSetor} pcs</b> • Sisa: <b>${d.sisaGantungan} pcs</b></div>
      <div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div>
      ${pendingInfo}
      ${gajiInfo}
      <div style="margin-top:8px;">
        ${actions}
        <a href="job-detail.html?id=${job.id}" class="btn btn-ghost btn-sm">📄 Detail</a>
      </div>
    </div>
  `;
}

/* ═══════ HELPER ═══════ */
export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
