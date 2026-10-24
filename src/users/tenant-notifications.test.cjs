require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {UsersService}=require('./users.service.ts');
const {AuthService}=require('../auth/auth.service.ts');
const {NotificationsService}=require('../notifications/notifications.service.ts');

test('a device push token cannot remain registered to a previous gym account',async()=>{
 const users=[{id:'old',gymId:'a',actif:true,fcmToken:'device-token'},{id:'new',gymId:'b',actif:true,fcmToken:null}];
 let locks=0;
 const db={user:{
  update:async({where,data})=>Object.assign(users.find(u=>u.id===where.id),data),
  updateMany:async({where,data})=>{let count=0;for(const user of users)if(user.fcmToken===where.fcmToken&&user.id!==where.id.not){Object.assign(user,data);count++;}return{count};},
  findMany:async({where})=>users.filter(u=>u.gymId===where.gymId&&u.actif&&u.fcmToken),
 },notification:{create:async({data})=>data},$executeRaw:async()=>{locks++;}};
 db.$transaction=fn=>fn(db);
 await new UsersService(db,{}).updateFcmToken('new','device-token');
 const pushed=[];await new NotificationsService(db,{sendToTokens:async tokens=>pushed.push(...tokens)}).createAndPush('a','Private A','Private A','SYSTEME');
 assert.deepEqual(pushed,[]);assert.equal(users[0].fcmToken,null);assert.equal(users[1].fcmToken,'device-token');assert.equal(locks,1);
});
test('logout detaches the device from subsequent private push notifications',async()=>{
 let data;
 const service=new AuthService({user:{update:async q=>{data=q.data;}}},{},{},{},{});
 await service.logout('staff');assert.equal(data.fcmToken,null);
});
test('marking a notification read respects recipient as well as gym',async()=>{
 let where;
 const service=new NotificationsService({notification:{updateMany:async q=>{where=q.where;return{count:0};}}},{});
 await service.markRead('a','private-to-other-user','me');
 assert.deepEqual(where,{id:'private-to-other-user',gymId:'a',OR:[{userId:null},{userId:'me'}]});
});
