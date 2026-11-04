/* ═══════════════════════════════════════════════════
   KONVEKSI HUB v2 — Workers Module (HRIS)
   CRUD pekerja + profil + riwayat kerja + riwayat upah
   ═══════════════════════════════════════════════════ */

import { Workers, Jobs, Transactions, hitungUpah } from './supabase.js';

/* ═══════ UTIL ═══════ */
export function uid(){
  return crypto.randomUUID();
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

export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function todayISO(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

/* ═══════ DERIVASI PEKERJA ═══════ */
export function pekerjaDerivasi(worker, jobs, transactions){
  const myJobs = jobs.filter(j => j.worker_id === worker.id);
  const myTx = transactions.filter(t => t.worker_id === worker.id);

  let total_ambil = 0;
  let total_setor = 0;
  let total_pending = 0;
  let di_tangan = 0;
  let upah_hak = 0;

  myJobs.forEach(j => {
    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const sisa = Math.max(0, j.jumlah_ambil - setor);

    total_ambil += j.jumlah_ambil;
    total_setor += setor;
    if(j.status === 'pending') total_pending += sisa;
    else if(j.status !== 'selesai') di_tangan += sisa;

    upah_hak += hitungUpah(setor, j.tarif);
  });

  let total_panjar = 0;
  let total_bayar = 0;
  myTx.forEach(t => {
    if(t.jenis === 'panjar') total_panjar += Number(t.jumlah || 0);
    if(t.jenis === 'pembayaran') total_bayar += Number(t.jumlah || 0);
  });

  return {
    total_kerja: myJobs.length,
    total_ambil,
    total_setor,
    total_pending,
    di_tangan,
    upah_hak,
    total_panjar,
    total_bayar,
    sisa_upah: Math.max(0, upah_hak - total_panjar - total_bayar),
    jobs: myJobs,
    transactions: myTx,
  };
}

/* ═══════ BEBAN PEKERJA ═══════ */
export function bebanPekerja(worker, jobs){
  const myJobs = jobs.filter(j => j.worker_id === worker.id && j.status !== 'selesai');
  let beban = 0;
  let pending = 0;
  myJobs.forEach(j => {
    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const sisa = Math.max(0, j.jumlah_ambil - setor);
    if(j.status === 'pending') pending += sisa;
    else beban += sisa;
  });
  return { beban, pending, jumlah_job: myJobs.length };
}

/* ═══════ STATUS TERKUNCI ═══════ */
export function isTerkunci(worker, jobs){
  return jobs.some(j =>
    j.worker_id === worker.id &&
    j.status !== 'selesai' &&
    j.status !== 'pending'
  );
}

/* ═══════ CEK BISA DIHAPUS ═══════ */
export function bisaDihapus(worker, jobs){
  return !jobs.some(j => j.worker_id === worker.id);
}

/* ═══════ CRUD ═══════ */
export async function tambahPekerja({ roomId, nama, telepon, tgl_mulai }){
  if(!nama || !nama.trim()) throw new Error('Nama wajib diisi');

  const worker = {
    id: uid(),
    room_id: roomId,
    nama: nama.trim(),
    telepon: telepon ? telepon.trim() : null,
    tgl_mulai: tgl_mulai || null,
    aktif: true,
  };

  return await Workers.save(worker);
}

export async function ubahPekerja({ worker, nama, telepon, tgl_mulai, aktif }){
  if(!nama || !nama.trim()) throw new Error('Nama wajib diisi');

  const updated = {
    ...worker,
    nama: nama.trim(),
    telepon: telepon ? telepon.trim() : null,
    tgl_mulai: tgl_mulai || null,
    aktif: aktif !== false,
  };

  return await Workers.save(updated);
}

export async function nonaktifkanPekerja({ worker }){
  const updated = { ...worker, aktif: false };
  return await Workers.save(updated);
}

export async function hapusPekerja({ worker, jobs }){
  if(!bisaDihapus(worker, jobs)){
    throw new Error('Pekerja masih punya riwayat pekerjaan. Nonaktifkan saja, jangan hapus.');
  }
  await Workers.delete(worker.id);
}

/* ═══════ RENDER: CARD PEKERJA ═══════ */
export function renderWorkerCard(worker, jobs){
  const terkunci = isTerkunci(worker, jobs);
  const beban = bebanPekerja(worker, jobs);

  let badge = '';
  if(!worker.aktif){
    badge = '<span class="badge dim">NONAKTIF</span>';
  } else if(terkunci){
    badge = `<span class="badge warn">TERKUNCI (${beban.beban} pcs)</span>`;
  } else {
    badge = '<span class="badge ok">TERSEDIA</span>';
  }

  const tglMulai = worker.tgl_mulai ? `📅 Mulai: ${fmtDate(worker.tgl_mulai)}` : '📅 Tanggal mulai belum diisi';

  return `
    <div class="card">
      <div class="card-name">${escapeHtml(worker.nama)} ${badge}</div>
      <div class="card-info">📞 ${worker.telepon ? escapeHtml(worker.telepon) : '(tanpa telepon)'}</div>
      <div class="card-info">${tglMulai}</div>
      ${beban.beban > 0 || beban.pending > 0 ? `
        <div class="card-info">
          📦 Beban: <b>${beban.beban} pcs</b>${beban.pending > 0 ? ` • Pending: <b>${beban.pending} pcs</b>` : ''}
        </div>
      ` : ''}
      <div style="margin-top:8px;">
        <a href="worker-detail.html?id=${worker.id}" class="btn btn-ghost btn-sm">👤 Lihat Profil</a>
        <button class="btn btn-ghost btn-sm" onclick="openUbahWorker('${worker.id}')">✏️ Ubah</button>
        ${bisaDihapus(worker, jobs)
          ? `<button class="btn btn-danger btn-sm" onclick="openHapusWorker('${worker.id}')">🗑️ Hapus</button>`
          : ''}
      </div>
    </div>
  `;
}
