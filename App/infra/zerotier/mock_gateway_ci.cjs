// Fixture exclusivamente de infraestructura CI: no representa reglas de negocio.
const http = require('node:http');
const registros = [];
for (const puerto of [3001,3002,4200,4201]) http.createServer((req,res)=>{
  if(req.url==='/_control') { res.end(JSON.stringify(registros));return; }
  registros.push({metodo:req.method,ruta:req.url,id:req.headers['x-demo-solicitud']||null});
  if(req.headers['x-prueba-interrumpir']==='si'){req.socket.destroy();return;}
  if(req.url.startsWith('/api/v1/monitoreo/')){
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write('data: {"prueba":"inicio"}\n\n');
    setTimeout(()=>res.end('data: {"prueba":"fin"}\n\n'),2000);return;
  }
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/v1/cartelera')res.end(JSON.stringify({eventos:[{id:'fixture-ci'}],total:1}));
  else res.end(JSON.stringify({id:'fixture-ci',equipo:process.env.EQUIPO}));
}).listen(puerto,'0.0.0.0');
