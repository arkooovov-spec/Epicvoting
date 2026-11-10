const POINTS=[12,10,8,7,6,5,4,3,2,1];
const initialCountries=[
{id:"se",name:"Sweden",flag:"🇸🇪",song:"Demo song",artist:"Demo artist"},
{id:"it",name:"Italy",flag:"🇮🇹",song:"Demo song",artist:"Demo artist"},
{id:"ua",name:"Ukraine",flag:"🇺🇦",song:"Demo song",artist:"Demo artist"},
{id:"fr",name:"France",flag:"🇫🇷",song:"Demo song",artist:"Demo artist"},
{id:"no",name:"Norway",flag:"🇳🇴",song:"Demo song",artist:"Demo artist"},
{id:"fi",name:"Finland",flag:"🇫🇮",song:"Demo song",artist:"Demo artist"},
{id:"es",name:"Spain",flag:"🇪🇸",song:"Demo song",artist:"Demo artist"},
{id:"de",name:"Germany",flag:"🇩🇪",song:"Demo song",artist:"Demo artist"},
{id:"gb",name:"United Kingdom",flag:"🇬🇧",song:"Demo song",artist:"Demo artist"},
{id:"gr",name:"Greece",flag:"🇬🇷",song:"Demo song",artist:"Demo artist"},
{id:"pt",name:"Portugal",flag:"🇵🇹",song:"Demo song",artist:"Demo artist"},
{id:"ch",name:"Switzerland",flag:"🇨🇭",song:"Demo song",artist:"Demo artist"}
];
const KEY="eurovote_demo_v1";
let data=load(), assigned={}, selectedPoint=null;
function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&Array.isArray(x.countries))return x}catch{}return {countries:initialCountries,votes:[],open:true};}
function save(){localStorage.setItem(KEY,JSON.stringify(data));}
function safe(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function flagMarkup(f){if(/^https?:\/\//i.test(f))return `<img src="${safe(f)}" alt="flag" onerror="this.parentElement.textContent='🏳️'">`;return safe(f);}
function toast(msg){let t=document.querySelector("#toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",2600);}
function voteKey(){return "eurovote_voted_"+location.pathname;}
function hasVoted(){return localStorage.getItem(voteKey())==="yes";}
function totals(){let sums={};data.countries.forEach(c=>sums[c.id]=0);data.votes.forEach(v=>v.points.forEach(p=>{if(sums[p.countryId]!==undefined)sums[p.countryId]+=p.points;}));return sums;}
function renderPoints(){document.querySelector("#points").innerHTML=POINTS.map(p=>`<button class="point ${assignedPoint(p)?"used":""}" data-point="${p}">${p} баллов</button>`).join("");}
function assignedPoint(p){return Object.values(assigned).includes(p);}
function renderCountries(){const el=document.querySelector("#countries");el.innerHTML=data.countries.map(c=>{let p=assigned[c.id];return `<article class="country"><div class="flag">${flagMarkup(c.flag)}</div><div class="details"><strong>${safe(c.name)}</strong><small>${safe(c.song)} • ${safe(c.artist)}</small></div><button class="award ${p?"assigned":""}" data-country="${safe(c.id)}">${p?p+" баллов":"＋ Баллы"}</button></article>`}).join("");}
function renderVote(){renderPoints();renderCountries();let n=Object.keys(assigned).length;document.querySelector("#counter").textContent=`${n} / 10 стран`;document.querySelector("#submitVote").disabled=n!==10||hasVoted()||!data.open;document.querySelector("#voteHint").textContent=hasVoted()?"Ты уже проголосовал в этом браузере.":!data.open?"Голосование закрыто.":"Выбери 10 стран, чтобы отправить голос.";document.querySelector("#status").textContent=data.open?"Голосование открыто":"Голосование закрыто";}
function renderResults(){let sums=totals();let sorted=[...data.countries].sort((a,b)=>sums[b.id]-sums[a.id]);document.querySelector("#leaderboard").innerHTML=sorted.map((c,i)=>`<div class="leader-row"><div class="rank">${String(i+1).padStart(2,"0")}</div><div class="leader-country"><div class="flag">${flagMarkup(c.flag)}</div><div><strong>${safe(c.name)}</strong><small>${safe(c.song)} • ${safe(c.artist)}</small></div></div><div class="score">${sums[c.id]||0}<small>баллов</small></div></div>`).join("");}
function renderAdmin(){document.querySelector("#adminCountries").innerHTML=data.countries.map(c=>`<div class="admin-item"><div class="flag">${flagMarkup(c.flag)}</div><div class="details"><strong>${safe(c.name)}</strong><small>${safe(c.song)} • ${safe(c.artist)}</small></div><button class="danger" data-delete="${safe(c.id)}">Удалить</button></div>`).join("");document.querySelector("#toggleVoting").textContent=data.open?"Закрыть голосование":"Открыть голосование";}
function render(){renderVote();renderResults();renderAdmin();}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));document.querySelector("#"+b.dataset.view+"View").classList.remove("hidden");if(b.dataset.view==="results")renderResults();if(b.dataset.view==="admin")renderAdmin();}));
document.querySelector("#points").addEventListener("click",e=>{let b=e.target.closest("[data-point]");if(!b)return;selectedPoint=Number(b.dataset.point);document.querySelectorAll(".point").forEach(x=>x.classList.toggle("used",assignedPoint(Number(x.dataset.point))));toast(`Выбрано ${selectedPoint} баллов. Теперь нажми на страну.`);});
document.querySelector("#countries").addEventListener("click",e=>{let b=e.target.closest("[data-country]");if(!b)return;if(hasVoted()||!data.open)return;let id=b.dataset.country;if(!selectedPoint){toast("Сначала выбери количество баллов сверху.");return;}if(assignedPoint(selectedPoint)&&assigned[id]!==selectedPoint){toast("Эти баллы уже использованы.");return;}if(assigned[id])delete assigned[id];if(Object.keys(assigned).length>=10&&!assigned[id]){toast("Можно выбрать только 10 стран.");return;}assigned[id]=selectedPoint;selectedPoint=null;renderVote();});
document.querySelector("#submitVote").addEventListener("click",()=>{if(Object.keys(assigned).length!==10||hasVoted()||!data.open)return;data.votes.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),points:Object.entries(assigned).map(([countryId,points])=>({countryId,points})),createdAt:new Date().toISOString()});localStorage.setItem(voteKey(),"yes");save();assigned={};render();toast("Голос принят! Спасибо ❤️");});
document.querySelector("#countryForm").addEventListener("submit",e=>{e.preventDefault();let c={id:"c"+Date.now(),name:document.querySelector("#countryName").value.trim(),flag:document.querySelector("#flag").value.trim(),song:document.querySelector("#song").value.trim(),artist:document.querySelector("#artist").value.trim()};if(data.countries.some(x=>x.name.toLowerCase()===c.name.toLowerCase())){toast("Такая страна уже добавлена.");return;}data.countries.push(c);save();e.target.reset();render();toast("Страна добавлена.");});
document.querySelector("#adminCountries").addEventListener("click",e=>{let b=e.target.closest("[data-delete]");if(!b)return;data.countries=data.countries.filter(c=>c.id!==b.dataset.delete);data.votes.forEach(v=>v.points=v.points.filter(p=>p.countryId!==b.dataset.delete));save();render();});
document.querySelector("#toggleVoting").addEventListener("click",()=>{data.open=!data.open;save();render();toast(data.open?"Голосование открыто":"Голосование закрыто");});
document.querySelector("#refreshResults").addEventListener("click",renderResults);
document.querySelector("#exportData").addEventListener("click",()=>{let blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="eurovote-data.json";a.click();URL.revokeObjectURL(a.href);});
document.querySelector("#importData").addEventListener("change",async e=>{let f=e.target.files[0];if(!f)return;try{let x=JSON.parse(await f.text());if(!Array.isArray(x.countries)||!Array.isArray(x.votes))throw Error();data=x;save();render();toast("Данные импортированы.");}catch{toast("Не удалось импортировать JSON.");}e.target.value="";});
document.querySelector("#resetData").addEventListener("click",()=>{if(!confirm("Удалить все демо-данные и вернуть начальные страны?"))return;data={countries:initialCountries,votes:[],open:true};localStorage.removeItem(voteKey());assigned={};save();render();toast("Демо сброшено.");});
render();