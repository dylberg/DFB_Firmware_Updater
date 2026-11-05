import {ESPLoader,Transport} from './vendor/esptool-js.js';
import {requireThat,validateSecurity} from './core.js';
export class SerialDevice {
  constructor(port,log) {
    this.transport=new Transport(port,true);
    this.loader=new ESPLoader({transport:this.transport,baudrate:115200,terminal:{clean(){},write:log,writeLine:log},debugLogging:false});
  }
  async connect() {
    await this.loader.detectChip();
    requireThat(this.loader.chip?.CHIP_NAME==='ESP32-S3','Select a DFB Slim ESP32-S3 controller.');
    validateSecurity(await this.loader.getSecurityInfo());
    if(this.loader.chip.postConnect) await this.loader.chip.postConnect(this.loader);
    await this.loader.runStub();
    requireThat(this.loader.IS_STUB,'The flash reading service could not start.');
  }
  security() { return this.loader.getSecurityInfo(); }
  async capacity() { const id=await this.loader.readFlashId(); return ((id>>>16)&255)===0x17?0x800000:0; }
  mac() { return this.loader.chip.readMac(this.loader); }
  async read(offset,size,progress=()=>{}) {
    const result=new Uint8Array(size);
    for(let n=0;n<size;n+=0x40000) {
      const count=Math.min(0x40000,size-n);
      const data=await this.loader.readFlash(offset+n,count);
      requireThat(data.length===count,'Controller returned an incomplete flash read.');
      // ESP stub READ_FLASH ends with a separate 16-byte MD5 packet.
      // esptool-js 0.7.1 returns the data without consuming this trailer.
      const digest=await this.transport.read(10000);
      requireThat(digest instanceof Uint8Array && digest.length===16,'Flash read checksum was not received.');
      const hex=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
      requireThat(hex===globalThis.SparkMD5.ArrayBuffer.hash(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),'Flash read checksum mismatch.');
      result.set(data,n); progress(n+count);
    }
    return result;
  }
  async write(files,progress) {
    const total=files.reduce((s,f)=>s+f.size,0);
    await this.loader.writeFlash({fileArray:files.map(f=>({address:f.offset,data:f.data})),flashSize:'keep',flashMode:'keep',flashFreq:'keep',eraseAll:false,compress:true,
      calculateMD5Hash:data=>globalThis.SparkMD5.ArrayBuffer.hash(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),
      reportProgress:(i,w,t)=>progress((files.slice(0,i).reduce((s,f)=>s+f.size,0)+files[i].size*w/t)/total)});
  }
  async close() { await this.transport.disconnect(); }
}
