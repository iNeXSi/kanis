const path=require('node:path');
function summarize(root,files){
  const groups=new Map(),types=new Map();
  for(const file of files){
    const relative=path.relative(root,file.path),parts=relative.split(path.sep),folder=parts.length>1?parts[0]:'__files';
    if(!groups.has(folder))groups.set(folder,{id:folder,name:folder==='__files'?'Files in this folder':folder,path:folder==='__files'?root:path.join(root,folder),bytes:0,count:0,children:new Map(),direct:folder==='__files'});
    const group=groups.get(folder);group.bytes+=file.size;group.count++;
    if(parts.length>2){const key=parts[1];if(!group.children.has(key))group.children.set(key,{id:key,name:key,path:path.join(root,parts[0],key),bytes:0,count:0});group.children.get(key).bytes+=file.size;group.children.get(key).count++;}
    const ext=path.extname(file.name).toLowerCase()||'(no extension)';
    if(!types.has(ext))types.set(ext,{id:ext,name:ext,bytes:0,count:0});types.get(ext).bytes+=file.size;types.get(ext).count++;
  }
  const bySize=(a,b)=>b.bytes-a.bytes;
  return {groups:[...groups.values()].map(g=>({...g,children:[...g.children.values()].sort(bySize)})).sort(bySize),types:[...types.values()].sort(bySize),largest:[...files].sort((a,b)=>b.size-a.size).slice(0,100),bytes:files.reduce((n,f)=>n+f.size,0),count:files.length};
}
module.exports={summarize};
