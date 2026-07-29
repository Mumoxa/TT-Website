let sequence = 0;
export function createSourceFragment(input) { return { id:input.id || `fragment-${++sequence}`, text:String(input.text || ''), originalText:String(input.originalText ?? input.text ?? ''), location:input.location || {order:sequence}, coverage:'unreviewed', destination:null }; }
