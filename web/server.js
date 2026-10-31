import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { create, join, authorize, view, action, rooms } from './game.js';

const assets = { '/':['index.html','text/html; charset=utf-8'], '/app.js':['app.js','text/javascript; charset=utf-8'], '/style.css':['style.css','text/css; charset=utf-8'], '/reviewer-kuryan2010.png':['reviewer-kuryan2010.png','image/png'] };
export function makeServer() {
  const limits=new Map();
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const url=new URL(req.url,'http://localhost');
    const json=(status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    try {
      if (url.pathname.startsWith('/api/')) {
        const ip=req.socket.remoteAddress;
        const now=Date.now();
        if (limits.size>10000) for (const [key,value] of limits) if(now-value.start>60000) limits.delete(key);
        let limit=limits.get(ip);
        if (!limit || now-limit.start>60000) {limit={start:now,count:0};limits.set(ip,limit);}
        if (++limit.count>600) return json(429,{error:'Слишком много запросов. Подождите минуту.'});
        if (req.method==='GET' && url.pathname==='/api/state') {
          const {room,player}=authorize(url.searchParams.get('code'),req.headers.authorization?.replace(/^Bearer /,''));
          return json(200,view(room,player));
        }
        if (req.method!=='POST') return json(405,{error:'Метод не поддерживается.'});
        if (req.headers.origin && req.headers.origin !== `${req.socket.encrypted?'https':'http'}://${req.headers.host}` && new URL(req.headers.origin).host !== req.headers.host) return json(403,{error:'Недопустимый источник запроса.'});
        let body='';
        for await (const chunk of req) {body+=chunk; if(Buffer.byteLength(body)>4096) return json(413,{error:'Слишком большой запрос.'});}
        const data=JSON.parse(body || '{}');
        if (url.pathname==='/api/create' || url.pathname==='/api/join') {
          if(rooms.size>=1000 && url.pathname==='/api/create') return json(503,{error:'Сервер заполнен. Попробуйте позже.'});
          const {room,player}=url.pathname==='/api/create'?create(data.name):join(data.code,data.name);
          return json(200,{token:player.token,state:view(room,player)});
        }
        if (url.pathname==='/api/action') {
          const {room,player}=authorize(data.code,req.headers.authorization?.replace(/^Bearer /,''));
          action(room,player,data);return json(200,view(room,player));
        }
        return json(404,{error:'Не найдено.'});
      }
      if (req.method!=='GET' || !assets[url.pathname]) {res.writeHead(404);return res.end('Not found');}
      const [file,type]=assets[url.pathname];
      const body=await readFile(new URL(`./public/${file}`,import.meta.url));
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(body);
    } catch(error) {json(400,{error:error instanceof SyntaxError?'Некорректный запрос.':error.message});}
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 3000),host=process.env.HOST || '0.0.0.0';
  makeServer().listen(port,host,() => console.log(`Sail Battle: http://localhost:${port}`));
  setInterval(() => {for(const [code,room] of rooms) if(Date.now()-room.updated>24*60*60*1000) rooms.delete(code);},60000).unref();
}
