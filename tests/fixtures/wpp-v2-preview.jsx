// Dev-only synthetic component harness: no live content, scoring or API.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles.css';
import '../../src/assessments/candidate-ui.css';
import PersonalityQuestions from '../../src/assessments/PersonalityQuestions.jsx';
const options=['a','b','c','d'].map(id=>({id,label:`Synthetic option ${id.toUpperCase()}`}));
const form={instructions:'Synthetic fixture for a component-only test.',items:Array.from({length:50},(_,i)=>({id:`b${i+1}`,prompt:`Synthetic statement ${i+1}: this deliberately long test prompt stays inside the question card at each viewport width.`,options:[...options,{id:'e',label:'Synthetic option E'}]})),reasoning:{sections:['numeric','cognitive'].map(id=>({id,title:`Synthetic ${id} reasoning`,instructions:'Choose one synthetic option.',items:Array.from({length:6},(_,i)=>({id:`${id==='numeric'?'n':'c'}${i+1}`,prompt:`Synthetic ${id} item ${i+1}.`,options}))}))}};
if (new URLSearchParams(location.search).get('version')==='v1') delete form.reasoning;
createRoot(document.getElementById('root')).render(<PersonalityQuestions form={form} onSave={async({revision})=>({revision:revision+1})} onSubmit={async()=>({status:'submitted'})}/>);
