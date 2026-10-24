require('ts-node/register/transpile-only');
require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AppReleasesService}=require('./app-releases.service.ts');
const {BillingAdminGuard}=require('../platform-billing/billing-admin.guard.ts');
const {isPlatformManagementRequest}=require('../platform-billing/control-access.ts');
const config={get:k=>({GYMDASH_SECRET:'secret',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test'})[k]};
const draft={id:'a',versionName:'1.0',versionCode:10,packageName:'com.gympass.gympass_sn',notes:'Changes',sizeBytes:123,sha256:'a'.repeat(64),objectKey:'private/a.apk',status:'DRAFT',createdAt:new Date(),publishedAt:null};
function fixture(records=[{...draft}]) {
 const match=(r,w)=>!w||Object.entries(w).every(([k,v])=>r[k]===v);
 const repo={findUnique:async({where})=>records.find(r=>match(r,where))||null,findFirst:async({where,orderBy})=>records.filter(r=>match(r,where)).sort((a,b)=>b.versionCode-a.versionCode)[0]||null,findMany:async()=>records,update:async({where,data})=>Object.assign(records.find(r=>r.id===where.id),data)};
 let lockCount=0;const tx={appRelease:repo,$executeRaw:async()=>{lockCount++;}};
 const db={appRelease:repo,$transaction:async fn=>fn(tx)};
 const storage={get:async()=>({stream:'apk'})};
 return {service:new AppReleasesService(db,storage),records,get locks(){return lockCount;}};
}
test('latest and APK never expose a draft or its storage key',async()=>{
 const {service}=fixture();assert.deepEqual(await service.latest(),{release:null});await assert.rejects(service.download('a'),e=>e.status===404);
});
test('publication is explicit, idempotent and rejects older/equal versions',async()=>{
 const f=fixture();const published=await f.service.publish('a');assert.equal(published.status,'PUBLISHED');assert.ok(published.publishedAt);assert.equal((await f.service.publish('a')).publishedAt,published.publishedAt);assert.ok(f.locks>=2);
 f.records.push({...draft,id:'older',versionCode:9});await assert.rejects(f.service.publish('older'),e=>e.status===409);
 f.records.push({...draft,id:'equal'});await assert.rejects(f.service.publish('equal'),e=>e.status===409);
 const latest=await f.service.latest();assert.equal(latest.release.id,'a');assert.equal(latest.release.apkUrl,'/api/v1/app-releases/android/a/apk');assert.equal(latest.release.objectKey,undefined);
});
test('platform allowlist and secret required even for ordinary ADMIN',()=>{
 const user={role:'ADMIN',email:'platform@example.test'};const headers={'x-gymdash-secret':'secret'};
 assert.equal(isPlatformManagementRequest(user,headers,'/api/v1/app-releases/admin/a/publish',config),true);
 assert.equal(isPlatformManagementRequest({...user,email:'gym@example.test'},headers,'/api/v1/app-releases/admin',config),false);
 const guard=new BillingAdminGuard(config);const ctx=(u,h)=>({switchToHttp:()=>({getRequest:()=>({user:u,headers:h})})});
 assert.equal(guard.canActivate(ctx(user,headers)),true);assert.throws(()=>guard.canActivate(ctx({...user,email:'gym@example.test'},headers)));assert.throws(()=>guard.canActivate(ctx(user,{})));
});
test('binary downloads bypass JSON success wrapping', async()=>{
 const {TransformInterceptor}=require('../common/interceptors/transform.interceptor.ts');const {StreamableFile}=require('@nestjs/common');const {of,firstValueFrom}=require('rxjs');
 const apk=new StreamableFile(Buffer.from('APK'));const value=await firstValueFrom(new TransformInterceptor().intercept({}, {handle:()=>of(apk)}));assert.equal(value,apk);
});
test('APK metadata rejects random data and extracts compiled binary Android manifest',async t=>{
 const {readApkMetadata}=require('./apk-metadata.ts');const fs=require('node:fs/promises');const path=require('node:path');const file=path.join(require('node:os').tmpdir(),'bad-apk-'+require('node:crypto').randomUUID());await fs.writeFile(file,'not apk');t.after(()=>fs.unlink(file));await assert.rejects(readApkMetadata(file),e=>e.status===400);
 const apk=path.resolve('../gympass_sn/build/app/outputs/flutter-apk/gympass-sn-1.0.11.apk');try {await fs.access(apk);}catch {t.diagnostic('Compiled APK fixture unavailable');return;}
 const parsed=await readApkMetadata(apk);assert.equal(parsed.packageName,'com.gympass.gympass_sn');assert.equal(parsed.versionName,'1.0.11');assert.ok(parsed.versionCode>0);
});
test('real HTTP guards reject secret-only and gym ADMIN; binary GET stays raw', async t=>{
 const {Test}=require('@nestjs/testing'); const {ConfigModule}=require('@nestjs/config');const {PassportModule}=require('@nestjs/passport');const {JwtStrategy}=require('../auth/strategies/jwt.strategy.ts');const {PrismaService}=require('../prisma/prisma.service.ts');const {ReleaseStorageService}=require('./release-storage.service.ts');const {AppReleasesModule}=require('./app-releases.module.ts');const {TransformInterceptor}=require('../common/interceptors/transform.interceptor.ts');const {BillingAccessService}=require('../platform-billing/access.service.ts');const {BillingAccessModule}=require('../platform-billing/access.module.ts');const {Readable}=require('node:stream');const jwt=require('jsonwebtoken');
 const users={platform:{id:'platform',gymId:'blocked',email:'platform@example.test',role:'ADMIN',actif:true},gym:{id:'gym',gymId:'blocked',email:'gym@example.test',role:'ADMIN',actif:true}};
 const configValues={JWT_SECRET:'test-local-jwt',GYMDASH_SECRET:'secret',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test'};
 const row={...draft,sizeBytes:3,status:'PUBLISHED',publishedAt:new Date()};
 const db={user:{findUnique:async({where})=>users[where.id]},appRelease:{findMany:async()=>[row],findUnique:async({where})=>where.id==='a'?row:null,findFirst:async()=>row}};
 const mod=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,load:[()=>configValues]}),PassportModule,AppReleasesModule,BillingAccessModule],providers:[JwtStrategy]}).overrideProvider(PrismaService).useValue(db).overrideProvider(ReleaseStorageService).useValue({get:async()=>Readable.from(Buffer.from('APK'))}).overrideProvider(BillingAccessService).useValue({assertAllowed:async()=>{throw new (require('@nestjs/common').HttpException)('blocked',402)}}).compile();
 const app=mod.createNestApplication();app.setGlobalPrefix('api/v1');app.useGlobalInterceptors(new TransformInterceptor());await app.listen(0,'127.0.0.1');t.after(()=>app.close());const origin=await app.getUrl();const token=id=>jwt.sign({sub:id},configValues.JWT_SECRET);
 const path='/api/v1/app-releases/admin';const auth=id=>({Authorization:'Bearer '+token(id),'x-gymdash-secret':'secret'});
 assert.equal((await fetch(origin+path,{headers:{'x-gymdash-secret':'secret'}})).status,401);
 assert.equal((await fetch(origin+path,{headers:auth('gym')})).status,402);
 const allowed=await fetch(origin+path,{headers:auth('platform')});assert.equal(allowed.status,200);assert.equal((await allowed.json()).data.items[0].objectKey,undefined);
 assert.equal((await fetch(origin+path,{headers:{Authorization:'Bearer '+token('platform')}})).status,402);
 const fs=require('node:fs/promises');const tempRoot=require('node:os').tmpdir();const before=new Set((await fs.readdir(tempRoot)).filter(name=>name.startsWith('gympass-apk-')));
 const multipart=new FormData();multipart.append('apk',new Blob(['invalid-apk']), 'fixture.apk');multipart.append('notes','fixture');multipart.append('unexpected','reject');
 const rejectedUpload=await fetch(origin+path,{method:'POST',headers:auth('platform'),body:multipart});assert.equal(rejectedUpload.status,400);
 const leftover=(await fs.readdir(tempRoot)).filter(name=>name.startsWith('gympass-apk-')&&!before.has(name));assert.deepEqual(leftover,[]);
 const apk=await fetch(origin+'/api/v1/app-releases/android/a/apk');assert.equal(apk.status,200);assert.equal(await apk.text(),'APK');assert.equal(apk.headers.get('content-type'),'application/vnd.android.package-archive');
 assert.equal((await fetch(origin+'/api/v1/app-releases/android/missing/apk')).status,404);
});

