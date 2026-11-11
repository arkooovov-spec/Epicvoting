(() => {
  const $ = id => document.getElementById(id);
  const POINTS = [12,10,8,7,6,5,4,3,2,1];
  let sb = null, adminSb = null, countries = [], channel = null;
  let anonymousUserId = null, alreadyVoted = false;

  function say(id, message, error=false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', !!error);
  }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function restore() {
    $('supabaseUrl').value = localStorage.getItem('ev_url') || '';
    $('supabaseKey').value = localStorage.getItem('ev_key') || '';
  }
  function createAdminClient(url, key) {
    adminSb = window.supabase.createClient(url, key, {
      auth: {
        storageKey: 'ev_admin_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }
  async function connect() {
    const url = $('supabaseUrl').value.trim().replace(/\/+$/, '');
    const key = $('supabaseKey').value.trim();
    if (!url || !key) return say('connectionStatus', 'Заполни адрес проекта и публичный ключ.', true);
    if (!window.supabase?.createClient) return say('connectionStatus', 'Не удалось загрузить Supabase. Проверь интернет.', true);

    localStorage.setItem('ev_url', url);
    localStorage.setItem('ev_key', key);
    sb = window.supabase.createClient(url, key);
    createAdminClient(url, key);
    say('connectionStatus', 'Подключаемся…');

    const {data: sessionData, error: sessionError} = await sb.auth.getSession();
    if (sessionError) return say('connectionStatus', sessionError.message, true);
    let session = sessionData.session;
    if (!session) {
      const {data, error} = await sb.auth.signInAnonymously();
      if (error) return say('connectionStatus', 'Не удалось начать анонимную сессию: ' + error.message, true);
      session = data.session;
    }
    anonymousUserId = session?.user?.id || null;
    if (!anonymousUserId) return say('connectionStatus', 'Не удалось создать сессию участника.', true);

    await loadCountries();
    await checkVoteStatus();
    await loadResults();
    setupRealtime();
    $('connectionSettings').open = false;
    say('connectionStatus', 'Подключено · участников: ' + countries.length);
    if (location.hash === '#admin') await restoreAdminSession();
  }
  async function loadCountries() {
    const {data, error} = await sb.from('countries').select('*').order('name');
    if (error) { say('connectionStatus', 'Не удалось загрузить список: ' + error.message, true); return; }
    countries = data || [];
    renderCountries();
  }
  function renderCountries() {
    const root = $('voteList');
    if (alreadyVoted) {
      root.innerHTML = '<div class="notice">Твой голос уже учтён. Спасибо за участие!</div>';
      $('submitVoteBtn').disabled = true;
      return;
    }
    if (!countries.length) {
      root.innerHTML = '<p class="empty-state">Участники скоро появятся.</p>';
      $('submitVoteBtn').disabled = true;
      return;
    }
    root.innerHTML = countries.map(c => `
      <div class="vote-row">
        <div><strong>${esc(c.name)}</strong><small>${esc([c.artist, c.song].filter(Boolean).join(' · '))}</small></div>
        <select aria-label="Баллы для ${esc(c.name)}" data-country="${esc(c.id)}">
          <option value="">0 баллов</option>
          ${POINTS.map(p => `<option value="${p}">${p} баллов</option>`).join('')}
        </select>
      </div>`).join('');
    root.querySelectorAll('select').forEach(s => s.addEventListener('change', validate));
    validate();
  }
  function validate() {
    const vals = [...$('voteList').querySelectorAll('select')].map(s => s.value).filter(Boolean);
    const ok = vals.length === 10 && new Set(vals).size === 10;
    $('submitVoteBtn').disabled = !ok || alreadyVoted;
    if (vals.length) say('voteStatus', ok ? 'Все 10 оценок распределены.' : `Выбрано оценок: ${vals.length} из 10.`);
    else say('voteStatus', '');
  }
  async function checkVoteStatus() {
    const {data, error} = await sb.rpc('has_current_user_voted');
    if (error) { say('voteStatus', 'Не удалось проверить голос: ' + error.message, true); return; }
    alreadyVoted = !!data;
    $('voteIdentity').textContent = alreadyVoted ? 'Твой голос уже принят.' : 'Выбери 10 фаворитов и распредели баллы.';
    renderCountries();
    if (alreadyVoted) say('voteStatus', 'Голос принят. Спасибо!');
  }
  async function submitVote() {
    if (!sb || !anonymousUserId) return say('voteStatus', 'Подключи голосование.', true);
    if (alreadyVoted) return say('voteStatus', 'Голос уже отправлен.', true);
    const selections = [...$('voteList').querySelectorAll('select')];
    const allocations = selections.filter(s => s.value).map(s => ({
      country_id: s.dataset.country, points: Number(s.value)
    }));
    if (allocations.length !== 10 || new Set(allocations.map(a => a.points)).size !== 10)
      return say('voteStatus', 'Распредели все десять оценок без повторов.', true);

    $('submitVoteBtn').disabled = true;
    say('voteStatus', 'Отправляем голос…');
    const {error} = await sb.rpc('submit_anonymous_vote', {p_allocations: allocations});
    if (error) {
      say('voteStatus', error.message.includes('already voted') ? 'Ты уже голосовал с этой учётной записи.' : error.message, true);
      await checkVoteStatus();
      return;
    }
    alreadyVoted = true;
    $('voteIdentity').textContent = 'Голос отправлен. Спасибо!';
    renderCountries();
    say('voteStatus', 'Твой голос учтён!');
    await loadResults();
  }
  async function loadResults() {
    if (!sb) return;
    const root = $('resultsList');
    const {data, error} = await sb.from('results').select('*').order('total_points', {ascending:false});
    if (error) { root.innerHTML = `<p class="empty-state">Не удалось загрузить результаты: ${esc(error.message)}</p>`; return; }
    if (!data?.length) { root.innerHTML = '<p class="empty-state">Пока нет голосов. Будь первым!</p>'; return; }
    root.innerHTML = data.map((r, i) => `
      <div class="result-row">
        <div class="result-rank">${i + 1}</div>
        <div class="result-name"><strong>${esc(r.name || 'Участник')}</strong>${r.artist ? `<div class="muted">${esc(r.artist)}</div>` : ''}</div>
        <div class="result-points">${Number(r.total_points) || 0} очков</div>
      </div>`).join('');
  }
  function setupRealtime() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('eurovote-live-results')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'vote_items'}, () => loadResults())
      .subscribe();
  }
  function showAdminGate() {
    $('adminSection').hidden = location.hash !== '#admin';
  }
  async function restoreAdminSession() {
    if (!adminSb) return;
    const {data, error} = await adminSb.auth.getSession();
    if (error || !data.session) return;
    const role = data.session.user?.app_metadata?.role;
    if (role === 'admin') showAdminTools(data.session.user.email);
    else await adminSb.auth.signOut();
  }
  function showAdminTools(email) {
    $('adminTools').hidden = false;
    $('adminLoginBtn').hidden = true;
    $('adminLogoutBtn').hidden = false;
    $('adminEmail').value = email || '';
    $('adminEmail').disabled = true;
    $('adminPassword').hidden = true;
    say('adminStatus', 'Вход выполнен.');
  }
  async function adminLogin() {
    if (!adminSb) return say('adminStatus', 'Сначала подключи сайт.', true);
    const {data, error} = await adminSb.auth.signInWithPassword({
      email: $('adminEmail').value.trim(),
      password: $('adminPassword').value
    });
    if (error) return say('adminStatus', 'Не удалось войти. Проверь email и пароль.', true);
    if (data.user?.app_metadata?.role !== 'admin') {
      await adminSb.auth.signOut();
      return say('adminStatus', 'У этого аккаунта нет прав администратора.', true);
    }
    showAdminTools(data.user.email);
    await loadCountries();
  }
  async function adminLogout() {
    if (adminSb) await adminSb.auth.signOut();
    $('adminTools').hidden = true;
    $('adminLoginBtn').hidden = false;
    $('adminLogoutBtn').hidden = true;
    $('adminEmail').disabled = false;
    $('adminPassword').hidden = false;
    $('adminPassword').value = '';
    say('adminStatus', 'Вы вышли из панели.');
  }
  async function addCountry() {
    if (!adminSb) return say('adminStatus', 'Нет подключения.', true);
    const name = $('countryName').value.trim();
    const artist = $('countryArtist').value.trim();
    const song = $('countrySong').value.trim();
    if (!name) return say('adminStatus', 'Укажи страну.', true);
    const {error} = await adminSb.from('countries').insert({name, artist, song});
    if (error) return say('adminStatus', 'Не удалось добавить участника: ' + error.message, true);
    $('countryName').value = '';
    $('countryArtist').value = '';
    $('countrySong').value = '';
    say('adminStatus', 'Участник добавлен.');
    await loadCountries();
  }

  $('connectBtn').addEventListener('click', connect);
  $('submitVoteBtn').addEventListener('click', submitVote);
  $('refreshResultsBtn').addEventListener('click', loadResults);
  $('adminLoginBtn').addEventListener('click', adminLogin);
  $('adminLogoutBtn').addEventListener('click', adminLogout);
  $('addCountryBtn').addEventListener('click', addCountry);
  window.addEventListener('hashchange', showAdminGate);

  restore();
  showAdminGate();
  if (localStorage.getItem('ev_url') && localStorage.getItem('ev_key')) connect();
})();
