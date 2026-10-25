const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepare}=require('./branding-preflight.cjs');
test('branding migration changes only its own schema and refuses partial states',async()=>{
 let commands=[];
 const db=(applied,columns)=>({$queryRawUnsafe:async sql=>sql.includes('_prisma_migrations')?applied:columns.map(column_name=>({column_name}))});
 await prepare(db([],[]),async args=>commands.push(args));
 assert.equal(commands.length,2);assert.equal(commands[0][0],'db');assert.equal(commands[1][1],'resolve');assert.ok(commands[0].join(' ').includes('20261025160000_gym_document_branding'));
 commands=[];await prepare(db([{finished_at:new Date()}],['logoUrl','brandColor']),async args=>commands.push(args));assert.equal(commands.length,0);
 await assert.rejects(prepare(db([],['logoUrl']),async()=>{throw Error('must not execute');}),/needs review/);
 await assert.rejects(prepare(db([{finished_at:new Date()}],['logoUrl']),async()=>{}),/differs/);
});
