/* ═══════════════════════════════════════════════════
   KONVEKSI HUB v2 — Payroll Module
   Rekap upah, bayar, slip gaji
   ═══════════════════════════════════════════════════ */

import { Transactions, Workers, hitungUpah } from './supabase.js';

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

export function fmtNum(n){
  return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/* ═══════ REKAP PER PEKERJA ═══════ */
/**
 * Rekap upah per pekerja dalam periode.
 * Upah = dari setor (default), atau dari ambil kalau dipilih.
 */
export function rekapPerPekerja(jobs, transactions, workers, options = {}){
  const { basis = 'setor', filterWorkerId = null } = options;
  const byWorker = {};

  workers.forEach(w => {
    byWorker[w.id] = {
      worker_id: w.id,
      worker_nama: w.nama,
      upah_setor: 0,
      upah_ambil: 0,
      upah_hak: 0,
      total_panjar: 0,
      total_bayar: 0,
      sisa: 0,
      job_count: 0,
      pcs_setor: 0,
      pcs_ambil: 0,
    };
  });

  jobs.forEach(j => {
    if(filterWorkerId && j.worker_id !== filterWorkerId) return;
    if(!byWorker[j.worker_id]){
      byWorker[j.worker_id] = {
        worker_id: j.worker_id,
        worker_nama: j.worker_nama,
        upah_setor: 0,
        upah_ambil: 0,
        upah_hak: 0,
        total_panjar: 0,
        total_bayar: 0,
        sisa: 0,
        job_count: 0,
        pcs_setor: 0,
        pcs_ambil: 0,
      };
    }

    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const upahSetor = hitungUpah(setor, j.tarif);
    const upahAmbil = hitungUpah(j.jumlah_ambil, j.tarif);

    const w = byWorker[j.worker_id];
    w.upah_setor += upahSetor;
    w.upah_ambil += upahAmbil;
    w.pcs_setor += setor;
    w.pcs_ambil += j.jumlah_ambil;
    w.job_count += 1;
  });

  // Upah hak = basis
  Object.values(byWorker).forEach(w => {
    w.upah_hak = basis === 'ambil' ? w.upah_ambil : w.upah_setor;
  });

  // Panjar & bayar
  transactions.forEach(t => {
    if(filterWorkerId && t.worker_id !== filterWorkerId) return;
    const w = byWorker[t.worker_id];
    if(!w) return;
    if(t.jenis === 'panjar') w.total_panjar += Number(t.jumlah || 0);
    if(t.jenis === 'pembayaran') w.total_bayar += Number(t.jumlah || 0);
  });

  Object.values(byWorker).forEach(w => {
    w.sisa = Math.max(0, w.upah_hak - w.total_panjar - w.total_bayar);
  });

  return Object.values(byWorker).filter(w => w.job_count > 0 || w.total_panjar > 0 || w.total_bayar > 0);
}

/* ═══════ RENDER: CARD REKAP ═══════ */
export function renderRekapCard(w){
  return `
    <div class="card" style="border-left:3px solid var(--ok);">
      <div class="card-name">${escapeHtml(w.worker_nama).toUpperCase()}</div>
      <div class="card-info">
        💰 Upah: <b>${rp(w.upah_hak)}</b>
        <small style="color:var(--dim-2);">(${w.pcs_setor} pcs setor)</small>
      </div>
      <div class="card-info">
        🟡 Panjar: <b>${rp(w.total_panjar)}</b>
        • ✅ Bayar: <b>${rp(w.total_bayar)}</b>
      </div>
      <div class="info-line total"><span>Sisa</span><span>${rp(w.sisa)}</span></div>
      <div style="margin-top:8px;">
        <a href="worker-detail.html?id=${w.worker_id}" class="btn btn-ghost btn-sm">👤 Profil</a>
        <button class="btn btn-done btn-sm" onclick="openSlip('${w.worker_id}')">🖨️ Slip</button>
      </div>
    </div>
  `;
}

/* ═══════ RENDER: SLIP HTML ═══════ */
/**
 * Render slip gaji HTML untuk dicetak.
 * Menerima jobs (yang sudah difilter per worker), transactions, worker, room.
 */
export function renderSlipHtml({ worker, jobs, transactions, room, periode }){
  const rows = jobs.map(j => {
    const setor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const upah = hitungUpah(setor, j.tarif);
    return { job: j, setor, upah };
  });

  const totalPcs = rows.reduce((s, r) => s + r.setor, 0);
  const totalHak = rows.reduce((s, r) => s + r.upah, 0);

  let totalPanjar = 0;
  let totalBayar = 0;
  transactions.forEach(t => {
    if(t.jenis === 'panjar') totalPanjar += Number(t.jumlah || 0);
    if(t.jenis === 'pembayaran') totalBayar += Number(t.jumlah || 0);
  });

  const totalSisa = Math.max(0, totalHak - totalPanjar - totalBayar);
  const tanggalCetak = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const periodeLabel = periode
    ? fmtDate(periode.mulai + 'T00:00:00') + ' — ' + fmtDate(periode.akhir + 'T00:00:00')
    : '(semua periode)';

  return `
    <div class="slip">
      <h4>SLIP GAJI OBRAS</h4>
      <div class="sub">${escapeHtml(room.nama)}</div>
      <hr>
      <table>
        <tr><td>Nama</td><td class="right"><b>${escapeHtml(worker.nama)}</b></td></tr>
        ${worker.telepon ? `<tr><td>Telepon</td><td class="right">${escapeHtml(worker.telepon)}</td></tr>` : ''}
        <tr><td>Periode</td><td class="right">${periodeLabel}</td></tr>
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
            <td>${idx + 1}</td>
            <td>${escapeHtml(r.job.barang)} ${escapeHtml(r.job.jenis)}${r.job.status === 'pending' ? ' ⏸️' : ''}</td>
            <td class="right">${r.setor}</td>
            <td class="right">${fmtNum(r.setor / 12)}</td>
            <td class="right">${Number(r.job.tarif).toLocaleString('id-ID')}</td>
            <td class="right">${Number(r.upah).toLocaleString('id-ID')}</td>
          </tr>
        `).join('')}
        <tr style="border-top:1px solid #000;">
          <td colspan="2"><b>TOTAL</b></td>
          <td class="right"><b>${totalPcs}</b></td>
          <td class="right"><b>${fmtNum(totalPcs / 12)}</b></td>
          <td></td>
          <td class="right"><b>${Number(totalHak).toLocaleString('id-ID')}</b></td>
        </tr>
      </table>
      <hr>
      <table>
        <tr><td>Total Hak Upah</td><td class="right"><b>${Number(totalHak).toLocaleString('id-ID')}</b></td></tr>
        ${totalPanjar > 0 ? `<tr><td>Panjar Diterima</td><td class="right">${Number(totalPanjar).toLocaleString('id-ID')}</td></tr>` : ''}
        ${totalBayar > 0 ? `<tr><td>Pembayaran Lalu</td><td class="right">${Number(totalBayar).toLocaleString('id-ID')}</td></tr>` : ''}
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
}
