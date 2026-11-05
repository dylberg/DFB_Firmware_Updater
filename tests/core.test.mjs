import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {program,validateFiles,validateSecurity,FLASH_SIZE} from '../core.js';
const manifest=JSON.parse(await readFile(new URL('../firmware/release.json',import.meta.url)));
const files=await Promise.all(manifest.files.map(async f=>({...f,data:new Uint8Array(await readFile(new URL('../firmware/'+f.name,import.meta.url)))})));
function fixture(options={}){
 const flash=new Uint8Array(FLASH_SIZE).fill(0xff);for(const f of files)flash.set(f.data,f.offset);
 flash.fill(42,0x9000,0xc000);flash.fill(23,0xe000,0xf000);flash.fill(17,0x310000,0x400000);
 let wrote=false,saved=false,macReads=0;
 const device={security:async()=>options.security||{chipId:9,flags:0,flashCryptCnt:0},capacity:async()=>options.capacity||FLASH_SIZE,mac:async()=>options.swap && macReads++?'aa:bb:cc:dd:ee:ff':'8c:bf:ea:0a:1f:30',
 read:async(a,n)=>{if(options.short&&n===FLASH_SIZE)return flash.slice(0,n-1);if(options.readFail)throw Error('read disconnected');let b=flash.slice(a,a+n);if(wrote&&options.badFirmware&&a===0x10000)b[100]^=1;if(wrote&&options.badSettings&&a===0x9000)b[0]^=1;return b;},
 write:async(fs)=>{assert.ok(saved,'must save backup before writing');wrote=true;if(options.writeFail)throw Error('write disconnected');for(const f of fs)flash.set(f.data,f.offset);}};
 const run=()=>program({device,files,manifest,saveBackup:async b=>{assert.equal(b.bytes.length,FLASH_SIZE);if(options.saveFail)throw Error('storage full');saved=true;},stage(){}});
 return {flash,run,get wrote(){return wrote;}};
}
test('real release bytes match all pinned SHA-256 hashes',()=>validateFiles(manifest,files));
test('successful sequence saves backup and verifies firmware/settings; still requires power cycle',async()=>{const f=fixture();const r=await f.run();assert.ok(f.wrote);assert.equal(r.targetVersion,'1.0.0');assert.equal(r.awaitingPowerCycle,true);});
test('legacy factory 0.1.1 accepted with identical partition layout',async()=>{const f=fixture();f.flash.set(new TextEncoder().encode('0.1.1\0'),0x10030);assert.equal((await f.run()).factoryVersion,'0.1.1');});
for(const [name,options] of Object.entries({security:{security:{chipId:9,flags:1,flashCryptCnt:0}},encryption:{security:{chipId:9,flags:0,flashCryptCnt:1}},wrongChip:{security:{chipId:0,flags:0,flashCryptCnt:0}},capacity:{capacity:0x400000},shortBackup:{short:true},readDisconnect:{readFail:true},backupStorage:{saveFail:true},identityChange:{swap:true}}))test(name+' stops before write',async()=>{const f=fixture(options);await assert.rejects(f.run());assert.equal(f.wrote,false);});
for(const [name,offset] of [['partition layout',0x8000],['factory project',0x10050],['factory version',0x10030]])test(name+' mismatch stops before write',async()=>{const f=fixture();f.flash[offset]^=1;await assert.rejects(f.run());assert.equal(f.wrote,false);});
for(const [name,options] of Object.entries({writeDisconnect:{writeFail:true},firmwareMismatch:{badFirmware:true},settingsMismatch:{badSettings:true}}))test(name+' never reports success',async()=>{const f=fixture(options);await assert.rejects(f.run());assert.ok(f.wrote);});
test('damaged firmware package rejected',async()=>{const altered=files.map(f=>({...f,data:f.data.slice()}));altered[3].data[400]^=1;await assert.rejects(validateFiles(manifest,altered),/integrity/);});
test('changed addresses rejected',async()=>{await assert.rejects(validateFiles(manifest,files.map((f,i)=>({...f,offset:i===1?0x10000:f.offset}))),/address/);});
test('incomplete security response rejected',()=>assert.throws(()=>validateSecurity({chipId:9,flags:0})));
