(() => {
  const $ = (id) => document.getElementById(id);
  const POINTS = [12,10,8,7,6,5,4,3,2,1];
  let sb = null;
  let countries = [];
  let channel = null;

  function status(id, message, error=false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.style.color = error ? '#ff8da9' : '';
  }
  function savedConfig() {
    $('supabaseUrl').value = localStorage.getItem('ev_url') || '';
    $('supabaseKey').value = localStorage.getItem('ev_key') || '';
  }
  function connect() {
    const url = $('supabaseUrl').value.trim().replace(/\/+$/, '');
    const key = $('supabaseKey').value.trim();
    if (!url || !key) return status('connectionStatus','Введи URL и публичный ключ.',true);
    if (!window.supabase?.createClient) return status('connectionStatus','Не удалось загрузить библиотеку Supabase. Проверь интернет.',true);
    localStorage.setItem('ev_url',url);
    localStorage.setItem('ev_key',key);
    sb = window.supabase.createClient(url,key);
    status('connectionStatus','Подключение…');
    loadCountries();
    loadResults();
    setupRealtime();
  }
  async function loadCountries() {
    if (!sb) return;
    const {data,error} = await sb.from('countries').select('*').order('name');
    if (error) return status('connectionStatus','Ошибка загрузки стран: '+error.message,true);
    countries = data || [];
    renderVoteList();
    status('connectionStatus','Сайт подключён. Участников: '+countries.length);
  }
  function renderVoteList() {
    const root = $('voteList');
    if (!countries.length) {
      root.innerHTML = '<p class="muted">Пока нет добавленных стран.</p>';
      $('submitVoteBtn').disabled = true;
      return;
    }
    root.innerHTML = countries.map(c => `
      <div class="vote-row">
        <div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml([c.artist,c.song].filter(Boolean).join(' — '))}</small></div>
        <select aria-label="Баллы для ${escapeHtml(c.name)}" data-country="${escapeHtml(c.id)}">
          <option value="">0 баллов</option>
          ${POINTS.map(p=>`<option value="${p}">${p} баллов</option>`).join('')}
        </select>
      </div>`).join('');
    root.querySelectorAll('select').forEach(s=>s.addEventListener('change',validateVote));
    validateVote();
  }
  function validateVote() {
    const vals = [...$('voteList').querySelectorAll('select')].map(s=>s.value).filter(Boolean);
    const valid = vals.length === 10 && new Set(vals).size === 10;
    $('submitVoteBtn').disabled = !valid;
    if (vals.length) status('voteStatus', valid ? 'Все 10 оценок распределены.' : `Выбрано оценок: ${vals.length} из 10. Каждое значение можно использовать один раз.`);
  }
  async function submitVote() {
    if (!sb) return status('voteStatus','Сначала подключи сайт.',true);
    const code = $('voterCode').value.trim();
    if (!code) return status('voteStatus','Введи индивидуальный код.',true);
    const selects = [...$('voteList').querySelectorAll('select')];
    const allocations = selects.filter(s=>s.value).map(s=>({country_id:s.dataset.country,points:Number(s.value)}));
    if (allocations.length!==10 || new Set(allocations.map(a=>a.points)).size!==10) return status('voteStatus','Распредели все баллы от 12 до 1 без повторов.',true);
    $('submitVoteBtn').disabled = true;
    status('voteStatus','Отправляем голос…');
    const {data,error} = await sb.functions.invoke('cast-vote',{body:{code,allocations}});
    if (error) {
      let msg = error.message || 'Не удалось отправить голос.';
      try { const body=await error.context.json(); if(body.error) msg=body.error; } catch(_){}
      status('voteStatus',msg,true);
      validateVote();
      return;
    }
    status('voteStatus',data?.message || 'Голос принят! Спасибо за участие.');
    $('voterCode').value='';
    selects.forEach(s=>s.value='');
    validateVote();
    loadResults();
  }
  async function loadResults() {
    if (!sb) return;
    const root=$('resultsList');
    const {data,error}=await sb.from('results').select('*').order('total_points',{ascending:false});
    if(error){root.innerHTML='<p class="muted">Не удалось загрузить результаты: '+escapeHtml(error.message)+'</p>';return;}
    if(!data?.length){root.innerHTML='<p class="muted">Пока голосов нет.</p>';return;}
    root.innerHTML=data.map((r,i)=>`<div class="result-row"><div><strong>${i+1}. ${escapeHtml(r.name || 'Участник')}</strong>${r.artist?`<div class="muted">${escapeHtml(r.artist)}</div>`:''}</div><div class="result-points">${Number(r.total_points)||0} очков</div></div>`).join('');
  }
  function setupRealtime() {
    if (!sb) return;
    if (channel) sb.removeChannel(channel);
    channel=sb.channel('public-vote-updates').on('postgres_changes',{event:'INSERT',schema:'public',table:'vote_items'},()=>loadResults()).subscribe();
  }
  async function adminLogin() {
    if (!sb) return status('adminStatus','Сначала подключи сайт.',true);
    const {data,error}=await sb.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});
    if(error) return status('adminStatus',error.message,true);
    $('adminTools').hidden=false;
    status('adminStatus','Вход выполнен.');
  }
  async function adminLogout() {
    if(sb) await sb.auth.signOut();
    $('adminTools').hidden=true;
    status('adminStatus','Вы вышли из панели.');
  }
  async function addCountry() {
    const name=$('countryName').value.trim(), artist=$('countryArtist').value.trim(), song=$('countrySong').value.trim();
    if(!name) return status('adminStatus','Укажи название страны.',true);
    const {error}=await sb.from('countries').insert({name,artist,song});
    if(error) return status('adminStatus','Не удалось добавить: '+error.message,true);
    $('countryName').value='';$('countryArtist').value='';$('countrySong').value='';
    status('adminStatus','Участник добавлен.');
    loadCountries();
  }
  async function createCodes() {
    const count=Number($('codeCount').value);
    if(!Number.isInteger(count)||count<1||count>500) return status('adminStatus','Укажи число от 1 до 500.',true);
    const {data,error}=await sb.functions.invoke('admin-create-codes',{body:{count}});
    if(error) {
      let msg=error.message||'Не удалось создать коды.';
      try{const b=await error.context.json();if(b.error)msg=b.error;}catch(_){}
      return status('adminStatus',msg,true);
    }
    const codes=data?.codes || data?.voter_codes || [];
    $('codesOutput').value=codes.map(c=>typeof c==='string'?c:(c.code||JSON.stringify(c))).join('\n');
    status('adminStatus',`Создано кодов: ${codes.length || count}. Скопируй и сохрани их.`);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  $('connectBtn').addEventListener('click',connect);
  $('submitVoteBtn').addEventListener('click',submitVote);
  $('refreshResultsBtn').addEventListener('click',loadResults);
  $('adminLoginBtn').addEventListener('click',adminLogin);
  $('adminLogoutBtn').addEventListener('click',adminLogout);
  $('addCountryBtn').addEventListener('click',addCountry);
  $('createCodesBtn').addEventListener('click',createCodes);
  savedConfig();
  if(localStorage.getItem('ev_url') && localStorage.getItem('ev_key')) connect();
})();