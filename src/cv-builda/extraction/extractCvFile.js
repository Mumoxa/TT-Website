import { extractDocx } from './extractDocx'; import { extractPdf } from './extractPdf';
export class ExtractionError extends Error { constructor(code,message){super(message);this.code=code;} }
export async function extractCvFile(file){
 const ext=file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
 if(!['.docx','.pdf'].includes(ext)) throw new ExtractionError('unsupported_type',ext==='.doc'?'Legacy .doc files are not supported. Save it as .docx first.':'Choose a .docx or text-based .pdf file.');
 if(file.size>10*1024*1024) throw new ExtractionError('file_too_large','The file exceeds the 10 MB limit.');
 if(!file.size) throw new ExtractionError('empty_file','The selected file is empty.');
 try { return await (ext==='.docx'?extractDocx(file):extractPdf(file)); } catch(e){if(e instanceof ExtractionError)throw e;if(e?.code==='image_only_pdf')throw new ExtractionError('image_only_pdf',e.message);if(e?.code==='empty_file')throw new ExtractionError('empty_file','The document contains no usable text.');if(e?.name==='PasswordException')throw new ExtractionError('password_protected','Remove the document password and try again.');throw new ExtractionError('corrupt_file','The file could not be read. Try exporting it again.');}
}
