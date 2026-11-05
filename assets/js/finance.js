export function rupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000)
    .toISOString().slice(0, 10);
}

export function summarize(transactions) {
  const result = {
    pemasukan: 0,
    pengeluaran: 0,
    jumlah: transactions.length,
  };

  transactions.forEach(tx => {
    const amount = Number(tx.jumlah) || 0;
    if (tx.tipe === 'pemasukan') result.pemasukan += amount;
    if (tx.tipe === 'pengeluaran') result.pengeluaran += amount;
  });

  result.saldo = result.pemasukan - result.pengeluaran;
  return result;
}

export function renderTransactions(transactions) {
  if (!transactions.length) {
    return '<div class="empty"><span class="big">💸</span>Belum ada transaksi pada periode ini.</div>';
  }

  return transactions.map(tx => {
    const masuk = tx.tipe === 'pemasukan';
    return `
      <div class="card ${masuk ? 'done' : 'danger'}">
        <div class="card-head">
          <span class="card-code">${escapeHtml(tx.tanggal)}</span>
          <span class="badge ${masuk ? 'ok' : 'danger'}">
            ${masuk ? 'PEMASUKAN' : 'PENGELUARAN'}
          </span>
        </div>
        <div class="card-name">${escapeHtml(tx.kategori)}</div>
        <div class="card-info">${escapeHtml(tx.keterangan || 'Tanpa keterangan')}</div>
        <div class="card-head" style="margin-top:8px;">
          <strong style="color:${masuk ? 'var(--ok)' : 'var(--danger)'}">
            ${masuk ? '+' : '−'} ${rupiah(tx.jumlah)}
          </strong>
          <button class="btn btn-danger btn-sm" data-delete="${escapeHtml(tx.id)}">
            Hapus
          </button>
        </div>
      </div>
    `;
  }).join('');
}
