import React, {useEffect, useRef, useState} from 'react';
import './personality-questions.css';

// The host supplies a server-projected form and session-bound save/submit handlers.
export default function PersonalityQuestions({form, durationMinutes, initialAnswers = {}, initialRevision = 0, onSave, onSubmit, onLeave}) {
  const [answers,setAnswers]=useState(initialAnswers);
  const [revision,setRevision]=useState(initialRevision);
  const [screen,setScreen]=useState('intro');
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const heading=useRef(null);
  // Latest values for background saves, which must not read a stale render's state.
  const answersRef=useRef(initialAnswers), revisionRef=useRef(initialRevision), dirtyRef=useRef(false), inflightRef=useRef(null), persistRef=useRef(null);
  const items=Array.isArray(form?.items) ? form.items : [];
  const pages=Math.ceil(items.length/5);
  const answered=items.filter(item=>answers[item.id]!=null).length;
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
  if (items.length !== 50 || typeof onSave !== 'function' || typeof onSubmit !== 'function') {
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
  return <main className="wpp-shell" id="main-content">
    {screen==='intro' && <section className="wpp-panel">
      <p className="ca-eyebrow">Workplace personality profile</p>
      <h1 ref={heading} tabIndex={-1}>Before you begin</h1>
      <p>{form.instructions}</p>
      <ul><li>50 statements, five per screen.</li><li>You have {durationMinutes} minutes from the start; the timer cannot be paused. When time runs out, your saved answers, if any, are submitted.</li><li>There are no right or wrong answers. You may leave statements unanswered.</li></ul>
      <button className="ca-btn ca-btn--primary" onClick={()=>setScreen(0)}>Begin</button>
    </section>}
    {page!==null && <>
      <div className="wpp-toolbar"><span role="status">{busy?'Saving…':dirty?'Changes not saved yet':'All answers saved'}</span><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={leave}>Save and leave</button></div>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      <h1 ref={heading} tabIndex={-1}>How accurately does each statement describe you?</h1>
      <p>Screen {page+1} of {pages} · {answered} of {items.length} answered</p>
      <nav aria-label="Question screens"><ol className="wpp-index">{Array.from({length:pages},(_,index)=>{
        const done=items.slice(index*5,index*5+5).every(item=>answers[item.id]!=null);
        return <li key={index}><button type="button" disabled={busy} aria-current={index===page?'step':undefined} aria-label={`Screen ${index+1}${done?', all answered':''}${index===page?', current':''}`} onClick={()=>go(index)}>{index+1}{done&&<span aria-hidden="true"> ✓</span>}</button></li>;
      })}</ol></nav>
      <div className="wpp-questions">{items.slice(page*5,page*5+5).map((item,index)=><fieldset className="wpp-question" key={item.id} disabled={busy}>
        <legend><span>{page*5+index+1}.</span> {item.prompt}</legend>
        <div className="wpp-options">{item.options.map(option=><label className="wpp-option" key={option.id}>
          <input type="radio" name={item.id} value={option.id} checked={answers[item.id]===option.id} onChange={()=>change(item.id,option.id)} />
          <span>{option.label}</span>
        </label>)}</div>
        {answers[item.id]!=null && <button type="button" className="wpp-clear" onClick={()=>change(item.id,null)}>Clear this answer</button>}
      </fieldset>)}</div>
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(page===0?'intro':page-1)}>Previous</button>{page!==pages-1 && <button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go('review')}>Review answers</button>}<button type="button" className="ca-btn ca-btn--primary" disabled={busy} onClick={()=>go(page===pages-1?'review':page+1)}>{page===pages-1?'Review':'Next'}</button></div>
    </>}
    {screen==='review' && <section className="wpp-panel">
      <h1 ref={heading} tabIndex={-1}>Review your answers</h1>
      <p>{answered} of {items.length} statements answered. Blanks are allowed, but at least one answer is required to submit.</p>
      {error && <p className="wpp-error" role="alert">{error}</p>}
      <p>Check your responses below. Choose an edit button to return to that screen.</p>
      <div className="wpp-review">{Array.from({length:pages},(_,pageIndex)=><section className="wpp-review-page" key={pageIndex} aria-labelledby={`wpp-review-${pageIndex}`}>
        <div className="wpp-review-heading"><h2 id={`wpp-review-${pageIndex}`}>Screen {pageIndex+1}</h2><button type="button" className="ca-btn ca-btn--quiet ca-btn--sm" disabled={busy} onClick={()=>go(pageIndex)}>Edit screen {pageIndex+1}</button></div>
        <ol start={pageIndex*5+1}>{items.slice(pageIndex*5,pageIndex*5+5).map(item=><li key={item.id}><span>{item.prompt}</span><strong>{item.options.find(option=>option.id===answers[item.id])?.label || 'Not answered'}</strong></li>)}</ol>
      </section>)}</div>
      <div className="wpp-actions"><button type="button" className="ca-btn ca-btn--quiet" disabled={busy} onClick={()=>go(pages-1)}>Back</button><button type="button" className="ca-btn ca-btn--primary" disabled={busy||answered===0} onClick={finish}>{busy?'Submitting…':'Submit'}</button></div>
    </section>}
    {screen==='complete' && <section className="wpp-panel"><h1 ref={heading} tabIndex={-1}>Thank you</h1><p>Your questionnaire has been submitted.</p><a className="ca-link" href="/assessments">Back to assessments</a></section>}
  </main>;
}
