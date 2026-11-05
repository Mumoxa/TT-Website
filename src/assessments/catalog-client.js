import {useEffect, useState} from 'react';

export function useAssessmentCatalog(enabled = true, slug = '') {
  const [state, setState] = useState({status: 'loading', assessments: []});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const url = slug ? '/api/assessment/catalog?slug=' + encodeURIComponent(slug) : '/api/assessment/catalog';
    fetch(url, {cache: 'no-store', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error('Catalogue unavailable');
        const assessments = await response.json();
        if (!Array.isArray(assessments)) throw new Error('Invalid catalogue');
        setState({status: 'ready', assessments});
      })
      .catch(error => {
        if (error.name !== 'AbortError') setState({status: 'error', assessments: []});
      });
    return () => controller.abort();
  }, [enabled, slug]);
  return state;
}
