(() => {
  const $ = id => document.getElementById(id);
  const POINTS = [12,10,8,7,6,5,4,3,2,1];
  let sb = null, countries = [], channel = null, anonymousUserId = null, alreadyVoted = false;

  function say(id, message, error=false) {
    const el=$(id); if(!el) return;
    el.textContent=message; el.style.color=error?'#ff8da9':'';
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function restore(){ $('supabaseUrl').value=localStorage.getItem('ev_url')||''; $('supabaseKey').value=localStorage.getItem('ev_key')||''; }
  async function connect(){
    const url=$('supabaseUrl').value.trim().replace(/\/+$/,'');
    const key=$('supabaseKey').value.trim();
    if(!url||!key) return say('connectionStatus','Введи URL и публичный ключ.',true);
    if(!window.supabase?.createClient) return say('connectionStatus','Не загрузилась библиотека Supabase. Проверь интернет.',true);
    localStorage.setItem('ev_url',url); localStorage.setItem('ev_key',key);
    sb=window.supabase.createClient(url,key);
    say('connectionStatus','Подключаемся…');
    const {data:sessionData,error:sessionError}=await sb.auth.getSession();
    if(sessionError) return say('connectionStatus',sessionError.message,true);
    let session=sessionData.session;
    if(!session){
      const {data,error}=await sb.auth.signInAnonymously();
      if(error) return say('connectionStatus','Не удалось создать анонимную учётную запись: '+error.message+'. Проверь, включена ли Anonymous Sign-Ins в Supabase.',true);
      session=data.session;
    }
    anonymousUserId=session?.user?.id||null;
    if(!anonymousUserId) return say('connectionStatus','Не удалось получить идентификатор участника.',true);
    await loadCountries();
    await checkVoteStatus();
    await loadResults();
    setupRealtime();
    say('connectionStatus','Сайт подключён. Участников: '+countries.length);
  }
  async function loadCountries(){
    const {data,error}=await sb.from('countries').select('*').order('name');
    if(error){say('connectionStatus','Ошибка загрузки стран: '+error.message,true);return;}
    countries=data||[]; renderCountries();
  }
  function renderCountries(){
    const root=$('voteList');
    if(alreadyVoted){root.innerHTML='<div class="notice">Твой голос уже принят. Повторно проголосовать с этой учётной записи нельзя. Спасибо!</div>';$('submitVoteBtn').disabled=true;return;}
    if(!countries.length){root.innerHTML='<p class="muted">Пока нет добавленных стран.</p>';$('submitVoteBtn').disabled=true;return;}
    root.innerHTML=countries.map(c=>`<div class="vote-row"><div><strong>${esc(c.name)}</strong><small>${esc([c.artist,c.song].filter(Boolean).join(' — '))}</small></div><select aria-label="Баллы для ${esc(c.name)}" data-country="${esc(c.id)}"><option value="">0 баллов</option>${POINTS.map(p=>`<option value="${p}">${p} баллов</option>`).join('')}</select></div>`).join('');
    root.querySelectorAll('select').forEach(s=>s.addEventListener('change',validate));
    validate();
  }
  function validate(){
    const vals=[...$('voteList').querySelectorAll('select')].map(s=>s.value).filter(Boolean);
    const ok=vals.length===10&&new Set(vals).size===10;
    $('submitVoteBtn').disabled=!ok||alreadyVoted;
    if(vals.length) say('voteStatus',ok?'Все 10 оценок распределены.':'Выбрано оценок: '+vals.length+' из 10. Каждую оценку можно использовать один раз.');
  }
  async function checkVoteStatus(){
    const {data,error}=await sb.rpc('has_current_user_voted');
    if(error){say('voteStatus','Не удалось проверить статус голоса: '+error.message,true);return;}
    alreadyVoted=!!data;
    $('voteIdentity').textContent=alreadyVoted?'Голос с этого браузера уже отправлен.':'Готово! Ты можешь проголосовать один раз.';
    renderCountries();
    if(alreadyVoted) say('voteStatus','Голос уже принят. Спасибо за участие!');
  }
  async function submitVote(){
    if(!sb||!anonymousUserId) return say('voteStatus','Сначала подключи сайт.',true);
    if(alreadyVoted) return say('voteStatus','Этот аккаунт уже голосовал.',true);
    const selections=[...$('voteList').querySelectorAll('select')];
    const allocations=selections.filter(s=>s.value).map(s=>({country_id:s.dataset.country,points:Number(s.value)}));
    if(allocations.length!==10||new Set(allocations.map(a=>a.points)).size!==10) return say('voteStatus','Распредели все десять оценок от 12 до 1 без повторов.',true);
    $('submitVoteBtn').disabled=true;say('voteStatus','Сохраняем голос…');
    const {data,error}=await sb.rpc('submit_anonymous_vote',{p_allocations:allocations});
    if(error){say('voteStatus',error.message.includes('already voted')?'Ты уже голосовал с этой учётной записи.':error.message,true);await checkVoteStatus();return;}
    alreadyVoted=true;
    $('voteIdentity').textContent='Голос отправлен. Спасибо!';
    renderCountries();
    say('voteStatus','Голос принят! Повторно проголосовать с этой учётной записи нельзя.');
    await loadResults();
  }
  async function loadResults(){
    if(!sb)return;
    const root=$('resultsList');
    const {data,error}=await sb.from('results').select('*').order('total_points',{ascending:false});
    if(error){root.innerHTML='<p class="muted">Не удалось загрузить результаты: '+esc(error.message)+'</p>';return;}
    if(!data?.length){root.innerHTML='<p class="muted">Пока голосов нет.</p>';return;}
    root.innerHTML=data.map((r,i)=>`<div class="result-row"><div><strong>${i+1}. ${esc(r.name||'Участник')}</strong>${r.artist?`<div class="muted">${esc(r.artist)}</div>`:''}</div><div class="result-points">${Number(r.total_points)||0} очков</div></div>`).join('');
  }
  function setupRealtime(){
    if(channel)sb.removeChannel(channel);
    channel=sb.channel('eurovote-live-results').on('postgres_changes',{event:'INSERT',schema:'public',table:'vote_items'},()=>loadResults()).subscribe();
  }
  async function adminLogin(){
    if(!sb)return say('adminStatus','Сначала подключи сайт.',true);
    const {data,error}=await sb.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});
    if(error)return say('adminStatus','Не удалось войти. Проверь email и пароль.',true);
    if(data.user?.app_metadata?.role!=='admin'){
      await sb.auth.signOut();
      return say('adminStatus','У этого аккаунта нет прав администратора.',true);
    }
    $('adminTools').hidden=false;say('adminStatus','Вход администратора выполнен.');
    await loadCountries();
  }
  async function adminLogout(){
    if(sb)await sb.auth.signOut();
    $('adminTools').hidden=true;say('adminStatus','Вы вышли из аккаунта администратора. Для голосования снова подключи сайт, чтобы создать анонимную сессию.');
    anonymousUserId=null;
  }
  async function addCountry(){
    const name=$('countryName').value.trim(),artist=$('countryArtist').value.trim(),song=$('countrySong').value.trim();
    if(!name)return say('adminStatus','Укажи название страны.',true);
    const {error}=await sb.from('countries').insert({name,artist,song});
    if(error)return say('adminStatus','Не удалось добавить: '+error.message,true);
    $('countryName').value='';$('countryArtist').value='';$('countrySong').value='';
    say('adminStatus','Участник добавлен.');await loadCountries();
  }
  $('connectBtn').addEventListener('click',connect);
  $('submitVoteBtn').addEventListener('click',submitVote);
  $('refreshResultsBtn').addEventListener('click',loadResults);
  $('adminLoginBtn').addEventListener('click',adminLogin);
  $('adminLogoutBtn').addEventListener('click',adminLogout);
  $('addCountryBtn').addEventListener('click',addCountry);
  function updateAdminVisibility(){
    $('adminSection').hidden = location.hash !== '#admin';
  }
  window.addEventListener('hashchange', updateAdminVisibility);
  updateAdminVisibility();
  restore();
  if(localStorage.getItem('ev_url')&&localStorage.getItem('ev_key'))connect();
})();