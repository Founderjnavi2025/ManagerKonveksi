/* ═══════════════════════════════════════════════════
   KONVEKSI HUB — supabase.js
   Adapter antara app.js dan Supabase
   ═══════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://avlanvviiinbyvtimhhp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2bGFudnZpaWluYnl2dGltaGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTEyNTgsImV4cCI6MjEwNzM4NzI1OH0.ZOTvoKJBFBLJDlnSDBXKKm8ihn0b3xESSHA0c2JargI';

// Inisialisasi Supabase client
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════ */
const Auth = {
  async login(email, password){
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data.user;
  },

  async logout(){
    await sb.auth.signOut();
  },

  async currentUser(){
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },

  async createUser(email, password, nama){
    // Ini butuh service_role biasanya, tapi kita pakai signUp biasa
    // (dengan catatan "Allow new users to sign up" harus ON)
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { nama } }
    });
    if(error) throw error;
    return data.user;
  },
};

/* ═══════════════════════════════════════════════════
   PROFILES
   ═══════════════════════════════════════════════════ */
const Profiles = {
  async get(userId){
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if(error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(userId, patch){
    const { error } = await sb.from('profiles').update(patch).eq('id', userId);
    if(error) throw error;
  },

  async listAll(){
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  },
};

/* ═══════════════════════════════════════════════════
   ROOMS
   ═══════════════════════════════════════════════════ */
const Rooms = {
  async listAll(){
    const { data, error } = await sb.from('rooms').select('*').order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  },

  async listForUser(userId){
    // Room yang pemiliknya user ATAU user member
    const { data: owned } = await sb.from('rooms').select('*').eq('pemilik_id', userId);
    const { data: member } = await sb.from('room_members').select('room_id').eq('user_id', userId);
    const memberIds = (member || []).map(m => m.room_id);

    let extra = [];
    if(memberIds.length){
      const { data } = await sb.from('rooms').select('*').in('id', memberIds);
      extra = data || [];
    }

    // Gabung, hilangkan duplikat
    const map = new Map();
    [...(owned || []), ...extra].forEach(r => map.set(r.id, r));
    return [...map.values()];
  },

  async get(id){
    const { data, error } = await sb.from('rooms').select('*').eq('id', id).single();
    if(error) throw error;
    return data;
  },

  async create(payload){
    const { data, error } = await sb.from('rooms').insert(payload).select().single();
    if(error) throw error;
    return data;
  },

  async update(id, patch){
    const { error } = await sb.from('rooms').update(patch).eq('id', id);
    if(error) throw error;
  },

  async delete(id){
    const { error } = await sb.from('rooms').delete().eq('id', id);
    if(error) throw error;
  },

  async findBySlug(slug){
    const { data } = await sb.from('rooms').select('*').eq('slug', slug).maybeSingle();
    return data;
  },

  async addMember(roomId, userId, role = 'owner'){
    const { error } = await sb.from('room_members').insert({ room_id: roomId, user_id: userId, role });
    if(error && error.code !== '23505') throw error; // ignore duplicate
  },
};

/* ═══════════════════════════════════════════════════
   WORKERS
   ═══════════════════════════════════════════════════ */
const Workers = {
  async list(roomId){
    const { data, error } = await sb.from('workers').select('*').eq('room_id', roomId);
    if(error) throw error;
    return data || [];
  },

  async save(worker){
    const payload = {
      id: worker.id,
      room_id: worker.room_id,
      nama: worker.nama,
      telepon: worker.telepon || null,
      aktif: worker.aktif !== false,
    };
    const { data, error } = await sb.from('workers').upsert(payload).select().single();
    if(error) throw error;
    return data;
  },

  async delete(id){
    const { error } = await sb.from('workers').delete().eq('id', id);
    if(error) throw error;
  },
};

/* ═══════════════════════════════════════════════════
   JOBS
   ═══════════════════════════════════════════════════ */
const Jobs = {
  async list(roomId){
    const { data, error } = await sb.from('jobs').select('*').eq('room_id', roomId);
    if(error) throw error;
    return data || [];
  },

  async save(job){
    const payload = {
      id: job.id,
      room_id: job.room_id,
      worker_id: job.worker_id,
      worker_nama: job.worker_nama,
      barang: job.barang,
      jenis: job.jenis,
      jumlah_ambil: job.jumlah_ambil,
      tarif: job.tarif,
      tgl_ambil: job.tgl_ambil,
      setoran: job.setoran || [],
    };
    const { data, error } = await sb.from('jobs').upsert(payload).select().single();
    if(error) throw error;
    return data;
  },

  async delete(id){
    const { error } = await sb.from('jobs').delete().eq('id', id);
    if(error) throw error;
  },
};

/* ═══════════════════════════════════════════════════
   TRANSACTIONS
   ═══════════════════════════════════════════════════ */
const Transactions = {
  async list(roomId){
    const { data, error } = await sb.from('transactions').select('*').eq('room_id', roomId);
    if(error) throw error;
    return data || [];
  },

  async save(tx){
    const payload = {
      id: tx.id,
      room_id: tx.room_id,
      worker_id: tx.worker_id,
      job_id: tx.job_id,
      jenis: tx.jenis,
      jumlah: tx.jumlah,
      tgl: tx.tgl,
      periode_id: tx.periode_id || null,
      keterangan: tx.keterangan || null,
    };
    const { data, error } = await sb.from('transactions').upsert(payload).select().single();
    if(error) throw error;
    return data;
  },

  async delete(id){
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if(error) throw error;
  },
};

/* ═══════════════════════════════════════════════════
   PERIODS
   ═══════════════════════════════════════════════════ */
const Periods = {
  async list(roomId){
    const { data, error } = await sb.from('periods').select('*').eq('room_id', roomId).order('mulai', { ascending: false });
    if(error) throw error;
    return data || [];
  },

  async save(period){
    const payload = {
      id: period.id,
      room_id: period.room_id,
      mulai: period.mulai,
      akhir: period.akhir,
      status: period.status,
      snapshot: period.snapshot || null,
      closed_at: period.closed_at || null,
    };
    const { data, error } = await sb.from('periods').upsert(payload).select().single();
    if(error) throw error;
    return data;
  },
};

/* ═══════════════════════════════════════════════════
   TARIFS
   ═══════════════════════════════════════════════════ */
const Tarifs = {
  async get(roomId){
    const { data } = await sb.from('tarifs').select('*').eq('room_id', roomId).maybeSingle();
    return data || { tarif: 8000 };
  },

  async save(roomId, tarif){
    const { error } = await sb.from('tarifs').upsert({ room_id: roomId, tarif });
    if(error) throw error;
  },
};

/* ═══════════════════════════════════════════════════
   LOAD ALL ROOM DATA (untuk enterRoom)
   ═══════════════════════════════════════════════════ */
async function loadRoomDataFromSupabase(roomId){
  const [workers, jobs, transactions, periods, tarif] = await Promise.all([
    Workers.list(roomId),
    Jobs.list(roomId),
    Transactions.list(roomId),
    Periods.list(roomId),
    Tarifs.get(roomId),
  ]);
  return { workers, jobs, transactions, periods, tarif };
}
