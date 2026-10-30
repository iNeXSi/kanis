// Only this isolated process is trimmed by the native integration check.
const buffer=Buffer.alloc(32*1024*1024,42);
setInterval(()=>{if(buffer[0]!==42)process.exit(2);},1000);
