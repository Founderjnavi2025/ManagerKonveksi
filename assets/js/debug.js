import { DEBUG_MODE } from './config.js';
import { sb } from './supabase.js';

if(DEBUG_MODE){
  console.log('%c[DEBUG] Konveksi Hub — DEBUG ON', 'color:#0f2e5c;font-weight:bold');
}

export async function checkConnection(){
  if(!DEBUG_MODE) return;
  const { error } = await sb.from('rooms').select('id').limit(1);
  console.log('[DEBUG] Supabase connection:', error ? '❌ ' + error.message : '✅ OK');
}

window.__kh_debug = { checkConnection, sb };
