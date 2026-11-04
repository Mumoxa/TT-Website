// Shared browser/server validation. Screening information never enters grading.
export class ScreeningValidationError extends Error {}
const invalid=message=>{throw new ScreeningValidationError(message);};
const DAY=86400000;
export function southAfricaToday(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=type=>parts.find(p=>p.type===type).value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validateIdNumber(value,now=new Date()) {
 if(typeof value!=='string'||!/^\d{13}$/.test(value))invalid('Enter a valid 13-digit South African ID number.');
 const today=southAfricaToday(now),year=Number(today.slice(0,4)),yy=Number(value.slice(0,2)),month=Number(value.slice(2,4)),day=Number(value.slice(4,6));
 let birthYear=Math.floor(year/100)*100+yy;
 if(`${birthYear}-${value.slice(2,4)}-${value.slice(4,6)}`>today)birthYear-=100;
 const birth=new Date(Date.UTC(birthYear,month-1,day));
 if(month<1||month>12||day<1||birth.getUTCFullYear()!==birthYear||birth.getUTCMonth()!==month-1||birth.getUTCDate()!==day||![0,1].includes(Number(value[10])))invalid('Enter a valid South African ID number.');
 let sum=0;
 for(let i=0;i<13;i++){let digit=Number(value[i]);if(i%2===1){digit*=2;if(digit>9)digit-=9;}sum+=digit;}
 if(sum%10!==0)invalid('The ID number checksum is invalid. Check the number and try again.');
 return value;
}
export function normalizePhone(value) {
 if(typeof value!=='string'||value.length>30)invalid('Enter a valid South African contact number.');
 const phone=value.replace(/[\s()-]/g,'');
 if(/^0[1-9]\d{8}$/.test(phone))return '+27'+phone.slice(1);
 if(/^\+27[1-9]\d{8}$/.test(phone))return phone;
 invalid('Enter a 10-digit South African number starting with 0, or its +27 format.');
}
export function startDateBounds(now=new Date()) {
 const today=Date.parse(southAfricaToday(now)+'T00:00:00Z');
 return {min:new Date(today+DAY).toISOString().slice(0,10),max:new Date(today+90*DAY).toISOString().slice(0,10)};
}
export function validateStartDate(value,now=new Date()) {
 const {min,max}=startDateBounds(now);
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<min||value>max)invalid('Choose a first day from tomorrow through 90 days from today.');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||[0,6].includes(date.getUTCDay()))invalid('Choose a valid weekday, Monday to Friday, as your first day.');
 return value;
}
function note(value,label) {
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.length>300)invalid(label+' must be 300 characters or fewer.');
 return value.trim();
}
export function normalizeScreening(data,now=new Date()) {
 const contact_number=normalizePhone(data?.contact_number);
 const id_number=validateIdNumber(data?.id_number,now);
 const earliest_start_date=validateStartDate(data?.earliest_start_date,now);
 if(data?.first_day_confirmed!==true)invalid('Confirm that the selected date is the first day you can start.');
 if(!['own_vehicle','lift','public_transport','other'].includes(data?.travel_mode))invalid('Choose how you will travel to the site.');
 let travel_description=note(data.travel_description,'The route description');
 if(['public_transport','other'].includes(data.travel_mode)&&!travel_description)invalid('Describe the route you will use to reach the site.');
 if(!['public_transport','other'].includes(data.travel_mode))travel_description='';
 if(!['yes','no'].includes(data.own_transport))invalid('Confirm whether you have your own transport.');
 if(!['yes','no'].includes(data.assignment_available))invalid('Confirm whether you are available for a 2-month assignment.');
 const assignment_note=data.assignment_available==='no'?note(data.assignment_note,'The availability note'):'';
 return {contact_number,id_number,earliest_start_date,first_day_confirmed:true,travel_mode:data.travel_mode,travel_description,own_transport:data.own_transport,assignment_available:data.assignment_available,assignment_note};
}
