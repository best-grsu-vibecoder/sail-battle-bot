import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,join,action,view,rooms,place,emptyBoard,randomBoard,authorize} from '../game.js';
import {makeServer} from '../server.js';

test('placement rejects touching ships and out of bounds',()=>{
  const board=emptyBoard();place(board,0,0,false);
  assert.throws(()=>place(board,1,4,false));
  assert.throws(()=>place(board,9,9,false));
  assert.equal(board.ships.length,1);
  for(let i=0;i<30;i++) {const b=randomBoard();assert.equal(b.ships.length,10);assert.equal(b.ships.flat().length,20);}
});
test('full game: hidden ships, turns, repeated shots, victory',()=>{
  const {room,player:a}=create('A');const {player:b}=join(room.code,'B');
  assert.throws(()=>join(room.code,'C'));
  assert.throws(()=>authorize(room.code,'invalid'));
  assert.throws(()=>action(room,a,{action:'ready'}));
  action(room,a,{action:'random'});action(room,b,{action:'random'});
  assert.equal(view(room,a).opponent.grid.flat().includes('ship'),false);
  action(room,a,{action:'ready'});assert.throws(()=>action(room,a,{action:'clear'}));action(room,b,{action:'ready'});
  const shooter=room.players[room.turn], target=room.players[1-room.turn];
  assert.throws(()=>action(room,target,{action:'shoot',row:0,col:0}));
  const water=Array.from({length:100},(_,i)=>[Math.floor(i/10),i%10]).find(([r,c])=>!target.board.ships.flat().some(([sr,sc])=>r===sr&&c===sc));
  action(room,shooter,{action:'shoot',row:water[0],col:water[1]});assert.equal(room.players[room.turn],target);
  const enemy=shooter;
  for(const ship of enemy.board.ships) for(const [row,col] of ship) action(room,target,{action:'shoot',row,col});
  assert.equal(room.phase,'finished');assert.equal(view(room,target).won,true);
  assert.throws(()=>action(room,target,{action:'shoot',row:0,col:0}));
  rooms.delete(room.code);
});
test('HTTP clients create, join, reconnect and cannot access opponent secrets',async t=>{
  const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,data,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  const a=(await post('/api/create',{name:'<Captain>'})).body;
  const code=a.state.code;
  const b=(await post('/api/join',{name:'B',code})).body;
  assert.ok(b.token);assert.notEqual(a.token,b.token);
  await post('/api/action',{code,action:'random'},b.token);
  const response=await fetch(`${base}/api/state?code=${code}`,{headers:{Authorization:`Bearer ${a.token}`}});
  const state=await response.json();assert.equal(state.opponent.grid.flat().every(c=>c==='water'),true);assert.equal(JSON.stringify(state).includes(b.token),false);
  assert.equal((await fetch(`${base}/api/state?code=${code}`)).status,400);
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/../server.js')).status,404);
  rooms.delete(code);
});
