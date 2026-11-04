import { Auth, Profiles } from './supabase.js';
import { LS_KEYS } from './config.js';

export async function doLogin(email, password){
  const user = await Auth.login(email, password);
  const profile = await Profiles.get(user.id);
  if(!profile) throw new Error('Profil tidak ditemukan');
  return { user, profile };
}

export async function doLogout(){
  localStorage.removeItem(LS_KEYS.ACTIVE_ROOM);
  localStorage.removeItem(LS_KEYS.ACTIVE_ROOM_NAME);
  await Auth.logout();
  window.location.href = '/pages/login.html';
}

export async function getSession(){
  const user = await Auth.currentUser();
  if(!user) return null;
  const profile = await Profiles.get(user.id);
  return { user, profile };
}

export async function requireAuth(){
  const session = await getSession();
  if(!session){
    window.location.href = '/pages/login.html';
    return null;
  }
  return session;
}

export function getActiveRoomId(){
  return localStorage.getItem(LS_KEYS.ACTIVE_ROOM);
}

export function setActiveRoom(id, name){
  localStorage.setItem(LS_KEYS.ACTIVE_ROOM, id);
  if(name) localStorage.setItem(LS_KEYS.ACTIVE_ROOM_NAME, name);
}
