// Explicit, single-member maintenance operation. No notifications or outbound messages.
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
async function remove(){
 const phone=process.argv[2];if(!/^7[05678]\d{7}$/.test(phone||''))throw Error('A Senegal local phone is required');
 const where={telephone:{in:[phone,'+221'+phone,'221'+phone,'00221'+phone]}};
 const matches=await db.member.findMany({where,select:{id:true,gymId:true,numeroCarte:true,_count:{select:{payments:true,entries:true,subscriptions:true,sessionCards:true}}}});
 if(!process.argv.includes('--execute')){console.log(JSON.stringify({matches}));return;}
 const expected=process.argv.find(a=>a.startsWith('--id='))?.slice(5);
 if(matches.length!==1||matches[0].id!==expected)throw Error('Expected exactly the audited member; nothing removed');
 const member=matches[0];
 await db.$transaction(async tx=>{
  const current=await tx.member.findFirst({where:{...where,id:member.id,gymId:member.gymId}});
  if(!current)throw Error('Member identity changed');
  await tx.entry.deleteMany({where:{memberId:member.id}});
  await tx.payment.deleteMany({where:{memberId:member.id}});
  await tx.sessionCard.deleteMany({where:{memberId:member.id}});
  await tx.subscription.deleteMany({where:{memberId:member.id}});
  await tx.member.delete({where:{id:member.id}});
 });
 if(await db.member.count({where}))throw Error('Deletion verification failed');
 console.log(JSON.stringify({deleted:member,remaining:0}));
}
remove().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
