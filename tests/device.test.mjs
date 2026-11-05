import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {SerialDevice} from '../device.js';
globalThis.self=globalThis;
vm.runInThisContext(await readFile(new URL('../vendor/spark-md5.min.js',import.meta.url),'utf8'));
function reader({bad=false,short=false}={}) {
 const dev=Object.create(SerialDevice.prototype);let pending=null,calls=0;
 dev.loader={readFlash:async(a,n)=>{assert.equal(pending,null,'must consume checksum before next command');const bytes=new Uint8Array(short?n-1:n).fill(a%251);pending=new Uint8Array(createHash('md5').update(bytes).digest());if(bad)pending[0]^=1;calls++;return bytes;}};
 dev.transport={read:async()=>{const p=pending;pending=null;return p;}};
 return {dev,get calls(){return calls;}};
}
test('real vendor module imports; chunked reads consume and check stub MD5 trailers',async()=>{const f=reader();const b=await f.dev.read(0,0x80001);assert.equal(b.length,0x80001);assert.equal(f.calls,3);});
test('corrupt transport checksum rejected',async()=>{await assert.rejects(reader({bad:true}).dev.read(0,100),/checksum mismatch/);});
test('short transport read rejected',async()=>{await assert.rejects(reader({short:true}).dev.read(0,100),/incomplete/);});
test('write options retain headers, avoid erase-all, and calculate real MD5',async()=>{const dev=Object.create(SerialDevice.prototype);dev.loader={writeFlash:async o=>{assert.equal(o.eraseAll,false);for(const k of ['flashMode','flashSize','flashFreq'])assert.equal(o[k],'keep');assert.equal(o.calculateMD5Hash(new Uint8Array([1,2,3])),createHash('md5').update(new Uint8Array([1,2,3])).digest('hex'));}};await dev.write([{offset:0,size:3,data:new Uint8Array([1,2,3])}],()=>{});});
