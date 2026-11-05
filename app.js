import {program,validateFiles,sha256,requireThat} from './core.js';
import {SerialDevice} from './device.js';
const $=id=>document.getElementById(id);
let device=null,busy=false,files,manifest,backup=null,session=crypto.randomUUID(),writeStarted=false,logs=[],ready=false;
function log(text){logs.push(`${new Date().toISOString()} ${String(text).trim()}`);$('terminal').textContent=logs.slice(-500).join('\n');$('terminal').scrollTop=$('terminal').scrollHeight;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function controls(){ $('connect').disabled=busy||!!device||!ready;$('update').disabled=busy||!device;$('disconnect').disabled=busy||!device;$('backup').disabled=busy||!backup; }
function download(name,data,type='application/octet-stream'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('TraffiCalm-DFB-backups',1);r.onupgradeneeded=()=>r.result.createObjectStore('sessions',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function persistBackup(b){
  const store=await db();
  try{
    await new Promise((resolve,reject)=>{const t=store.transaction('sessions','readwrite');t.objectStore('sessions').put({...b,id:session,date:new Date().toISOString()});t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Backup save cancelled.'));});
    const saved=await new Promise((resolve,reject)=>{const r=store.transaction('sessions').objectStore('sessions').get(session);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    requireThat(saved?.bytes.length===0x800000 && await sha256(saved.bytes)===b.sha256,'The browser could not verify the saved backup. No firmware was written.');
    backup=saved;log(`Backup saved and checked: ${b.sha256}; controller ${b.mac}; factory image ${b.factoryVersion}`);
  }finally{store.close();}
}
async function closeDevice(){const d=device;device=null;try{if(d)await d.close();}catch(e){log('Disconnect: '+e.message);} $('dot').className='dot';$('device').textContent='No controller connected';$('identity').textContent='Close other programming tools before connecting.';controls();}
function stage(text,pct){if(text==='Programming firmware')writeStarted=true;status(text);$('progress').value=pct;const steps=[...document.querySelectorAll('#steps li')],i=steps.findIndex(x=>text.startsWith(x.dataset.step));steps.forEach((x,n)=>{x.classList.toggle('active',n===i);x.classList.toggle('done',n<i);});if(pct===0)log(text);}
$('connect').onclick=async()=>{
  busy=true;controls();status('Select your controller in the browser’s device picker.');
  try{
    const port=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a}]});
    session=crypto.randomUUID();writeStarted=false;logs=[];$('finish').hidden=true;$('confirmed').textContent='';$('confirm').disabled=false;$('progress').value=0;document.querySelectorAll('#steps li').forEach(x=>x.className='');
    log('Browser updater 0.1; firmware 1.0.0; '+navigator.userAgent);status('Connecting to controller…');
    device=new SerialDevice(port,log);await device.connect();
    $('device').textContent='DFB Slim controller connected';$('identity').textContent='Controller '+await device.mac();$('dot').className='dot connected';status('Ready. Click Update to back up and program this controller.');
  }catch(e){log(e.message);await closeDevice();status(e.name==='NotFoundError'?'No controller selected. Connect when ready.':'Connection failed: '+e.message+' Close other programming tools, power-cycle, and reconnect.',e.name!=='NotFoundError');}
  finally{busy=false;controls();}
};
$('update').onclick=async()=>{
  busy=true;writeStarted=false;controls();let wake;
  try{
    try{wake=await navigator.wakeLock?.request('screen');}catch{}
    // Persistence permission is best-effort; an actual database write/read is mandatory.
    try{await navigator.storage?.persist();}catch{}
    const result=await program({device,manifest,files,saveBackup:persistBackup,stage});log(JSON.stringify(result));$('finish').hidden=false;
    await closeDevice();
  }catch(e){log('ERROR: '+e.message);status((writeStarted?'Update did not finish. Keep the backup. Power-cycle and reconnect to retry; if the layout is no longer recognized, use the Windows recovery/service process. ':'Stopped before programming. ')+e.message,true);await closeDevice();}
  finally{await wake?.release().catch(()=>{});busy=false;controls();}
};
$('disconnect').onclick=async()=>{busy=true;controls();await closeDevice();busy=false;controls();status('Disconnected. Power-cycle the controller to resume normal operation.');};
$('backup').onclick=()=>download(`DFB-backup-${backup.mac.replaceAll(':','')}-${backup.id}.bin`,backup.bytes);
$('log').onclick=()=>download(`TraffiCalm-browser-update-${session}.txt`,logs.join('\n'),'text/plain');
$('confirm').onclick=()=>{log('User confirmed version 1.0.0 in Pelco One after power cycle.');$('confirmed').textContent='Update complete. Version confirmed by you in Pelco One.';$('confirm').disabled=true;};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
try{
  requireThat(window.isSecureContext && 'serial' in navigator,'Open this page in desktop Chrome or Edge using HTTPS or localhost.');
  async function fetchFile(path){const r=await fetch(path,{cache:'no-store'});requireThat(r.ok,'Unable to load '+path);return r;}
  manifest=await (await fetchFile('./firmware/release.json')).json();
  files=await Promise.all(manifest.files.map(async f=>{requireThat(/^[a-z0-9_.-]+\.bin$/i.test(f.name),'Invalid package filename.');return {...f,data:new Uint8Array(await (await fetchFile('./firmware/'+f.name)).arrayBuffer())};}));
  await validateFiles(manifest,files);ready=true;status('Ready to connect.');log('Bundled firmware integrity checks passed.');
  const store=await db();try{const all=await new Promise((resolve,reject)=>{const r=store.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});backup=all.sort((a,b)=>b.date.localeCompare(a.date))[0]||null;if(backup)log('Previous backup available with Save backup: '+backup.mac);}finally{store.close();}
}catch(e){status(e.message,true);log(e.message);}finally{controls();}
