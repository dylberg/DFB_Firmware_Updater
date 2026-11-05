export const FLASH_SIZE = 0x800000;
export const PRESERVED = [{name:'Settings',offset:0x9000,size:0x3000},{name:'Radio calibration',offset:0xe000,size:0x1000},{name:'Storage',offset:0x310000,size:0xf0000}];
export function requireThat(ok, message) { if (!ok) throw new Error(message); }
export const same = (a,b) => a.length === b.length && a.every((x,i)=>x===b[i]);
export async function sha256(data) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join(''); }
function cstr(a,p,n) { return new TextDecoder().decode(a.subarray(p,p+n)).split('\0')[0]; }
export function descriptor(a,offset=0) {
  if (offset+256>a.length || a[offset]!==0xe9) return null;
  const v=new DataView(a.buffer,a.byteOffset,a.byteLength);
  if(v.getUint32(offset+32,true)!==0xabcd5432) return null;
  return {project:cstr(a,offset+80,32),version:cstr(a,offset+48,32),chip:v.getUint16(offset+12,true)};
}
export function validateSecurity(s) {
  // Qualified hardware reports flags=0 and crypt count=0. Fail closed on all other profiles.
  requireThat(s?.chipId===9 && s.flags===0 && s.flashCryptCnt===0,'Controller security settings are outside this updater’s supported profile. Contact Technical Services.');
}
export function validateLayout(bytes,files) {
  const table=files.find(f=>f.offset===0x8000);
  requireThat(table && same(bytes.subarray(0x8000,0x8000+table.data.length),table.data),'Controller memory layout differs from this firmware package. No update is permitted.');
  const d=descriptor(bytes,0x10000);
  requireThat(d?.project==='dfb_slim_fw' && d.chip===9 && ['0.1.1','1.0.0'].includes(d.version),'Existing DFB Slim firmware is not recognized or its factory version is unsupported.');
  if(bytes.length>0x190100) {
    const ota=descriptor(bytes,0x190000);
    requireThat(!ota || (ota.project==='dfb_slim_fw' && ota.chip===9 && ['0.1.1','1.0.0'].includes(ota.version)),'An unsupported OTA application is present.');
  }
  return d;
}
export async function validateFiles(manifest,files) {
  requireThat(manifest.model==='DFB Slim' && manifest.version==='1.0.0' && files.length===4,'Unsupported firmware release.');
  const expected=[0,0x8000,0xc000,0x10000];
  for(let i=0;i<4;i++) {
    const f=files[i];
    requireThat(f.offset===expected[i] && f.data.length===f.size,'Incorrect firmware file size or address.');
    requireThat(await sha256(f.data)===f.sha256,'Firmware integrity check failed: '+f.name);
    requireThat(i===3 || Math.ceil((f.offset+f.size)/4096)*4096<=expected[i+1],'Firmware sectors overlap.');
    for(const p of PRESERVED) requireThat(f.offset+Math.ceil(f.size/4096)*4096<=p.offset || f.offset>=p.offset+p.size,'Firmware would overwrite settings.');
  }
  const d=descriptor(files[3].data);
  requireThat(d?.project==='dfb_slim_fw' && d.version===manifest.version && d.chip===9,'Firmware identity check failed.');
  requireThat(files[0].data[0]===0xe9 && files[0].data[12]===9,'Incorrect bootloader chip.');
}
// No automatic retry after a failed write: retain the backup and require a new session.
export async function program({device,manifest,files,saveBackup,stage}) {
  await validateFiles(manifest,files);
  stage('Checking controller',0);
  validateSecurity(await device.security());
  requireThat(await device.capacity()===FLASH_SIZE,'This release requires an 8 MB controller.');
  const mac=await device.mac();
  requireThat(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac),'Controller identity could not be read.');
  validateLayout(await device.read(0,0x11000),files);
  stage('Backing up controller',0);
  const backup=await device.read(0,FLASH_SIZE,(n)=>stage('Backing up controller',n/FLASH_SIZE));
  requireThat(backup.length===FLASH_SIZE,'Backup is incomplete.');
  const factory=validateLayout(backup,files);
  const backupHash=await sha256(backup);
  await saveBackup({bytes:backup,sha256:backupHash,mac,factoryVersion:factory.version});
  requireThat(await device.mac()===mac,'Controller identity changed.');
  await validateFiles(manifest,files);
  stage('Programming firmware',0);
  await device.write(files,(n)=>stage('Programming firmware',n));
  for(let i=0;i<files.length;i++) {
    const f=files[i]; stage('Verifying firmware',(i)/files.length);
    requireThat(same(await device.read(f.offset,f.size),f.data),'Firmware verification failed: '+f.name);
  }
  for(let i=0;i<PRESERVED.length;i++) {
    const p=PRESERVED[i]; stage('Verifying saved settings',i/PRESERVED.length);
    requireThat(same(await device.read(p.offset,p.size),backup.subarray(p.offset,p.offset+p.size)),p.name+' verification failed. Keep the backup and contact Technical Services.');
  }
  stage('Programming verified — power-cycle the controller',1);
  return {mac,backupHash,factoryVersion:factory.version,targetVersion:manifest.version,awaitingPowerCycle:true};
}
