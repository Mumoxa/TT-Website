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
  const reasoning=Array.isArray(form?.reasoning) ? form.reasoning : [];
  const sections=Array.isArray(form?.reasoning_sections) ? form.reasoning_sections : [];
  // Screens: the statements five at a time, then each reasoning section three questions at a time.
  const screens=[];
  for (let i=0;i<statements.length;i+=5) screens.push({kind:'statements',items:statements.slice(i,i+5),offset:i});
  for (const section of sections) {
    const its=reasoning.filter(item=>item.section===section.id);
    for (let i=0;i<its.length;i+=3) screens.push({kind:'reasoning',section,items:its.slice(i,i+3),offset:i,count:its.length});
  }
  const items=[...statements,...reasoning];
  const pages=screens.length;
  const answered=items.filter(item=>answers[item.id]!=null).length;
  // A readable name for any question, used on the review list ("Statement 18", "Numeric reasoning 2").
  const nameOf=item=>{
    const s=statements.indexOf(item); if (s>=0) return `Statement ${s+1}`;
    const section=sections.find(x=>x.id===item.section); const its=reasoning.filter(x=>x.section===item.section);
    return `${section?.title || 'Question'} ${its.indexOf(item)+1}`;
  };
  const screenOf=item=>screens.findIndex(sc=>sc.items.includes(item));
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
  if (statements.length !== 50 || reasoning.some(item=>!sections.some(x=>x.id===item.section)) || typeof onSave !== 'function' || typeof onSubmit !== 'function') {
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
  const sc=page!==null ? screens[page] : null;
  const letter=i=>String.fromCharCode(65+i);
  return <main className="wpp-shell" id="main-content">
    {screen==='intro' && <section className="wpp-panel">
      <p className="ca-eyebrow">Workplace personality profile</p>
      <h1 ref={heading} tabIndex={-1}>Before you begin</h1>
      <p>{form.instructions}</p>
      <ul>
        <li>Part 1: 50 statements about how you see yourself, five per screen. There are no right or wrong answers here.</li>
        {sections.map(section=><li key={section.id}>{section.title}: {reasoning.filter(item=>item.section===section.id).length} questions, each with one correct answer.</li>)}
        <li>The timer at the top shows the time left. Your answers save as you go, and you may leave questions unanswered.</li>
      </ul>
      <button className="ca-btn ca-btn--primary" onClick={()=>setScreen(0)}>Begin</button>
    </section>}
    {sc && <>
      <div className="wpp-toolbar"><span role="status">{busy?'Saving…':dirty?'Changes not saved yet':'All answers saved'}</span><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={leave}>Save and leave</button></div>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      {sc.kind==='statements'
        ? <h1 ref={heading} tabIndex={-1}>How accurately does each statement describe you?</h1>
        : <><h1 ref={heading} tabIndex={-1}>{sc.section.title}</h1><p className="wpp-instruction">{sc.section.instruction}</p></>}
      <p className="wpp-progress">Screen {page+1} of {pages} · {answered} of {items.length} answered</p>
      <nav aria-label="Question screens"><ol className="wpp-index">{screens.map((s2,index)=>{
        const done=s2.items.every(item=>answers[item.id]!=null);
        return <li key={index}><button type="button" disabled={busy} aria-current={index===page?'step':undefined} aria-label={`Screen ${index+1}${s2.kind==='reasoning'?', '+s2.section.title:''}${done?', all answered':''}${index===page?', current':''}`} onClick={()=>go(index)}>{index+1}{done&&<span aria-hidden="true"> ✓</span>}</button></li>;
      })}</ol></nav>
      <div className="wpp-questions">{sc.items.map((item,index)=><fieldset className={'wpp-question'+(sc.kind==='reasoning'?' wpp-question--reasoning':'')} key={item.id} disabled={busy}>
        <legend><span>{sc.kind==='statements'?`${sc.offset+index+1}.`:`${sc.offset+index+1} of ${sc.count}.`}</span> {item.prompt}</legend>
        <div className={sc.kind==='statements'?'wpp-options':'wpp-choices'}>{item.options.map((option,i)=><label className="wpp-option" key={option.id}>
          <input type="radio" name={item.id} value={option.id} checked={answers[item.id]===option.id} onChange={()=>change(item.id,option.id)} />
          {sc.kind==='reasoning' && <b className="wpp-letter" aria-hidden="true">{letter(i)}</b>}
          <span>{option.label}</span>
        </label>)}</div>
        {answers[item.id]!=null && <button type="button" className="wpp-clear" onClick={()=>change(item.id,null)}>Clear this answer</button>}
      </fieldset>)}</div>
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(page===0?'intro':page-1)}>Previous</button><button type="button" className="ca-btn ca-btn--primary" disabled={busy} onClick={()=>go(page===pages-1?'review':page+1)}>{page===pages-1?'Review':'Next'}</button></div>
    </>}
    {screen==='review' && <section className="wpp-panel">
      <h1 ref={heading} tabIndex={-1}>Review your answers</h1>
      <p>{answered} of {items.length} answered. Blanks are allowed.</p>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      {answered<items.length && <><h2>Not answered</h2><ul className="wpp-blanks">{items.map(item=>answers[item.id]==null && <li key={item.id}><button type="button" disabled={busy} onClick={()=>go(screenOf(item))}>{nameOf(item)}</button></li>)}</ul></>}
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(pages-1)}>Back</button><button type="button" className="ca-btn ca-btn--primary" disabled={busy||answered===0} onClick={finish}>{busy?'Submitting…':'Submit'}</button></div>
    </section>}
    {screen==='complete' && <section className="wpp-panel"><h1 ref={heading} tabIndex={-1}>Thank you</h1><p>Your questionnaire has been submitted.</p><a className="ca-link" href="/assessments">Back to assessments</a></section>}
  </main>;
}
