require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {billingState, addCalendarMonths}=require('./access-policy.ts');
const account={enabled:true,activatedAt:new Date('2026-01-01T12:30:00Z'),paidUntil:new Date('2026-02-01T12:30:00Z')};
test('unconfigured or disabled billing never blocks existing gyms',()=>{
assert.equal(billingState(null,7,new Date('2030-01-01')).status,'NOT_CONFIGURED');
assert.equal(billingState({...account,enabled:false},7,new Date('2030-01-01')).status,'DISABLED');
});
test('paid coverage and configurable grace have exact half-open UTC boundaries',()=>{
assert.equal(billingState(account,7,new Date('2026-02-01T12:29:59Z')).status,'ACTIVE');
assert.equal(billingState(account,7,new Date('2026-02-01T12:30:00Z')).status,'GRACE');
assert.equal(billingState(account,7,new Date('2026-02-08T12:29:59Z')).status,'GRACE');
assert.equal(billingState(account,7,new Date('2026-02-08T12:30:00Z')).status,'BLOCKED');
assert.equal(billingState(account,0,new Date('2026-02-01T12:30:00Z')).status,'BLOCKED');
assert.equal(billingState(account,7,new Date('2026-02-02T12:30:00Z')).daysRemaining,6);
});
test('activated unpaid gym gets only grace, with no phantom paid coverage',()=>{
const result=billingState({...account,paidUntil:null},7,new Date('2026-01-07T12:30:00Z'));
assert.equal(result.status,'GRACE');assert.equal(result.daysRemaining,1);assert.equal(result.paidUntil,null);
assert.equal(result.graceEndsAt,'2026-01-08T12:30:00.000Z');
assert.equal(billingState({...account,paidUntil:null},7,new Date('2026-01-08T12:30:00Z')).status,'BLOCKED');
});
test('calendar months clamp month end and preserve an original renewal anchor',()=>{
assert.equal(addCalendarMonths(new Date('2024-01-31T16:45:12Z'),1).toISOString(),'2024-02-29T16:45:12.000Z');
assert.equal(addCalendarMonths(new Date('2026-01-31T16:45:12Z'),1).toISOString(),'2026-02-28T16:45:12.000Z');
assert.equal(addCalendarMonths(new Date('2026-02-28T16:45:12Z'),1,31).toISOString(),'2026-03-31T16:45:12.000Z');
assert.equal(addCalendarMonths(new Date('2026-12-31T16:45:12Z'),2).toISOString(),'2027-02-28T16:45:12.000Z');
assert.throws(()=>addCalendarMonths(new Date(),0));assert.throws(()=>addCalendarMonths(new Date(),1.5));
});
test('corrupt active policy data fails closed instead of manufacturing available access',()=>{
assert.throws(()=>billingState(account,-1,new Date()));
assert.throws(()=>billingState({...account,paidUntil:new Date('invalid')},7,new Date()));
});
