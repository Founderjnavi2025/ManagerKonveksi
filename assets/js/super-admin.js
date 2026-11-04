import { sb, Auth, Profiles, Rooms, Workers, Jobs } from './supabase.js';
import { doLogout, setActiveRoom } from './auth.js';

const $ = id => document.getElementById(id);
const state = { user:null, profile:null, rooms:[], users:[], editing:null };

function toast(message){
  const el=$('toast');
  el.textContent=message;
  el.style.display='block';
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>el.style.display='none',3000);
}

function escapeHTML(value=''){
  return String(value).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function dateValue(value){
  return value ? String(value).slice(0,10) : '';
}

function badge(status){
  const label={
    aktif:'Aktif',
    ditangguhkan:'Ditangguhkan',
    kedaluwarsa:'Kedaluwarsa'
  }[status] || status || 'Tidak diketahui';

  return `<span class="badge badge-${escapeHTML(status)}">${escapeHTML(label)}</span>`;
}

async function guard(){
  const user=await Auth.currentUser();
  if(!user) throw new Error('Silakan login terlebih dahulu.');

  const profile=await Profiles.get(user.id);
  if(!profile || profile.role!=='super_admin'){
    throw new Error('Akses hanya untuk Super Admin.');
  }

  state.user=user;
  state.profile=profile;
}

async function loadData(){
  const [roomsResult,usersResult]=await Promise.all([
    sb.from('rooms').select('*').order('created_at',{ascending:false}),
    sb.from('profiles').select('id,nama,email,role,created_at').order('created_at',{ascending:false})
  ]);

  if(roomsResult.error) throw roomsResult.error;
  if(usersResult.error) throw usersResult.error;

  state.rooms=roomsResult.data||[];
  state.users=usersResult.data||[];

  renderStats();
  renderRooms();
  renderUsers();

  // Hitung pekerja dan pekerjaan secara terpisah.
  const counts=await Promise.all([
    sb.from('workers').select('id',{count:'exact',head:true}),
    sb.from('jobs').select('id',{count:'exact',head:true})
  ]);

  $('statWorkers').textContent=counts[0].error?'—':counts[0].count??0;
  $('statJobs').textContent=counts[1].error?'—':counts[1].count??0;
}

function renderStats(){
  $('statRooms').textContent=state.rooms.length;
  $('statUsers').textContent=state.users.length;
}

function renderRooms(){
  const keyword=$('roomSearch').value.toLowerCase();

  const filtered=state.rooms.filter(r=>
    `${r.nama||''} ${r.slug||''}`.toLowerCase().includes(keyword)
  );

  if(!filtered.length){
    $('roomList').innerHTML='<tr><td colspan="5" class="empty">Tidak ada room ditemukan.</td></tr>';
    return;
  }

  $('roomList').innerHTML=filtered.map(r=>{
    const owner=state.users.find(u=>u.id===r.pemilik_id);
    const ownerName=owner?.nama||'Owner tidak ditemukan';
    const ownerEmail=owner?.email||'';

    return `<tr>
      <td><div class="name">${escapeHTML(r.nama)}</div>
          <div class="muted">/${escapeHTML(r.slug)}</div></td>
      <td><div>${escapeHTML(ownerName)}</div><div class="muted">${escapeHTML(ownerEmail)}</div></td>
      <td>${escapeHTML(r.paket||'-')}</td>
      <td>${badge(r.status)}</td>
      <td><div class="actions">
        <button class="btn btn-green" data-action="enter" data-id="${r.id}">Masuk</button>
        <button class="btn" data-action="edit" data-id="${r.id}">Edit</button>
        <button class="btn" data-action="toggle" data-id="${r.id}">${r.status==='aktif'?'Tangguhkan':'Aktifkan'}</button>
        <button class="btn btn-danger" data-action="delete" data-id="${r.id}">Hapus</button>
      </div></td>
    </tr>`;
  }).join('');
}

function renderUsers(){
  const keyword=$('userSearch').value.toLowerCase();

  const filtered=state.users.filter(u=>
    `${u.nama||''} ${u.email||''} ${u.role||''}`.toLowerCase().includes(keyword)
  );

  $('userList').innerHTML=filtered.length?filtered.map(u=>`
    <div class="account">
      <strong>${escapeHTML(u.nama||'Tanpa nama')}</strong>
      <p>${escapeHTML(u.email||'-')}</p>
      <div class="role">${escapeHTML(u.role||'user').toUpperCase()}</div>
    </div>
  `).join(''):'<div class="empty">Tidak ada akun ditemukan.</div>';
}

function openModal(room=null){
  state.editing=room?.id||null;
  $('roomForm').reset();

  $('modalTitle').textContent=room?'Edit Room':'Buat Room Baru';
  $('ownerFields').style.display=room?'none':'block';

  const today=new Date().toISOString().slice(0,10);
  $('roomName').value=room?.nama||'';
  $('roomSlug').value=room?.slug||'';
  $('roomPackage').value=room?.paket||'basic';
  $('roomStatus').value=room?.status||'aktif';
  $('roomStart').value=dateValue(room?.mulai_at)||today;
  $('roomEnd').value=dateValue(room?.berakhir_at)||'';

  $('roomModal').classList.add('show');
}

function closeModal(){
  $('roomModal').classList.remove('show');
}

async function saveRoom(event){
  event.preventDefault();

  const nama=$('roomName').value.trim();
  const slug=$('roomSlug').value.trim().toLowerCase();

  if(!/^[a-z0-9-]{3,40}$/.test(slug)){
    toast('Slug harus 3–40 karakter: huruf kecil, angka, atau tanda -');
    return;
  }

  const payload={
    nama,slug,
    paket:$('roomPackage').value,
    status:$('roomStatus').value,
    mulai_at:$('roomStart').value||null,
    berakhir_at:$('roomEnd').value||null,
    updated_at:new Date().toISOString()
  };

  const button=$('saveBtn');
  button.disabled=true;
  button.textContent='Menyimpan...';

  try{
    if(state.editing){
      const {error}=await sb.from('rooms').update(payload).eq('id',state.editing);
      if(error) throw error;
      toast('Room berhasil diperbarui.');
    }else{
      const ownerName=$('ownerName').value.trim();
      const ownerEmail=$('ownerEmail').value.trim();
      const ownerPassword=$('ownerPassword').value;

      if(!ownerName||!ownerEmail||ownerPassword.length<6){
        throw new Error('Lengkapi data Owner dan password minimal 6 karakter.');
      }

      const {data,error}=await sb.functions.invoke('super-admin-create-owner',{
        body:{
          owner:{nama:ownerName,email:ownerEmail,password:ownerPassword},
          room:payload
        }
      });

      if(error) throw error;
      if(data?.error) throw new Error(data.error);

      toast('Room dan akun Owner berhasil dibuat.');
    }

    closeModal();
    await loadData();
  }catch(error){
    console.error(error);
    toast(error.message||'Gagal menyimpan data.');
  }finally{
    button.disabled=false;
    button.textContent='Simpan';
  }
}

async function toggleRoom(id){
  const room=state.rooms.find(r=>r.id===id);
  if(!room) return;

  const next=room.status==='aktif'?'ditangguhkan':'aktif';
  if(!confirm(`${next==='aktif'?'Aktifkan':'Tangguhkan'} room ${room.nama}?`)) return;

  const {error}=await sb.from('rooms')
    .update({status:next,updated_at:new Date().toISOString()})
    .eq('id',id);

  if(error) throw error;
  toast('Status room diperbarui.');
  await loadData();
}

async function deleteRoom(id){
  const room=state.rooms.find(r=>r.id===id);
  if(!room) return;

  if(!confirm(`Hapus room "${room.nama}"?\n\nPastikan data penting sudah dicadangkan.`)) return;

  const {error}=await sb.from('rooms').delete().eq('id',id);
  if(error) throw error;

  toast('Room berhasil dihapus.');
  await loadData();
}

async function enterRoom(id){
  const room=state.rooms.find(r=>r.id===id);
  if(!room) return;

  if(room.status!=='aktif'){
    toast('Room tidak aktif. Aktifkan terlebih dahulu.');
    return;
  }

  setActiveRoom(room.id,room.nama);
  window.location.href='/pages/dashboard.html';
}

async function roomAction(event){
  const button=event.target.closest('[data-action]');
  if(!button) return;

  const id=button.dataset.id;
  const action=button.dataset.action;

  try{
    if(action==='edit'){
      const room=state.rooms.find(r=>r.id===id);
      openModal(room);
    }
    if(action==='toggle') await toggleRoom(id);
    if(action==='delete') await deleteRoom(id);
    if(action==='enter') await enterRoom(id);
  }catch(error){
    console.error(error);
    toast(error.message||'Operasi gagal.');
  }
}

async function init(){
  try{
    await guard();
    $('gate').style.display='none';
    $('app').style.display='block';
    await loadData();
  }catch(error){
    console.error(error);
    $('gate').textContent=error.message||'Gagal memuat dashboard.';
    if(/login|akses/i.test(error.message||'')){
      setTimeout(()=>window.location.href='/pages/login.html',1800);
    }
  }
}

$('createBtn').addEventListener('click',()=>openModal());
$('logoutBtn').addEventListener('click',async()=>{
  try{await doLogout()}catch(e){toast(e.message)}
});
$('roomForm').addEventListener('submit',saveRoom);
$('roomList').addEventListener('click',roomAction);
$('roomSearch').addEventListener('input',renderRooms);
$('userSearch').addEventListener('input',renderUsers);
document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeModal));
$('roomModal').addEventListener('click',e=>{
  if(e.target===$('roomModal')) closeModal();
});

init();
