// Artificial identity/screening data only; never use for real candidates.
export function syntheticId(seed=0) {
 const prefix='000101'+String(5000+seed%1000).padStart(4,'0')+'08';
 let sum=0;
 for(let i=0;i<prefix.length;i++){let digit=Number(prefix[i]);if(i%2===1){digit*=2;if(digit>9)digit-=9;}sum+=digit;}
 return prefix+String((10-sum%10)%10);
}
export function screeningFixture(seed=0,now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=type=>parts.find(p=>p.type===type).value;
 const day=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
 do{day.setUTCDate(day.getUTCDate()+1);}while([0,6].includes(day.getUTCDay()));
 return {contact_number:'0210000000',id_number:syntheticId(seed),earliest_start_date:day.toISOString().slice(0,10),first_day_confirmed:true,travel_mode:'own_vehicle',travel_description:'',own_transport:'yes',assignment_available:'yes',assignment_note:''};
}
