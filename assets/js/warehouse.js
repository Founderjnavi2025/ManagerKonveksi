/* ═══════════════════════════════════════════════════
   KONVEKSI HUB v2 — Warehouse Module (WMS Derived)
   Posisi barang derived dari jobs. Read-only.
   ═══════════════════════════════════════════════════ */

import { Jobs, Workers, hitungUpah } from './supabase.js';

/* ═══════ UTIL ═══════ */
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

/* ═══════ POSISI BARANG (DERIVED) ═══════ */
/**
 * Ringkasan posisi barang per room.
 * Tidak ada gudang fisik — semua derived dari jobs.
 */
export function posisiBarang(jobs){
  let di_tukang = 0;
  let pending = 0;
  let selesai = 0;
  let total_ambil = 0;

  jobs.forEach(j => {
    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const sisa = Math.max(0, j.jumlah_ambil - setor);

    total_ambil += j.jumlah_ambil;

    if(j.status === 'pending'){
      pending += sisa;
    } else if(j.status === 'selesai' || setor >= j.jumlah_ambil){
      selesai += setor;
    } else {
      di_tukang += sisa;
      selesai += setor;
    }
  });

  return { di_tukang, pending, selesai, total_ambil };
}

/**
 * Posisi barang per pekerja.
 */
export function posisiPerPekerja(jobs, workers){
  const byWorker = {};

  workers.forEach(w => {
    byWorker[w.id] = {
      worker_id: w.id,
      worker_nama: w.nama,
      di_tukang: 0,
      pending: 0,
      selesai: 0,
      total_ambil: 0,
      total_setor: 0,
      job_count: 0,
    };
  });

  jobs.forEach(j => {
    if(!byWorker[j.worker_id]){
      byWorker[j.worker_id] = {
        worker_id: j.worker_id,
        worker_nama: j.worker_nama,
        di_tukang: 0,
        pending: 0,
        selesai: 0,
        total_ambil: 0,
        total_setor: 0,
        job_count: 0,
      };
    }
    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const sisa = Math.max(0, j.jumlah_ambil - setor);
    const w = byWorker[j.worker_id];

    w.total_ambil += j.jumlah_ambil;
    w.total_setor += setor;
    w.job_count += 1;

    if(j.status === 'pending'){
      w.pending += sisa;
    } else if(j.status === 'selesai' || setor >= j.jumlah_ambil){
      w.selesai += setor;
    } else {
      w.di_tukang += sisa;
      w.selesai += setor;
    }
  });

  return Object.values(byWorker).filter(w => w.job_count > 0 || w.total_ambil > 0);
}

/**
 * Riwayat movement derived (dari jobs + setoran[]).
 * Tidak ada tabel movement — semua derived.
 */
export function riwayatMovement(jobs){
  const movements = [];

  jobs.forEach(j => {
    // Event: Ambil
    movements.push({
      tgl: j.tgl_ambil,
      tipe: 'ambil',
      label: 'Ambil barang',
      worker_nama: j.worker_nama,
      barang: j.barang + ' ' + j.jenis,
      pcs: j.jumlah_ambil,
      job_id: j.id,
      keterangan: '',
    });

    // Event: Setoran
    (j.setoran || []).forEach(s => {
      movements.push({
        tgl: s.tgl,
        tipe: 'setor',
        label: 'Setor',
        worker_nama: j.worker_nama,
        barang: j.barang + ' ' + j.jenis,
        pcs: s.pcs,
        job_id: j.id,
        keterangan: s.keterangan || '',
      });
    });

    // Event: Pending
    if(j.status === 'pending' && j.pending_at){
      const totalSetor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
      const sisa = Math.max(0, j.jumlah_ambil - totalSetor);
      movements.push({
        tgl: j.pending_at,
        tipe: 'pending',
        label: 'Pending',
        worker_nama: j.worker_nama,
        barang: j.barang + ' ' + j.jenis,
        pcs: sisa,
        job_id: j.id,
        keterangan: j.pending_alasan || '',
      });
    }
  });

  movements.sort((a, b) => new Date(b.tgl) - new Date(a.tgl));
  return movements;
}

/* ═══════ RENDER HELPERS ═══════ */
export function renderStatPosisi(ringkasan){
  return `
    <div class="stat-grid">
      <div class="stat-box warn">
        <div class="lbl">Di Tukang</div>
        <div class="val warn">${ringkasan.di_tukang} pcs</div>
      </div>
      <div class="stat-box danger">
        <div class="lbl">Pending</div>
        <div class="val danger">${ringkasan.pending} pcs</div>
      </div>
      <div class="stat-box ok">
        <div class="lbl">Selesai</div>
        <div class="val ok">${ringkasan.selesai} pcs</div>
      </div>
      <div class="stat-box">
        <div class="lbl">Total Ambil</div>
        <div class="val">${ringkasan.total_ambil} pcs</div>
      </div>
    </div>
  `;
}

export function renderPekerjaPosisi(pekerja){
  if(pekerja.length === 0){
    return '<div class="empty"><span class="big">👷</span>Belum ada data pekerja</div>';
  }

  return pekerja.map(w => `
    <a href="worker-detail.html?id=${w.worker_id}" class="card" style="text-decoration:none;display:block;color:inherit;">
      <div class="card-name">${escapeHtml(w.worker_nama)}</div>
      <div class="card-info">
        📦 Di Tukang: <b>${w.di_tukang} pcs</b>
        • Pending: <b>${w.pending} pcs</b>
        • Selesai: <b>${w.selesai} pcs</b>
      </div>
      <div class="card-info" style="font-size:0.72rem;">
        ${w.job_count} job • Total ambil ${w.total_ambil} pcs
      </div>
    </a>
  `).join('');
}

export function renderRiwayatMovement(movements, limit = 50){
  if(movements.length === 0){
    return '<div class="empty"><span class="big">📋</span>Belum ada movement</div>';
  }

  const sliced = movements.slice(0, limit);

  return sliced.map(m => {
    let icon = '📦';
    let cls = '';
    if(m.tipe === 'setor'){ icon = '✅'; cls = 'done'; }
    if(m.tipe === 'pending'){ icon = '⏸️'; cls = 'danger'; }

    return `
      <div class="card ${cls}">
        <div class="card-info">
          ${icon} <b>${escapeHtml(m.label)}</b> — ${m.pcs} pcs
        </div>
        <div class="card-info" style="font-size:0.74rem;">
          ${escapeHtml(m.worker_nama)} • ${escapeHtml(m.barang)}
        </div>
        <div class="card-info" style="font-size:0.7rem;color:var(--dim-2);">
          ${fmtDate(m.tgl)}${m.keterangan ? ' • ' + escapeHtml(m.keterangan) : ''}
        </div>
      </div>
    `;
  }).join('');
}
