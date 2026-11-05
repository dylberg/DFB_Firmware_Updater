import {FLASH_SIZE,descriptor,requireThat,same,validateFiles,validateLayout,validateSecurity} from './core.js';
export async function manufacture({device,manifest,files,mode='update',eraseConfirmed=false,stage=()=>{}}) {
  requireThat(['update','factory'].includes(mode),'Select a valid programming mode.');
  requireThat(mode!=='factory'||eraseConfirmed===true,'Confirm erasing all existing settings.');
  await validateFiles(manifest,files);
  stage('Checking controller',0);
  validateSecurity(await device.security());
  requireThat(await device.capacity()===FLASH_SIZE,'This release requires an 8 MB controller.');
  const mac=await device.mac();
  requireThat(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac),'Controller identity could not be read.');
  if(mode==='update') {
    validateLayout(await device.read(0,0x11000),files);
    const ota=descriptor(await device.read(0x190000,256));
    requireThat(!ota||(ota.project==='dfb_slim_fw'&&ota.chip===9&&['0.1.1','1.0.0'].includes(ota.version)),'Unsupported OTA application. Use the qualified service process.');
  }
  requireThat(await device.mac()===mac,'Controller identity changed.');
  if(mode==='factory') {stage('Erasing all flash',0);await device.erase();}
  stage('Programming firmware',0);
  await device.write(files,n=>stage('Programming firmware',n));
  for(let i=0;i<files.length;i++) {
    stage('Verifying firmware',i/files.length);
    const f=files[i];requireThat(same(await device.read(f.offset,f.size),f.data),'Verification failed: '+f.name);
  }
  const result={mac,mode,targetVersion:manifest.version,backupCreated:false,programmingVerified:true,awaitingPowerCycle:true};
  stage('PASS — programming verified. Power-cycle controller.',1);
  return result;
}
