import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {program,validateFiles,validateSecurity,FLASH_SIZE} from '../core.js';
import {releases} from '../releases.js';
const manifest=JSON.parse(await readFile(new URL('../firmware/release.json',import.meta.url)));
const files=await Promise.all(manifest.files.map(async f=>({...f,data:new Uint8Array(await readFile(new URL('../firmware/'+f.name,import.meta.url)))})));
function fixture(options={}){
 const flash=new Uint8Array(FLASH_SIZE).fill(0xff);for(const f of options.sourceFiles??files)flash.set(f.data,f.offset);
 flash.fill(42,0x9000,0xc000);flash.fill(23,0xe000,0xf000);flash.fill(17,0x310000,0x400000);
 let wrote=false,saved=false,macReads=0;
 const device={security:async()=>options.security||{chipId:9,flags:0,flashCryptCnt:0},capacity:async()=>options.capacity||FLASH_SIZE,mac:async()=>options.swap && macReads++?'aa:bb:cc:dd:ee:ff':'8c:bf:ea:0a:1f:30',
 read:async(a,n)=>{if(options.short&&n===FLASH_SIZE)return flash.slice(0,n-1);if(options.readFail)throw Error('read disconnected');let b=flash.slice(a,a+n);if(wrote&&options.badFirmware&&a===0x10000)b[100]^=1;if(wrote&&options.badSettings&&a===0x9000)b[0]^=1;return b;},
 write:async(fs)=>{assert.ok(saved,'must save backup before writing');wrote=true;if(options.writeFail)throw Error('write disconnected');for(const f of fs)flash.set(f.data,f.offset);}};
 const run=(targetManifest=manifest,targetFiles=files)=>program({device,files:targetFiles,manifest:targetManifest,saveBackup:async b=>{assert.equal(b.bytes.length,FLASH_SIZE);if(options.saveFail)throw Error('storage full');saved=true;},stage(){}});
 return {flash,run,get wrote(){return wrote;}};
}
test('real release bytes match all pinned SHA-256 hashes',()=>validateFiles(manifest,files));
test('successful sequence saves backup and verifies firmware/settings; still requires power cycle',async()=>{const f=fixture();const r=await f.run();assert.ok(f.wrote);assert.equal(r.targetVersion,'1.0.0');assert.equal(r.awaitingPowerCycle,true);});
test('legacy factory 0.1.1 accepted with identical partition layout',async()=>{const f=fixture();f.flash.set(new TextEncoder().encode('0.1.1\0'),0x10030);assert.equal((await f.run()).primaryVersion,'0.1.1');});
for(const [name,options] of Object.entries({security:{security:{chipId:9,flags:1,flashCryptCnt:0}},encryption:{security:{chipId:9,flags:0,flashCryptCnt:1}},wrongChip:{security:{chipId:0,flags:0,flashCryptCnt:0}},capacity:{capacity:0x400000},shortBackup:{short:true},readDisconnect:{readFail:true},backupStorage:{saveFail:true},identityChange:{swap:true}}))test(name+' stops before write',async()=>{const f=fixture(options);await assert.rejects(f.run());assert.equal(f.wrote,false);});
for(const [name,offset] of [['partition layout',0x8000],['factory project',0x10050],['factory version',0x10030]])test(name+' mismatch stops before write',async()=>{const f=fixture();f.flash[offset]^=1;await assert.rejects(f.run());assert.equal(f.wrote,false);});
for(const [name,options] of Object.entries({writeDisconnect:{writeFail:true},firmwareMismatch:{badFirmware:true},settingsMismatch:{badSettings:true}}))test(name+' never reports success',async()=>{const f=fixture(options);await assert.rejects(f.run());assert.ok(f.wrote);});
test('damaged firmware package rejected',async()=>{const altered=files.map(f=>({...f,data:f.data.slice()}));altered[3].data[400]^=1;await assert.rejects(validateFiles(manifest,altered),/integrity/);});
test('changed addresses rejected',async()=>{await assert.rejects(validateFiles(manifest,files.map((f,i)=>({...f,offset:i===1?0x10000:f.offset}))),/address/);});
test('incomplete security response rejected',()=>assert.throws(()=>validateSecurity({chipId:9,flags:0})));

const nextManifest=JSON.parse(await readFile(new URL('../firmware/v1.0.1/release.json',import.meta.url)));
const nextFiles=await Promise.all(nextManifest.files.map(async f=>({...f,data:new Uint8Array(await readFile(new URL('../firmware/v1.0.1/'+f.name,import.meta.url)))})));

test('real 1.0.0 to 1.0.1 upgrade and reverse transition preserve storage',async()=>{
 const board=fixture();
 const upgraded=await board.run(nextManifest,nextFiles);
 assert.equal(upgraded.primaryVersion,'1.0.0');
 assert.equal(upgraded.targetVersion,'1.0.1');
 assert.deepEqual(board.flash.slice(0x8000,0x8c00),nextFiles[1].data);
 const downgraded=await board.run();
 assert.equal(downgraded.primaryVersion,'1.0.1');
 assert.equal(downgraded.targetVersion,'1.0.0');
 for(const file of files) assert.deepEqual(board.flash.slice(file.offset,file.offset+file.size),file.data);
 assert.equal(board.flash[0x9000],42);
 assert.equal(board.flash[0xe000],23);
 assert.equal(board.flash[0x310000],17);
});

test('1.0.1 package with the legacy table is rejected',async()=>{
 const board=fixture();
 const wrongTable=nextFiles.map((f,i)=>i===1?files[1]:f);
 await assert.rejects(board.run(nextManifest,wrongTable),/Partition table does not match/);
 assert.equal(board.wrote,false);
});

test('1.0.1 downgrade stops if the secondary slot contains an unknown application',async()=>{
 const board=fixture({sourceFiles:nextFiles});
 board.flash.set(nextFiles[3].data,0x190000);
 board.flash[0x190030]=0x39;
 await assert.rejects(board.run(),/unsupported OTA application/);
 assert.equal(board.wrote,false);
});

test('build selector keeps different images distinct even when versions match',async()=>{
 assert.equal(new Set(releases.map(release=>release.id)).size,7);
 const buildHashes=await Promise.all(releases.map(async release=>{
   const url=new URL('../'+release.path+'release.json',import.meta.url);
   const build=JSON.parse(await readFile(url));
   return build.files[3].sha256;
 }));
 assert.equal(new Set(buildHashes).size,7);
});

for(const release of releases.filter(release=>release.version!=='1.0.1')) {
 test('bench round trip 1.0.1 → '+release.label+' → 1.0.1',async()=>{
   const directory=new URL('../'+release.path,import.meta.url);
   const targetManifest=JSON.parse(await readFile(new URL('release.json',directory)));
   assert.equal(targetManifest.version,release.version);
   const targetFiles=await Promise.all(targetManifest.files.map(async file=>({
     ...file,data:new Uint8Array(await readFile(new URL(file.name,directory))),
   })));
   const board=fixture({sourceFiles:nextFiles});
   await board.run(targetManifest,targetFiles);
   for(const file of targetFiles) {
     assert.deepEqual(board.flash.slice(file.offset,file.offset+file.size),file.data);
   }
   const restored=await board.run(nextManifest,nextFiles);
   assert.equal(restored.primaryVersion,release.version);
   assert.equal(board.flash[0x9000],42);
   assert.equal(board.flash[0xe000],23);
   assert.equal(board.flash[0x310000],17);
 });
}
