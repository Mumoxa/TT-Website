/* Rebuilds the worked-example documents in src/cv-builda/samples/.
   Run it after any change to the composer — samples that are not regenerated
   are worse than none, because they show a client a document the tool no
   longer produces.

     node scripts/build-cv-samples.mjs
*/

import fs from 'node:fs';
import path from 'node:path';
import { Packer } from 'docx';
import { compose } from '../src/cv-builda/cv/compose.js';

const root = new URL('..', import.meta.url).pathname;
const out = path.join(root, 'src/cv-builda/samples');
const record = JSON.parse(fs.readFileSync(path.join(root, 'src/cv-builda/anonymous-example.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

/* The same candidate three ways. One record, three renderings — which is the
   point of the whole design. */
const open = clone(record);
Object.keys(open.redact).forEach((k) => { open.redact[k] = false; });
open.meta.fileName = 'Steyn_JJ_TalentTree_CV';

const direct = clone(open);
direct.meta.mode = 'direct';
direct.meta.fileName = 'Steyn_JJ_CV_direct';
direct.personal.email = 'jj.steyn@example.com';
direct.personal.phone = '082 555 0134';

fs.mkdirSync(out, { recursive: true });
for (const cv of [open, clone(record), direct]) {
  const file = path.join(out, `${cv.meta.fileName}.docx`);
  fs.writeFileSync(file, await Packer.toBuffer(compose(cv)));
  console.log('wrote', path.relative(root, file));
}
