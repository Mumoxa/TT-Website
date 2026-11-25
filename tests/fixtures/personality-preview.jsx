// Development-only synthetic QA harness. Not linked from the production app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-400-italic.css';
import '@fontsource/fraunces/latin-500.css';
import '../../src/styles.css';
import '../../src/assessments/admin-assessments.css';
import {PersonalityDossier} from '../../src/assessments/PersonalityDossier.jsx';
import {samples,invalid} from './personality-report-samples.mjs';
const sample=new URLSearchParams(location.search).get('sample') || 'mock';
createRoot(document.getElementById('root')).render(<main className="tta-admin-page"><div className="tta-admin-main tta-admin-shell"><PersonalityDossier report={sample==='invalid'?invalid:(samples[sample] || samples.mock)} onBack={()=>{}}/></div></main>);
