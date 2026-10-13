// Extract ordinary web links while preserving all contact text for display/copy.
export function contactParts(value) {
  const source=String(value||''),parts=[];
  const pattern=/\b(?:https?:\/\/|www\.|(?:facebook\.com|fb\.com|zalo\.me)\/)[^\s<>"']+/giu;
  let cursor=0;
  for(const match of source.matchAll(pattern)){
    let raw=match[0].replace(/[.,;!]+$/,'');
    for(const [open,close] of [['(',')'],['[',']']])while(raw.endsWith(close)&&raw.split(open).length<raw.split(close).length)raw=raw.slice(0,-1);
    let url;try{url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol))continue;
    if(match.index>cursor)parts.push({text:source.slice(cursor,match.index)});
    parts.push({text:raw,href:url.href});cursor=match.index+raw.length;
  }
  if(cursor<source.length)parts.push({text:source.slice(cursor)});
  return parts;
}
