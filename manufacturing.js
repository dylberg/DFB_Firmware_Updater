import {SerialDevice} from './device.js';
import {requireThat, validateFiles} from './core.js';
import {manufacture, restoreBackup, validateBackup} from './manufacturing-core.js?v=0.2';

const $ = id => document.getElementById(id);
const mode = () => document.querySelector('input[name=mode]:checked').value;
let device, mac, manifest, files;
let busy = false, ready = false, firmwareReady = false;
let logs = [], backups = [], selectedBackup, session = crypto.randomUUID();

function log(message) {
  logs.push(new Date().toISOString() + ' ' + String(message).trim());
  $('terminal').textContent = logs.slice(-400).join('\n');
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function controls() {
  const selected = mode();
  const restore = selected === 'restore';
  $('erasebox').hidden = selected !== 'factory';
  $('restorebox').hidden = !restore;
  $('connect').disabled = busy || !!device || !ready;
  $('disconnect').disabled = busy || !device;
  $('program').disabled = busy || !device || (!restore && !firmwareReady)
    || (selected === 'factory' && !$('erase').checked)
    || (restore && (!selectedBackup || !$('overwrite').checked));
  $('program').textContent = {update: 'Update firmware', factory: 'Erase & program', restore: 'Restore backup'}[selected];
  document.querySelectorAll('input, select').forEach(input => { input.disabled = busy; });
}

function openBackups() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TraffiCalm-DFB-backups', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBackup(backup) {
  try { await navigator.storage?.persist(); } catch {}
  const database = await openBackups();
  const record = {...backup, id: crypto.randomUUID(), date: new Date().toISOString(), source: 'Pre-erase factory backup'};
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite', {durability: 'strict'});
      transaction.objectStore('sessions').add(record);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('Backup storage failed.'));
    });
    const saved = await requestResult(database.transaction('sessions').objectStore('sessions').get(record.id));
    await validateBackup(saved, mac);
    log('Pre-erase backup saved and verified: ' + record.id + '; SHA-256 ' + record.sha256);
    return saved;
  } finally {
    database.close();
  }
}

async function loadBackups() {
  backups = [];
  selectedBackup = null;
  $('backup').replaceChildren(new Option('Choose a backup', ''));
  $('overwrite').checked = false;
  $('backup-status').textContent = '';
  if (!device || mode() !== 'restore') return;
  const database = await openBackups();
  try {
    const records = await requestResult(database.transaction('sessions').objectStore('sessions').getAll());
    backups = records.filter(record => record.mac?.toLowerCase() === mac)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const record of backups) {
      const date = new Date(record.date).toLocaleString();
      const label = [date, record.source || 'Customer updater backup', record.factoryVersion].filter(Boolean).join(' / ');
      $('backup').add(new Option(label, record.id));
    }
    $('backup-status').textContent = backups.length ? 'Select a backup taken before the failure.' : 'No backup for this controller in this browser profile.';
  } finally {
    database.close();
  }
}

async function close() {
  const connected = device;
  device = null;
  mac = null;
  backups = [];
  selectedBackup = null;
  try { await connected?.close(); } catch (error) { log(error.message); }
  $('device').textContent = 'No controller connected';
  $('identity').textContent = 'Close other serial programming tools.';
  $('dot').className = 'dot';
}

document.querySelectorAll('input[name=mode]').forEach(input => {
  input.onchange = async () => {
    busy = true;
    $('erase').checked = false;
    controls();
    try { await loadBackups(); } catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  };
});
$('backup').onchange = async () => {
  busy = true;
  selectedBackup = null;
  $('overwrite').checked = false;
  controls();
  try {
    const backup = backups.find(record => record.id === $('backup').value);
    if (backup) {
      await validateBackup(backup, mac);
      selectedBackup = backup;
      $('backup-status').textContent = 'Backup verified for ' + mac + '.';
    } else {
      $('backup-status').textContent = 'Select a backup taken before the failure.';
    }
  } catch (error) {
    $('backup-status').textContent = error.message;
  } finally {
    busy = false;
    controls();
  }
};
$('erase').onchange = controls;
$('overwrite').onchange = controls;

$('connect').onclick = async () => {
  busy = true;
  controls();
  try {
    const port = await navigator.serial.requestPort({filters: [{usbVendorId: 0x303a}]});
    $('erase').checked = false;
    $('progress').value = 0;
    log('Manufacturing 0.2; connecting controller');
    status('Connecting.');
    device = new SerialDevice(port, log);
    const connected = device;
    connected.erase = () => connected.loader.eraseFlash();
    await connected.connect();
    mac = (await connected.mac()).toLowerCase();
    $('device').textContent = 'ESP32-S3 controller connected';
    $('identity').textContent = mac;
    $('dot').className = 'dot connected';
    await loadBackups();
    status('Ready. Check the selected mode.');
  } catch (error) {
    await close();
    status(error.name === 'NotFoundError' ? 'No controller selected.' : 'Connection failed: ' + error.message, true);
    log(error.message);
  } finally {
    busy = false;
    controls();
  }
};

$('program').onclick = async () => {
  busy = true;
  controls();
  const selected = mode();
  let writeStarted = false, wake;
  const stage = (message, progress) => {
    if (['Erasing all flash', 'Programming firmware', 'Restoring flash'].includes(message)) writeStarted = true;
    status(message);
    $('progress').value = progress;
    if (progress === 0) log(message);
  };
  try {
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
    log('Selected mode: ' + selected);
    const result = selected === 'restore'
      ? await restoreBackup({device, backup: selectedBackup, confirmed: $('overwrite').checked, stage})
      : await manufacture({device, manifest, files, mode: selected, eraseConfirmed: $('erase').checked, saveBackup, stage});
    log(JSON.stringify(result));
  } catch (error) {
    status('FAIL - ' + error.message + (writeStarted ? ' Save log and reconnect for recovery.' : ' Flash was left untouched.'), true);
    log('FAIL: ' + error.message);
  } finally {
    await close();
    await wake?.release().catch(() => {});
    $('erase').checked = false;
    $('overwrite').checked = false;
    busy = false;
    controls();
  }
};

$('disconnect').onclick = async () => {
  busy = true;
  controls();
  await close();
  $('erase').checked = false;
  $('overwrite').checked = false;
  busy = false;
  controls();
  status('Disconnected. Power-cycle to resume normal operation.');
};

$('log').onclick = () => {
  const url = URL.createObjectURL(new Blob([logs.join('\n')], {type: 'text/plain'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'TraffiCalm-manufacturing-' + session + '.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});

async function fetchFile(path) {
  const response = await fetch(path, {cache: 'no-store'});
  requireThat(response.ok, 'Unable to load ' + path);
  return response;
}

try {
  requireThat(isSecureContext && 'serial' in navigator, 'Use desktop Chrome or Edge over HTTPS or localhost.');
  ready = true;
  manifest = await (await fetchFile('./firmware/release.json')).json();
  files = await Promise.all(manifest.files.map(async file => {
    requireThat(/^[a-z0-9_.-]+\.bin$/i.test(file.name), 'Invalid firmware filename.');
    return {...file, data: new Uint8Array(await (await fetchFile('./firmware/' + file.name)).arrayBuffer())};
  }));
  await validateFiles(manifest, files);
  firmwareReady = true;
  status('Ready to connect.');
} catch (error) {
  status(error.message + (ready ? ' Backup restore is available.' : ''), true);
  log(error.message);
}
controls();

