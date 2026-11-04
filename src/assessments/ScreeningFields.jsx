import React from 'react';
import {startDateBounds} from './screening.js';
export const emptyScreening = () => ({contact_number:'',id_number:'',earliest_start_date:'',first_day_confirmed:false,travel_mode:'',travel_description:'',own_transport:'',assignment_available:'',assignment_note:''});
export default function ScreeningFields({value,onChange}) {
  const bounds=startDateBounds();
  const field=(key)=>(event)=>onChange({...value,[key]:event.target.type==='checkbox'?event.target.checked:event.target.value});
  return <fieldset className="tta-screening"><legend>Availability and travel</legend>
    <label htmlFor="tta-phone">Contact number</label>
    <input id="tta-phone" type="tel" autoComplete="tel" required maxLength={30} value={value.contact_number} onChange={field('contact_number')} placeholder="021 000 0000 or +27 21 000 0000" />
    <label htmlFor="tta-id">South African ID number</label>
    <input id="tta-id" inputMode="numeric" required maxLength={13} value={value.id_number} onChange={field('id_number')} autoComplete="off" aria-describedby="tta-id-help" />
    <p id="tta-id-help" className="tta-form-note">13 digits. Used to link your attempts; masked in reports.</p>
    <label htmlFor="tta-start-date">Earliest date you can start (your first day)</label>
    <input id="tta-start-date" type="date" required min={bounds.min} max={bounds.max} value={value.earliest_start_date} onChange={field('earliest_start_date')} />
    <p className="tta-form-note">Choose a weekday from tomorrow to 90 days from today.</p>
    <label className="tta-consent"><input type="checkbox" required checked={value.first_day_confirmed} onChange={field('first_day_confirmed')} /><span>I confirm this is the first day I can start.</span></label>
    <label htmlFor="tta-travel">How will you travel to the site?</label>
    <p className="tta-form-note">A quarry at the back of Durbanville, between Durbanville and Table View, in a remote area.</p>
    <select id="tta-travel" required value={value.travel_mode} onChange={field('travel_mode')}>
      <option value="">Choose travel mode</option><option value="own_vehicle">Own vehicle</option><option value="lift">Lift from someone</option><option value="public_transport">Public transport</option><option value="other">Other</option>
    </select>
    {['public_transport','other'].includes(value.travel_mode) && <><label htmlFor="tta-route">Route description</label><textarea id="tta-route" required maxLength={300} value={value.travel_description} onChange={field('travel_description')} rows={3}/></>}
    <label htmlFor="tta-transport">Do you have your own transport?</label>
    <select id="tta-transport" required value={value.own_transport} onChange={field('own_transport')}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select>
    <label htmlFor="tta-availability">Are you available for a 2-month assignment?</label>
    <select id="tta-availability" required value={value.assignment_available} onChange={field('assignment_available')}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select>
    {value.assignment_available==='no' && <><label htmlFor="tta-availability-note">Availability note (optional)</label><textarea id="tta-availability-note" maxLength={300} rows={3} value={value.assignment_note} onChange={field('assignment_note')}/></>}
  </fieldset>;
}
