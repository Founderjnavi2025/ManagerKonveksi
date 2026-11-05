import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const Auth = {
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  async logout() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  },

  async currentUser() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  },
};

export const Profiles = {
  async get(userId) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

export const Rooms = {
  async listForUser(userId) {
    const { data: owned, error: ownerError } = await sb.from('rooms').select('*').eq('pemilik_id', userId);
    if (ownerError) throw ownerError;

    const { data: member, error: memberError } = await sb.from('room_members').select('room_id').eq('user_id', userId);
    if (memberError) throw memberError;

    const memberIds = (member || []).map(m => m.room_id);
    let extra = [];

    if (memberIds.length) {
      const { data, error } = await sb.from('rooms').select('*').in('id', memberIds);
      if (error) throw error;
      extra = data || [];
    }

    const map = new Map();
    [...(owned || []), ...extra].forEach(r => map.set(r.id, r));
    return [...map.values()];
  },

  async get(id) {
    const { data, error } = await sb.from('rooms').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
};

export const Workers = {
  async list(roomId) {
    const { data, error } = await sb.from('workers').select('*').eq('room_id', roomId).order('nama');
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await sb.from('workers').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async save(worker) {
    const payload = {
      id: worker.id, room_id: worker.room_id, nama: worker.nama,
      telepon: worker.telepon || null, aktif: worker.aktif !== false,
      tgl_mulai: worker.tgl_mulai || null,
    };
    const { data, error } = await sb.from('workers').upsert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await sb.from('workers').delete().eq('id', id);
    if (error) throw error;
  },
};

export const Jobs = {
  async list(roomId) {
    const { data, error } = await sb.from('jobs').select('*')
      .eq('room_id', roomId).order('tgl_ambil', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async byWorker(workerId) {
    const { data, error } = await sb.from('jobs').select('*')
      .eq('worker_id', workerId).order('tgl_ambil', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await sb.from('jobs').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async save(job) {
    const payload = {
      id: job.id, room_id: job.room_id, worker_id: job.worker_id,
      worker_nama: job.worker_nama, barang: job.barang, jenis: job.jenis,
      jumlah_ambil: job.jumlah_ambil, tarif: job.tarif, tgl_ambil: job.tgl_ambil,
      setoran: job.setoran || [], status: job.status || 'aktif',
      pending_at: job.pending_at || null, pending_alasan: job.pending_alasan || null,
      pending_dibayar: job.pending_dibayar || false, upah_pending: job.upah_pending || 0,
      pending_catatan_bayar: job.pending_catatan_bayar || null,
    };
    const { data, error } = await sb.from('jobs').upsert(payload).select().single();
    if (error) throw error;
    return data;
  },
};

export const Transactions = {
  async list(roomId) {
    const { data, error } = await sb.from('transactions').select('*')
      .eq('room_id', roomId).order('tgl', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async byWorker(workerId) {
    const { data, error } = await sb.from('transactions').select('*')
      .eq('worker_id', workerId).order('tgl', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async save(tx) {
    const payload = {
      id: tx.id, room_id: tx.room_id, worker_id: tx.worker_id,
      job_id: tx.job_id, jenis: tx.jenis, jumlah: tx.jumlah,
      tgl: tx.tgl, periode_id: tx.periode_id || null,
      keterangan: tx.keterangan || null,
    };
    const { data, error } = await sb.from('transactions').upsert(payload).select().single();
    if (error) throw error;
    return data;
  },
};

export const Periods = {
  async list(roomId) {
    const { data, error } = await sb.from('periods').select('*')
      .eq('room_id', roomId).order('mulai', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async save(period) {
    const payload = {
      id: period.id, room_id: period.room_id, mulai: period.mulai,
      akhir: period.akhir, status: period.status,
      snapshot: period.snapshot || null, closed_at: period.closed_at || null,
    };
    const { data, error } = await sb.from('periods').upsert(payload).select().single();
    if (error) throw error;
    return data;
  },
};

export const Tarifs = {
  async get(roomId) {
    const { data, error } = await sb.from('tarifs').select('*').eq('room_id', roomId).maybeSingle();
    if (error) throw error;
    return data || { tarif: 8000 };
  },

  async save(roomId, tarif) {
    const { error } = await sb.from('tarifs').upsert({ room_id: roomId, tarif });
    if (error) throw error;
  },
};

export function hitungUpah(pcs, tarif) {
  if (!pcs || !tarif) return 0;
  const lusin = Math.floor(pcs / 12);
  const sisa = pcs % 12;
  return lusin * tarif + Math.round((sisa / 12) * tarif);
}

export async function getBebanPerPekerja(roomId) {
  const jobs = await Jobs.list(roomId);
  const byWorker = {};

  jobs.forEach(j => {
    if (j.status === 'selesai') return;
    const totalSetor = (j.setoran || []).reduce((s, x) => s + (x.pcs || 0), 0);
    const sisa = Math.max(0, j.jumlah_ambil - totalSetor);
    if (sisa === 0) return;

    if (!byWorker[j.worker_id]) {
      byWorker[j.worker_id] = {
        worker_id: j.worker_id, worker_nama: j.worker_nama,
        beban: 0, pending: 0, jumlah_job: 0,
      };
    }

    byWorker[j.worker_id].jumlah_job++;
    if (j.status === 'pending') byWorker[j.worker_id].pending += sisa;
    else byWorker[j.worker_id].beban += sisa;
  });

  return Object.values(byWorker);
}

export async function loadRoomData(roomId) {
  const [workers, jobs, transactions, periods, tarif] = await Promise.all([
    Workers.list(roomId), Jobs.list(roomId), Transactions.list(roomId),
    Periods.list(roomId), Tarifs.get(roomId),
  ]);

  return { workers, jobs, transactions, periods, tarif };
}

export const Finance = {
  async list(roomId, options = {}) {
    let query = sb.from('finance_transactions')
      .select('*')
      .eq('room_id', roomId)
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: false });

    if (options.mulai) query = query.gte('tanggal', options.mulai);
    if (options.akhir) query = query.lte('tanggal', options.akhir);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async save(tx) {
    const payload = {
      id: tx.id,
      room_id: tx.room_id,
      tanggal: tx.tanggal,
      tipe: tx.tipe,
      kategori: tx.kategori,
      jumlah: tx.jumlah,
      keterangan: tx.keterangan || null,
    };

    const { data, error } = await sb.from('finance_transactions')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await sb.from('finance_transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
