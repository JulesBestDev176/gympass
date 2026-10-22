require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');const {SchedulerService}=require('./scheduler.service.ts');
for(const method of ['sendExpirationReminderJ1','sendExpiredNotification']){
 test(method+' does not notify a superseded registration period',async()=>{
  let sends=0;const sub={id:'old',dateExpiration:new Date(Date.now()+86400000),member:{id:'member',gymId:'gym',nom:'Diop',prenom:'Awa',telephone:'+221770000000',carteActive:true}};
  const service=new SchedulerService({subscription:{findMany:async()=>[sub],findFirst:async()=>({id:'renewed'})}},{sendMessage:async()=>{sends++;}},{createAndPush:async()=>{}});
  await service[method]();assert.equal(sends,0);
 });
}
