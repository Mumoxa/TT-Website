// Isolated local Pages project. Never binds offers, R2 or any remote resource.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const sandbox=path.join(root,'.wrangler/assessment-sandbox');
const state=path.join(root,'.wrangler/assessment-state');
fs.mkdirSync(sandbox,{recursive:true});
// Wrangler locates its temporary worker and config from the nearest package root.
fs.writeFileSync(path.join(sandbox,'package.json'),JSON.stringify({private:true,type:'module'}));
fs.writeFileSync(path.join(sandbox,'wrangler.toml'),`name = "tt-assessment-local"
compatibility_date = "2026-09-08"
pages_build_output_dir = "./dist"
[[d1_databases]]
binding = "ASSESSMENT_DB"
database_name = "tt-assessment-local"
database_id = "local-assessment-only"
migrations_dir = "${root}/migrations/assessments"
`);
const vars=path.join(sandbox,'.dev.vars');
if(!fs.existsSync(vars))fs.writeFileSync(vars,'ASSESSMENT_ADMIN_KEY='+crypto.randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
let privateVars=fs.readFileSync(vars,'utf8');
for(const [name,value] of [['ASSESSMENT_ID_HASH_KEY',crypto.randomBytes(32).toString('hex')],['ASSESSMENT_PII_KEY',crypto.randomBytes(32).toString('base64')]]) {
 if(!new RegExp('^'+name+'=','m').test(privateVars)){privateVars+='\n'+name+'='+value+'\n';fs.writeFileSync(vars,privateVars,{mode:0o600});}
}
const functions=path.join(sandbox,'functions');
if(!fs.existsSync(functions))fs.symlinkSync(path.join(root,'functions'),functions,'dir');
const mode=process.argv[2];
let args;
if(mode==='migrate')args=['d1','migrations','apply','tt-assessment-local','--local','--persist-to',state];
else if(mode==='dev') { fs.cpSync(path.join(root,'dist'),path.join(sandbox,'dist'),{recursive:true}); args=['pages','dev','dist','--port','8790','--ip','127.0.0.1','--persist-to',state]; }
else if(mode==='verify')args=['d1','execute','tt-assessment-local','--local','--persist-to',state,'--command',"SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('assessment_definitions','assessment_versions','candidates','invitations','attempts','workbook_snapshots','results','audit_events') ORDER BY name"];
else if(mode==='prepare')process.exit(0);
else throw new Error('Use prepare, migrate, verify or dev');
const child=spawnSync(path.join(root,'node_modules/.bin/wrangler'),args,{cwd:sandbox,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(root,'.wrangler/logs')}});
if(child.error)throw child.error;
process.exit(child.status??1);
