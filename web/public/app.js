const $ = id => document.getElementById(id);
let session, state, vertical=false, busy=false, noticeTimer;
try { session=JSON.parse(localStorage.getItem('naval-session')); } catch {}
const invite=new URL(location.href).searchParams.get('room');
if(invite) $('code').value=invite.toUpperCase().slice(0,6);
$('name').value=localStorage.getItem('naval-name') || '';
function notify(message) { $('notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',4500); }
async function request(path, data) {
  const response=await fetch(`/api/${path}`,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(8000)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Ошибка сервера');
  return result;
}
async function enter(mode) {
  if(busy) return;busy=true;
  $('create').disabled=$('join').disabled=true;
  try {
    const name=$('name').value.trim();
    const result=await request(mode,{name,code:$('code').value.trim()});
    session={code:result.state.code,token:result.token};localStorage.setItem('naval-session',JSON.stringify(session));localStorage.setItem('naval-name',name);
    state=result.state;history.replaceState(null,'',`/?room=${session.code}`);render();
  } catch(error) {notify(error.message);} finally {busy=false;$('create').disabled=$('join').disabled=false;}
}
$('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');
$('code').onkeydown=e=>{if(e.key==='Enter') enter('join');};
async function act(action,extra={}) {
  if(busy || !session) return;busy=true;
  try {state=await request('action',{code:session.code,action,...extra});render();} catch(error){notify(error.message);} finally{busy=false;}
}
function draw(id, grid, own, enabled) {
  const container=$(id), fragment=document.createDocumentFragment();
  for(let r=-1;r<10;r++) for(let c=-1;c<10;c++) {
    if(r===-1 || c===-1) {
      const label=document.createElement('span');label.className='axis';label.textContent=r===-1?(c<0?'':'ABCDEFGHIJ'[c]):r+1;fragment.append(label);continue;
    }
    const cell=document.createElement('button'), value=grid?.[r]?.[c] || 'water';
    cell.className=`cell ${value}`;cell.disabled=!enabled || (!own && ['hit','miss','sunk'].includes(value));
    const labels={water:own?'вода':'неизвестно',ship:'корабль',hit:'попадание',sunk:'потоплен',miss:'промах'};
    cell.setAttribute('aria-label',`${'ABCDEFGHIJ'[c]}${r+1}: ${labels[value]}`);
    cell.title=cell.getAttribute('aria-label');
    cell.onclick=()=>act(own?'place':'shoot',{row:r,col:c,vertical});fragment.append(cell);
  }
  container.replaceChildren(fragment);
}
function render() {
  $('lobby').hidden=Boolean(state);$('game').hidden=!state;
  if(!state) return;
  const waiting=state.phase==='waiting', placing=state.phase==='placement', finished=state.phase==='finished';
  $('room-code').textContent=state.code;
  $('phase').textContent=waiting?'ПРИГЛАШЕНИЕ':placing?'РАССТАНОВКА ФЛОТА':finished?'ИГРА ЗАВЕРШЕНА':'МОРСКАЯ ДУЭЛЬ';
  $('game-title').textContent=waiting?'Курс на встречу':placing?'Подготовка к бою':finished?(state.won?'Победа, капитан!':'До следующего боя'):'Океан ждёт вашего хода';
  $('status').textContent=waiting?'Ждём соперника':placing?(state.me.ready?'Вы готовы. Ждём соперника.':'Расставьте свои корабли'):finished?`Победитель: ${state.winner}`:state.myTurn?'Ваш ход. Выберите цель.':'Ход соперника';
  $('event').textContent=state.event;
  $('waiting').hidden=!waiting;$('arena').hidden=waiting;
  $('my-name').textContent=state.me.name;$('enemy-name').textContent=state.opponent?.name || 'Соперник';
  $('my-count').textContent=placing?`${state.me.placed} / 10 кораблей`:`${state.me.alive} / 10 на плаву`;
  $('enemy-count').textContent=placing?(state.opponent?.ready?'Готов к бою':'Расставляет флот'):`${state.opponent?.alive ?? 0} / 10 на плаву`;
  draw('my-board',state.me.grid,true,placing&&!state.me.ready);
  draw('enemy-board',state.opponent?.grid,false,state.phase==='battle'&&state.myTurn);
  $('placement-tools').hidden=!placing || state.me.ready;
  $('ready').disabled=state.me.placed!==10;
  const size=[4,3,3,2,2,2,1,1,1,1][state.me.placed];
  $('placement-hint').textContent=size?`Следующий: ${size}-палубный. Нажмите на начальную клетку. R — поворот.`:'Все корабли на месте. Подтвердите готовность.';
  $('enemy-hint').textContent=placing?'Корабли соперника скрыты до конца игры.':finished?'Флоты раскрыты. Спасибо за игру!':state.myTurn?'Нажмите на клетку, чтобы сделать выстрел.':'После промаха соперника ход перейдёт к вам.';
  $('surrender').hidden=!['placement','battle'].includes(state.phase);
  $('exit').hidden=!finished&&!waiting;
}
$('random').onclick=()=>act('random');$('clear').onclick=()=>act('clear');$('ready').onclick=()=>act('ready');
function rotate(){vertical=!vertical;$('rotate').textContent=vertical?'↻ Вертикально':'↻ Горизонтально';}
$('rotate').onclick=rotate;
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r' && !['INPUT','TEXTAREA'].includes(e.target.tagName) && state?.phase==='placement' && !state.me.ready) rotate();});
$('surrender').onclick=()=>{if(confirm('Сдаться и завершить эту игру?')) act('surrender');};
$('exit').onclick=()=>{session=null;state=null;localStorage.removeItem('naval-session');history.replaceState(null,'','/');render();};
$('copy').onclick=async()=>{const url=`${location.origin}/?room=${session.code}`;try{await navigator.clipboard.writeText(url);notify('Ссылка скопирована. Отправьте её другу.');}catch{prompt('Скопируйте ссылку на комнату:',url);}};
async function poll() {
  if(session && !busy) {
    busy=true;
    try {const next=await request(`state?code=${encodeURIComponent(session.code)}`);$('connection').textContent='● Сервер на связи';if(JSON.stringify(next)!==JSON.stringify(state)){state=next;render();}}
    catch(error){$('connection').textContent='○ Переподключение…';if(/Комната закрыта|Нет доступа/.test(error.message)){session=null;state=null;localStorage.removeItem('naval-session');render();notify(error.message);}}
    finally{busy=false;}
  }
  setTimeout(poll,1000);
}
render();poll();
