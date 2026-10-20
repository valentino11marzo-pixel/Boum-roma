// Predispone un servizio isolato. Non avvia letture: --enable è un passaggio separato dopo il rilascio.
import {mkdir,copyFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.platform!=='darwin') throw new Error('macOS required');
const from=dirname(fileURLToPath(import.meta.url));
const boom=join(homedir(),'.boom'),runtime=join(boom,'smartlink-runtime'),target=join(runtime,'tools/smartlink-worker');
await mkdir(target,{recursive:true,mode:0o700});await mkdir(join(runtime,'tools/smartlink-extension'),{recursive:true,mode:0o700});
for(const file of ['worker.mjs','reader.mjs','package.json','package-lock.json']) {
  if(resolve(from,file)!==resolve(target,file)) await copyFile(join(from,file),join(target,file));
}
await copyFile(join(from,'../smartlink-extension/background.mjs'),join(runtime,'tools/smartlink-extension/background.mjs'));
const env={...process.env,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'};
execFileSync('/opt/homebrew/bin/npm',['ci','--ignore-scripts'],{cwd:target,env,stdio:'inherit'});
execFileSync(process.execPath,[join(target,'node_modules/playwright/cli.js'),'install','chromium'],{cwd:target,env,stdio:'inherit'});
try {await access(join(boom,'smartlink-reader.json'));} catch {await writeFile(join(boom,'smartlink-reader.json'),JSON.stringify({baseUrl:'https://www.boomrome.com'},null,2)+'\n',{mode:0o600,flag:'wx'});}
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const plist=join(homedir(),'Library/LaunchAgents/com.boom.smartlink-reader.plist');
await mkdir(dirname(plist),{recursive:true});
await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>com.boom.smartlink-reader</string>
<key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(join(target,'worker.mjs'))}</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>${escape(join(boom,'smartlink-reader.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(boom,'smartlink-reader.err'))}</string>
</dict></plist>`,{mode:0o600});
if(process.argv.includes('--enable')) {
  execFileSync('/bin/launchctl',['bootstrap','gui/'+process.getuid(),plist],{stdio:'inherit'});
  console.log('SmartLink reader enabled. Check heartbeat and a real import in Portal.');
} else console.log('SmartLink runtime installed; launchd plist prepared but NOT enabled.');
