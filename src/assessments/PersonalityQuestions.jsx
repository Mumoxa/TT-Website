import React, {useEffect, useRef, useState} from 'react';
import './personality-questions.css';

// Unmounted runner component: the host must supply a server-projected form, a
// session-bound save/submit implementation and the approved registration/notice flow.
// It cannot send data or enable the assessment on its own.
export default function PersonalityQuestions({form, initialAnswers = {}, initialRevision = 0, onSave, onSubmit, onLeave}) {
  const [answers,setAnswers]=useState(initialAnswers);
  const [revision,setRevision]=useState(initialRevision);
  const [screen,setScreen]=useState('intro');
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const heading=useRef(null);
  // Latest values for background saves, which must not read a stale render's state.
  const answersRef=useRef(initialAnswers), revisionRef=useRef(initialRevision), dirtyRef=useRef(false), inflightRef=useRef(null), persistRef=useRef(null);
  const statements=Array.isArray(form?.items) ? form.items : [];
  // v1 remains a 50-statement questionnaire. The v2 shape is an explicitly projected,
  // key-free package; until the server supports it, no route supplies this shape.
  const sections = form?.reasoning?.sections;
  const hasReasoning = form?.reasoning != null;
  const validReasoning = !hasReasoning || (Array.isArray(sections) && sections.length===2 && sections[0]?.id==='numeric' && sections[1]?.id==='cognitive' && sections.every(s=>typeof s.title==='string' && typeof s.instructions==='string' && Array.isArray(s.items) && s.items.length===6 && s.items.every((item,i)=>item?.id===(s.id==='numeric'?'n':'c')+(i+1) && typeof item.prompt==='string' && Array.isArray(item.options) && item.options.length===4)));
  const groups = Array.from({length:Math.ceil(statements.length/5)},(_,i)=>({id:'statement',title:'How accurately does each statement describe you?',items:statements.slice(i*5,i*5+5),offset:i*5}));
  if (validReasoning && hasReasoning) for (const section of sections) for (let i=0;i<2;i++) groups.push({id:section.id,title:section.title,instructions:section.instructions,items:section.items.slice(i*3,i*3+3),offset:i*3});
  const allItems = groups.flatMap(g=>g.items);
  const pages=groups.length;
  const answered=allItems.filter(item=>answers[item.id]!=null).length;
  useEffect(()=>{heading.current?.focus();},[screen]);
  useEffect(()=>{
    if (!dirty) return undefined;
    const guard=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',guard);
    return ()=>window.removeEventListener('beforeunload',guard);
  },[dirty]);
  // Autosave: a change is saved about two seconds after the candidate stops editing, so answers on the
  // current screen are not lost if the time limit closes the attempt before they move on.
  useEffect(()=>{
    if (!dirty) return undefined;
    const timer=setTimeout(()=>{void persistRef.current?.();},2000);
    return ()=>clearTimeout(timer);
  },[answers,dirty]);
  if (statements.length !== 50 || !validReasoning || typeof onSave !== 'function' || typeof onSubmit !== 'function') {
    return <main className="wpp-shell" id="main-content"><h1>Assessment unavailable</h1><p role="status">This questionnaire is not available yet.</p></main>;
  }
  // One save at a time; a save requested while another runs waits for it, then saves what is newer.
  const persist = async () => {
    if (inflightRef.current) await inflightRef.current.catch(()=>{});
    if (!dirtyRef.current) return true;
    const snapshot=answersRef.current, current=revisionRef.current;
    const request=(async()=>{
      const saved=await onSave({answers:snapshot,revision:current});
      if (!Number.isSafeInteger(saved?.revision) || saved.revision !== current+1) throw new Error('Save could not be confirmed.');
      revisionRef.current=saved.revision;setRevision(saved.revision);
      if (answersRef.current===snapshot) {dirtyRef.current=false;setDirty(false);}
      setError('');
    })();
    inflightRef.current=request;
    try {await request;return true;}
    catch {setError('Your answers are still on this page, but could not be saved. Please try again.');return false;}
    finally {if (inflightRef.current===request) inflightRef.current=null;}
  };
  persistRef.current=persist;
  const save = async () => {
    setBusy(true);
    try {return await persist();}
    finally {setBusy(false);}
  };
  const go = async destination => {if (!busy && await save()) setScreen(destination);};
  const finish = async () => {
    if (busy || answered===0) return;
    setBusy(true);setError('');
    try {
      if (inflightRef.current) await inflightRef.current.catch(()=>{});
      const response=await onSubmit({answers:answersRef.current,revision:revisionRef.current});
      if (response?.status !== 'submitted') throw new Error('Submission could not be confirmed.');
      dirtyRef.current=false;setDirty(false);setScreen('complete');
    } catch {setError('Your answers are still on this page, but could not be submitted. Please try again.');}
    finally {setBusy(false);}
  };
  const change=(id,value)=>{const next={...answersRef.current,[id]:value};answersRef.current=next;dirtyRef.current=true;setAnswers(next);setDirty(true);};
  const leave=async()=>{if (!busy && await save() && typeof onLeave==='function') onLeave();};
  const page=typeof screen==='number' ? screen : null;
  const active=page===null ? null : groups[page];
  return <main className="wpp-shell" id="main-content">
    {screen==='intro' && <section className="wpp-panel">
      <p className="ca-eyebrow">Workplace personality profile</p>
      <h1 ref={heading} tabIndex={-1}>Before you begin</h1>
      <p>{form.instructions}</p>
      {hasReasoning ? <ul><li>50 statements and 12 reasoning questions, in three parts.</li><li>The 20-minute timer began when you started. You may use a calculator and scrap paper.</li><li>The statements have no right or wrong answers; the reasoning questions do.</li><li>You may leave questions unanswered.</li></ul> : <ul><li>50 statements, five per screen.</li><li>For the statements there are no right or wrong answers.</li><li>Your timer continues while you work. You may leave statements unanswered.</li></ul>}
      <button className="ca-btn ca-btn--primary" onClick={()=>setScreen(0)}>Begin</button>
    </section>}
    {page!==null && <>
      <div className="wpp-toolbar"><span role="status">{busy?'Saving…':dirty?'Changes not saved yet':'All answers saved'}</span><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={leave}>Save and leave</button></div>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      <h1 ref={heading} tabIndex={-1}>{active.title}</h1>
      {active.instructions && <p>{active.instructions}</p>}
      <p>Screen {page+1} of {pages} · {answered} of {allItems.length} answered</p>
      <nav aria-label="Question screens"><ol className="wpp-index">{groups.map((group,index)=>{
        const done=group.items.every(item=>answers[item.id]!=null);
        return <li key={index}><button type="button" disabled={busy} aria-current={index===page?'step':undefined} aria-label={`Screen ${index+1}${done?', all answered':''}${index===page?', current':''}`} onClick={()=>go(index)}>{index+1}{done&&<span aria-hidden="true"> ✓</span>}</button></li>;
      })}</ol></nav>
      <div className="wpp-questions">{active.items.map((item,index)=><fieldset className="wpp-question" key={item.id} disabled={busy}>
        <legend><span>{active.offset+index+1}.</span> {item.prompt}</legend>
        <div className={'wpp-options'+(active.id==='statement'?'':' wpp-options-reasoning')}>{item.options.map((option,optionIndex)=><label className="wpp-option" key={option.id}>
          <input type="radio" name={item.id} value={option.id} checked={answers[item.id]===option.id} onChange={()=>change(item.id,option.id)} />
          <span>{active.id==='statement'?'':`${String.fromCharCode(65+optionIndex)}. `}{option.label}</span>
        </label>)}</div>
        {answers[item.id]!=null && <button type="button" className="wpp-clear" onClick={()=>change(item.id,null)}>Clear this answer</button>}
      </fieldset>)}</div>
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(page===0?'intro':page-1)}>Previous</button><button type="button" className="ca-btn ca-btn--primary" disabled={busy} onClick={()=>go(page===pages-1?'review':page+1)}>{page===pages-1?'Review':'Next'}</button></div>
    </>}
    {screen==='review' && <section className="wpp-panel">
      <h1 ref={heading} tabIndex={-1}>Review your answers</h1>
      <p>{answered} of {allItems.length} items answered. Blanks are allowed.</p>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      {answered<allItems.length && <><h2>Not answered</h2><ul className="wpp-blanks">{groups.flatMap((group,pageIndex)=>group.items.map((item,index)=>answers[item.id]==null && <li key={item.id}><button type="button" disabled={busy} onClick={()=>go(pageIndex)}>{group.id==='statement'?'Statement':group.id==='numeric'?'Numeric':'Cognitive'} {group.offset+index+1}</button></li>))}</ul></>}
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(pages-1)}>Back</button><button type="button" className="ca-btn ca-btn--primary" disabled={busy||answered===0} onClick={finish}>{busy?'Submitting…':'Submit'}</button></div>
    </section>}
    {screen==='complete' && <section className="wpp-panel"><h1 ref={heading} tabIndex={-1}>Thank you</h1><p>Your questionnaire has been submitted.</p><a className="ca-link" href="/assessments">Back to assessments</a></section>}
  </main>;
}
