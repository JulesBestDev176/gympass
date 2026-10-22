// Read-only preflight. Outputs identifiers and counts, never phone numbers.
require('dotenv').config();
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
function normalize(value){
 const digits=String(value??'').replace(/\D/g,'');
 if(/^7[05678]\d{7}$/.test(digits))return '+221'+digits;
 if(/^07[05678]\d{7}$/.test(digits))return '+221'+digits.slice(1);
 if(/^2217[05678]\d{7}$/.test(digits))return '+'+digits;
 if(/^002217[05678]\d{7}$/.test(digits))return '+'+digits.slice(2);
 return null;
}
(async()=>{
 const users=await db.user.findMany({select:{id:true,gymId:true,telephone:true}});
 const groups=new Map();const incomplete=[];
 for(const user of users){const phone=normalize(user.telephone);if(!phone){incomplete.push({userId:user.id,gymId:user.gymId});continue;}
 const key=user.gymId+':'+phone;const group=groups.get(key)??[];group.push({userId:user.id,gymId:user.gymId});groups.set(key,group);}
 const duplicates=[...groups.values()].filter(group=>group.length>1);
 console.log(JSON.stringify({total:users.length,incomplete,duplicates},null,2));
 if(duplicates.length)process.exitCode=2;
})().catch(()=>{console.error('Audit indisponible. Vérifiez la connexion à la base.');process.exitCode=1;}).finally(()=>db.$disconnect());
