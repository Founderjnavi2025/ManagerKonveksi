/* ═══════════════════════════════════════════════════
   KONVEKSI HUB v2 — Reports Module
   Laporan periode, tutup periode, tarif, backup
   ═══════════════════════════════════════════════════ */

import { Periods, Tarifs, Jobs, Transactions, hitungUpah } from './supabase.js';

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

export function fmtDateWaktu(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  const b = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const p = n => String(n).padStart(2, '0');
  return d.getDate() + ' ' + b[d.getMonth()] + ' ' + d.getFullYear() +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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

/* ═══════ PERIODE ═══════ */
export function periodeAktif(periods){
  return periods.find(p => p.status === 'aktif') || null;
}

export function hitungPeriodeDefault(){
  // Sabtu - Jumat
  const d = new Date();
  const day = d.getDay(); // 0 = Minggu, 6 = Sabtu
  const daysSinceSabtu = (day + 1) % 7;
  const sabtu = new Date(d);
  sabtu.setDate(d.getDate() - daysSinceSabtu);
  const jumat = new Date(sabtu);
  jumat.setDate(sabtu.getDate() + 6);
  const p = n => String(n).padStart(2, '0');
  const fmt = x => x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  return { mulai: fmt(sabtu), akhir: fmt(jumat) };
}

export function hitungPeriodeBaruSetelah(tanggalAkhirLama){
  const akhir = new Date(tanggalAkhirLama + 'T00:00:00');
  const sabtuBaru = new Date(akhir);
  sabtuBaru.setDate(akhir.getDate() + 1);
  const jumatBaru = new Date(sabtuBaru);
  jumatBaru.setDate(sabtuBaru.getDate() + 6);
  const p = n => String(n).padStart(2, '0');
  const fmt = x => x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  return { mulai: fmt(sabtuBaru), akhir: fmt(jumatBaru) };
}

export function isDalamPeriode(isoTgl, periode){
  if(!isoTgl || !periode) return false;
  const tgl = isoTgl.slice(0, 10);
  return tgl >= periode.mulai && tgl <= periode.akhir;
}

/* ═══════ SNAPSHOT PERIODE ═══════ */
export function hitungSnapshot(jobs, transactions, periode){
  let totalAmbil = 0;
  let totalSetor = 0;
  let totalGantungan = 0;
  let totalUpahHak = 0;
  let totalPanjar = 0;
  let totalBayar = 0;

  jobs.forEach(j => {
    const setorPeriode = (j.setoran || [])
      .filter(s => isDalamPeriode(s.tgl, periode))
      .reduce((s, x) => s + (x.pcs || 0), 0);

    if(isDalamPeriode(j.tgl_ambil, periode)){
      totalAmbil += j.jumlah_ambil;
      const totalSetorAll = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
      totalGantungan += Math.max(0, j.jumlah_ambil - totalSetorAll);
    }

    totalSetor += setorPeriode;
    totalUpahHak += hitungUpah(setorPeriode, j.tarif);
  });

  transactions.forEach(t => {
    if(!isDalamPeriode(t.tgl, periode) && t.periode_id !== periode.id) return;
    if(t.jenis === 'panjar') totalPanjar += Number(t.jumlah || 0);
    if(t.jenis === 'pembayaran') totalBayar += Number(t.jumlah || 0);
  });

  return {
    totalAmbil,
    totalSetor,
    totalGantungan,
    totalUpahHak,
    totalPanjar,
    totalBayar,
    totalSisaUpah: Math.max(0, totalUpahHak - totalPanjar - totalBayar),
    generatedAt: new Date().toISOString(),
  };
}

/* ═══════ TUTUP PERIODE ═══════ */
export async function tutupPeriode({ periode, jobs, transactions, roomId }){
  if(!periode || periode.status !== 'aktif'){
    throw new Error('Periode aktif tidak ditemukan');
  }

  // Snapshot
  const snapshot = hitungSnapshot(jobs, transactions, periode);

  // Tutup periode lama
  const closed = {
    ...periode,
    status: 'ditutup',
    closed_at: new Date().toISOString(),
    snapshot,
  };
  await Periods.save(closed);

  // Buat periode baru
  const next = hitungPeriodeBaruSetelah(periode.akhir);
  const newPeriod = {
    id: uid(),
    room_id: roomId,
    mulai: next.mulai,
    akhir: next.akhir,
    status: 'aktif',
    snapshot: null,
    closed_at: null,
  };
  const saved = await Periods.save(newPeriod);

  return { closed, opened: saved, snapshot };
}

/* ═══════ UBAH PERIODE ═══════ */
export async function ubahPeriode({ periode, mulai, akhir }){
  if(!mulai || !akhir) throw new Error('Isi tanggal mulai dan akhir');
  if(mulai > akhir) throw new Error('Mulai harus ≤ akhir');

  const updated = {
    ...periode,
    mulai,
    akhir,
  };
  return await Periods.save(updated);
}

/* ═══════ TARIF ═══════ */
export async function simpanTarif(roomId, tarif){
  const t = parseFloat(tarif);
  if(!t || t <= 0) throw new Error('Tarif tidak valid');
  await Tarifs.save(roomId, Math.round(t));
  return Math.round(t);
}

/* ═══════ BACKUP ═══════ */
export function backupJSON({ room, workers, jobs, transactions, periods, tarif }){
  const data = {
    version: 'kh-2.0',
    exportedAt: new Date().toISOString(),
    room,
    workers,
    jobs,
    transactions,
    periods,
    tarif,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup-' + (room?.slug || 'kh') + '-' + todayISO() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  return data;
}

/* ═══════ RENDER: RINGKASAN PERIODE ═══════ */
export function renderRingkasanPeriode(periode, ringkasan){
  if(!periode){
    return '<div class="empty">Belum ada periode aktif</div>';
  }

  const hariIni = todayISO();
  let statusTxt = '🟢 AKTIF';
  if(hariIni > periode.akhir) statusTxt = '⚠️ Melewati tanggal akhir';
  else if(hariIni === periode.akhir) statusTxt = '🔴 Hari terakhir';

  return `
    <div class="card" style="border-left-color:var(--ok);">
      <div class="card-head">
        <span class="card-code">PERIODE AKTIF</span>
        <span class="badge ok">${statusTxt}</span>
      </div>
      <div class="card-name">${fmtDate(periode.mulai + 'T00:00:00')} — ${fmtDate(periode.akhir + 'T00:00:00')}</div>
    </div>

    <div class="stat-grid">
      <div class="stat-box"><div class="lbl">Pcs Diambil</div><div class="val">${ringkasan.totalAmbil}</div></div>
      <div class="stat-box ok"><div class="lbl">Pcs Disetor</div><div class="val ok">${ringkasan.totalSetor}</div></div>
      <div class="stat-box warn"><div class="lbl">Gantungan</div><div class="val warn">${ringkasan.totalGantungan}</div></div>
      <div class="stat-box"><div class="lbl">Upah Hak</div><div class="val">${rp(ringkasan.totalUpahHak)}</div></div>
      <div class="stat-box warn"><div class="lbl">Panjar</div><div class="val warn">${rp(ringkasan.totalPanjar)}</div></div>
      <div class="stat-box ok"><div class="lbl">Bayar</div><div class="val ok">${rp(ringkasan.totalBayar)}</div></div>
      <div class="stat-box danger"><div class="lbl">Sisa Upah</div><div class="val danger">${rp(ringkasan.totalSisaUpah)}</div></div>
    </div>
  `;
}

/* ═══════ RENDER: RIWAYAT PERIODE TERTUTUP ═══════ */
export function renderRiwayatPeriode(periods){
  const closed = periods
    .filter(p => p.status === 'ditutup')
    .sort((a, b) => b.mulai.localeCompare(a.mulai));

  if(closed.length === 0){
    return '<div class="empty">Belum ada periode yang ditutup</div>';
  }

  return closed.slice(0, 10).map(p => {
    const s = p.snapshot || {};
    return `
      <div class="card">
        <div class="card-head">
          <span class="card-code">${fmtDate(p.mulai + 'T00:00:00')} — ${fmtDate(p.akhir + 'T00:00:00')}</span>
          <span class="badge dim">DITUTUP</span>
        </div>
        <div class="card-info">
          ${s.totalSetor || 0} pcs disetor • Upah ${rp(s.totalUpahHak || 0)}
        </div>
        <div class="card-info" style="font-size:0.7rem;color:var(--dim-2);">
          Ditutup: ${fmtDateWaktu(p.closed_at)}
        </div>
      </div>
    `;
  }).join('');
}
