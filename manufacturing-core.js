import {FLASH_SIZE,descriptor,requireThat,same,sha256,validateFiles,validateLayout,validateSecurity} from './core.js';

async function checkController(device) {
  validateSecurity(await device.security());
  requireThat(await device.capacity()===FLASH_SIZE,'This release requires an 8 MB controller.');
  const mac=(await device.mac()).toLowerCase();
  requireThat(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac),'Controller identity could not be read.');
  return mac;
}

export async function validateBackup(backup, mac) {
  requireThat(backup?.mac?.toLowerCase()===mac,'Select a backup from this controller.');
  requireThat(backup.bytes instanceof Uint8Array && backup.bytes.length===FLASH_SIZE,'Backup must contain exactly 8 MB.');
  requireThat(await sha256(backup.bytes)===backup.sha256?.toLowerCase(),'Backup SHA-256 does not match its saved record.');
}

export async function restoreBackup({device,backup,confirmed=false,stage=()=>{}}) {
  requireThat(confirmed===true,'Confirm overwriting this controller with the selected backup.');
  stage('Checking controller and backup',0);
  const mac=await checkController(device);
  await validateBackup(backup,mac);
  requireThat((await device.mac()).toLowerCase()===mac,'Controller identity changed.');
  stage('Restoring flash',0);
  await device.write([{offset:0,size:FLASH_SIZE,data:backup.bytes}],n=>stage('Restoring flash',n));
  stage('Verifying restored flash',0);
  const readback=await device.read(0,FLASH_SIZE,n=>stage('Verifying restored flash',n/FLASH_SIZE));
  requireThat(readback.length===FLASH_SIZE && await sha256(readback)===backup.sha256.toLowerCase(),'Restored flash SHA-256 does not match the backup.');
  stage('PASS - backup restored. Power-cycle controller.',1);
  return {mac,mode:'restore',backupId:backup.id,backupHash:backup.sha256,programmingVerified:true,awaitingPowerCycle:true};
}

export async function manufacture({device,manifest,files,mode='update',eraseConfirmed=false,saveBackup,stage=()=>{}}) {
  requireThat(['update','factory'].includes(mode),'Select a valid programming mode.');
  requireThat(mode!=='factory'||eraseConfirmed===true,'Confirm erasing all existing settings.');
  await validateFiles(manifest,files);
  stage('Checking controller',0);
  const mac=await checkController(device);
  let backupCreated=false;
  if(mode==='update') {
    validateLayout(await device.read(0,0x11000),files);
    const ota=descriptor(await device.read(0x190000,256));
    requireThat(!ota||(ota.project==='dfb_slim_fw'&&ota.chip===9&&['0.1.1','1.0.0'].includes(ota.version)),'Unsupported OTA application. Use the qualified service process.');
  }
  if(mode==='factory') {
    stage('Reading flash before erase',0);
    const bytes=await device.read(0,FLASH_SIZE,n=>stage('Reading flash before erase',n/FLASH_SIZE));
    requireThat(bytes.length===FLASH_SIZE,'Flash read was incomplete.');
    if(bytes.some(byte=>byte!==0xff)) {
      requireThat(typeof saveBackup==='function','Backup storage is required before erasing this board.');
      stage('Saving pre-erase backup',0);
      const backup={bytes,mac,sha256:await sha256(bytes),factoryVersion:descriptor(bytes,0x10000)?.version};
      const saved=await saveBackup(backup);
      await validateBackup(saved,mac);
      requireThat(saved.sha256===backup.sha256,'Saved backup differs from the pre-erase image.');
      backupCreated=true;
    }
  }
  requireThat((await device.mac()).toLowerCase()===mac,'Controller identity changed.');
  if(mode==='factory') {stage('Erasing all flash',0);await device.erase();}
  stage('Programming firmware',0);
  await device.write(files,n=>stage('Programming firmware',n));
  for(let i=0;i<files.length;i++) {
    stage('Verifying firmware',i/files.length);
    const f=files[i];requireThat(same(await device.read(f.offset,f.size),f.data),'Verification failed: '+f.name);
  }
  const result={mac,mode,targetVersion:manifest.version,backupCreated,programmingVerified:true,awaitingPowerCycle:true};
  stage('PASS — programming verified. Power-cycle controller.',1);
  return result;
}