test('rejected uploads remove their temporary file and never store bytes', async()=>{
 const fs=require('node:fs/promises');const path=require('node:path');const temp=path.join(require('node:os').tmpdir(),'gympass-release-test-'+require('node:crypto').randomUUID());await fs.writeFile(temp,'not apk');let stored=false;
 const service=new AppReleasesService({}, {put:async()=>{stored=true;}});await assert.rejects(service.createDraft({path:temp,size:7},'notes','admin'),e=>e.status===400);assert.equal(stored,false);await assert.rejects(fs.access(temp));
});
test('private release bucket refuses public policy and public-photo bucket configuration',async()=>{
 const {ReleaseStorageService}=require('./release-storage.service.ts');const cfg={get:(key,fallback)=>({MINIO_BUCKET:'photos',MINIO_RELEASES_BUCKET:'photos'})[key]??fallback};assert.throws(()=>new ReleaseStorageService(cfg));
 const storage=new ReleaseStorageService({get:(_key,fallback)=>fallback});let uploaded=false;storage.client={bucketExists:async()=>true,getBucketPolicy:async()=>JSON.stringify({Statement:[{Effect:'Allow',Principal:'*'}]}),putObject:async()=>{uploaded=true;}};
 await assert.rejects(storage.put('x','unused',2),/no public bucket policy/);assert.equal(uploaded,false);
 storage.client.getBucketPolicy=async()=>JSON.stringify({Statement:{Effect:'Allow',Principal:'*'}});
 await assert.rejects(storage.put('x','unused',2),/no public bucket policy/);
});
test('PostgreSQL concurrent publication serializes across independent services', {skip:!process.env.APP_RELEASES_TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.APP_RELEASES_TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15441');assert.equal(url.pathname,'/gympass_releases_test');
 const {PrismaClient}=require('@prisma/client');const {randomUUID}=require('node:crypto');const db=new PrismaClient({datasources:{db:{url:url.href}}});
 const ids=[];t.after(async()=>{try{await db.appRelease.deleteMany({where:{id:{in:ids}}});}finally{await db.$disconnect();}});
 const old=await db.appRelease.count();assert.equal(old,0,'Dedicated fixture must be empty');
 const make=async versionCode=>{const row=await db.appRelease.create({data:{packageName:draft.packageName,versionName:'fixture',versionCode,notes:'fixture',sizeBytes:3,sha256:'a'.repeat(64),objectKey:'fixture/'+randomUUID(),createdById:'fixture'}});ids.push(row.id);return row;};
 const a=await make(10),b=await make(11);const s1=new AppReleasesService(db,{}),s2=new AppReleasesService(db,{});
 const result=await Promise.allSettled([s1.publish(a.id),s2.publish(b.id)]);assert.equal(result[1].status,'fulfilled');assert.equal((await s1.latest()).release.versionCode,11);assert.ok(result[0].status==='fulfilled'||result[0].reason.status===409);
 const same=await Promise.all([s1.publish(b.id),s2.publish(b.id)]);assert.equal(same[0].publishedAt,same[1].publishedAt);
 const equal=await make(11);await assert.rejects(s1.publish(equal.id),e=>e.status===409);
});
test('binary manifest validator rejects duplicate-string expansion before decoding',()=>{
 const {validateBinaryManifest}=require('./binary-manifest.ts');const n=1000,s=32767,start=28+4*n,total=8+start+s+5,b=Buffer.alloc(total);
 b.writeUInt16LE(3,0);b.writeUInt16LE(8,2);b.writeUInt32LE(total,4);b.writeUInt16LE(1,8);b.writeUInt16LE(28,10);b.writeUInt32LE(total-8,12);b.writeUInt32LE(n,16);b.writeUInt32LE(256,24);b.writeUInt32LE(start,28);const off=8+start;b[off]=255;b[off+1]=255;b[off+2]=255;b[off+3]=255;b.fill(65,off+4,off+4+s);
 assert.throws(()=>validateBinaryManifest(b),/String expansion budget/);
 const invalid=Buffer.from(b);invalid.writeUInt32LE(0xffffffff,36);assert.throws(()=>validateBinaryManifest(invalid),/String offset/);
 const utf16=Buffer.from(b);utf16.writeUInt32LE(1,16);utf16.writeUInt32LE(0,24);assert.throws(()=>validateBinaryManifest(utf16),/Invalid string length/);
 const truncated=Buffer.from(b);truncated.writeUInt32LE(1,16);truncated.writeUInt32LE(total-8-start-1,36);assert.throws(()=>validateBinaryManifest(truncated),/Invalid UTF8 length/);
 const styles=Buffer.from(b);styles.writeUInt32LE(1,16);styles.writeUInt32LE(1,20);styles.writeUInt32LE(total-8,32);assert.throws(()=>validateBinaryManifest(styles),/Invalid style offset/);
});
