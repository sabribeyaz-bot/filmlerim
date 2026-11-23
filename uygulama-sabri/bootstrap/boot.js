/* Stable startup, verified Blob execution, and whole-release recovery. */
(function (root) {
  'use strict';
  var manager, guard = root.FilmBootRecovery, mode = guard.mode();
  function progress(tr, en, done, total) { guard.check(); if (root.FilmBootProgress) root.FilmBootProgress.stage(tr, en, done, total); }
  function fail(error) { guard.fail(error); }
  root.addEventListener('error', function (event) { if (root.FilmPlugins && root.FilmPlugins.loading) { root.FilmPlugins.scriptErrors[root.FilmPlugins.loading] = event.message || 'Plugin script failed'; return; } if (manager && !manager.healthy && event.message) fail(new Error(event.message)); });
  function sequence(paths, fn) { var p = Promise.resolve(); paths.forEach(function (path) { p = p.then(function () { guard.check(); return fn(path); }); }); return p; }
  function newer(a, b) { var x = a.split('.'), y = b.split('.'), i; for (i = 0; i < 3; i++) { if (+x[i] !== +y[i]) return +x[i] > +y[i]; } return false; }
  function compatibleSet(m) {
    if (mode && mode !== 'normal' || !manager.state.active || m.version !== manager.baseline.version) return Promise.resolve(m);
    /* A same-version WGT replacement can remove formerly bundled objects. Never mix sets. */
    var local = {};manager.baseline.files.forEach(function (f) { local[f.path] = f.sha256; });
    return manager.storage.list().then(function (names) {
      var missing = m.files.some(function (f) { return local[f.path] !== f.sha256 && names.indexOf('obj-' + f.sha256 + '.txt') < 0; });
      if (!missing) return m;
      return manager.commit({previous:manager.state.active,active:manager.baselineRecord,pending:null,booting:false}).then(function () { return manager.baseline; });
    });
  }
  function start() {
    progress('Güncelleme seti hazırlanıyor…', 'Preparing installed updates…');
    manager = root.FilmUpdate = new root.FilmUpdateManager(); guard.bind(manager); guard.stage('storage and trust', 45000);
    return manager.init(mode === 'bundled').then(function () {
      guard.check();
      if (mode === 'bundled') { manager.blocked = true; manager.note = 'Kurtarma: WGT çekirdeği, eklentiler kapalı / Recovery: bundled core, plugins disabled'; }
      if (manager.state.booting && manager.state.active && !mode) throw new Error('Önceki başlangıç tamamlanmadı / Previous startup did not complete');
    }).then(function () { return manager.record(mode === 'bundled' ? manager.baselineRecord : mode === 'previous' ? manager.state.previous || manager.baselineRecord : manager.state.active || manager.baselineRecord); }).then(compatibleSet).then(function (m) {
      guard.check(); if (!mode && !manager.blocked && manager.state.active && newer(manager.baseline.version, m.version) && manager.state.baselineAttempted !== manager.baseline.version) return manager.commit({ previous: manager.state.active, active: manager.baselineRecord, pending: null, booting: false, baselineAttempted: manager.baseline.version }).then(function () { return manager.baseline; });
      return m;
    }).then(function (m) {
      guard.check(); if (mode === 'previous') manager.recoveryRecord = manager.state.previous; manager.selected = m; m.files.forEach(function (file) { manager.entries[file.path] = file; });
      return manager.blocked || mode ? null : manager.commit({ booting: true });
    }).then(function () {
      progress('Bağlantı ayarları hazırlanıyor…', 'Preparing connection settings…');
      guard.stage('native connection settings', 30000); var policy = manager.baseline.networkPolicy;
      if (!policy) return;
      return Promise.all([manager.local(policy.file), manager.local(policy.signature)]).then(function (files) { guard.check(); return new root.FilmUpdateVerify.Trust(root.FilmUpdateConfig.publicKey).verify(files[0], files[1]).then(function () { guard.check(); return root.FilmNativeTLS.configure(files[0], files[1]); }); }).then(function () {
        guard.check(); var selectedPolicy = manager.selected.networkPolicy;
        if (!selectedPolicy) return;
        var key = manager.selected._signer, descriptor = { channel: manager.config.channel, publicKey: key };
        return manager.registerChannel(descriptor, 'core-runtime').then(function () { return Promise.all([manager.source(selectedPolicy.file), manager.source(selectedPolicy.signature)]); }).then(function (files) { return new root.FilmUpdateVerify.Trust(key).verify(files[0], files[1]).then(function () { guard.check(); return root.FilmNativeTLS.configureRepository('core-runtime', 'core', files[0], files[1]); }); });
      });
    }).then(function () { return root.FilmFirstRunBoot ? root.FilmFirstRunBoot.run(manager, mode) : false; }).then(function (reloading) { if (reloading) return new Promise(function () {});
    }).then(function () { progress('Eklentiler hazırlanıyor…', 'Preparing extensions…'); guard.stage('plugin preparation', 60000); root.FilmPlugins = new root.FilmPluginManager(manager); if (mode && mode !== 'normal') { root.FilmPlugins.blocked = true; root.FilmPlugins.note = 'Bu açılışta eklentiler kapalı / Plugins disabled for this launch'; return; } return root.FilmPlugins.init().then(function () { guard.check(); return root.FilmPlugins.prepare(); }); }).then(function () { return manager.source(manager.selected.sites); }).then(function (text) {
      guard.check(); guard.stage('interface styles', 30000); manager.groups = root.FilmUpdateVerify.sites(text, manager.selected).concat(root.FilmPlugins.groups());
      return manager.source(manager.selected.shell);
    }).then(function (html) {
      guard.check(); if (/<script\b|\son[a-z]+\s*=|javascript\s*:/i.test(html)) throw new Error('Arayüz şablonu geçersiz.');
      document.getElementById('update-runtime').innerHTML = html;
      return sequence(manager.selected.styles, function (path) { return manager.source(path).then(function (text) { if (/\burl\s*\(|@import/i.test(text)) throw new Error('CSS dış dosya başvurusu desteklenmiyor.'); return new Promise(function (resolve, reject) { var link = document.createElement('link'), url = root.URL.createObjectURL(new Blob([text], { type: 'text/css' })); link.rel = 'stylesheet'; link.href = url; link.onload = function () { root.URL.revokeObjectURL(url); if (manager.bootStopped) reject(new Error('Startup cancelled')); else resolve(); }; link.onerror = function () { root.URL.revokeObjectURL(url); reject(new Error('Stylesheet could not be loaded: ' + path)); }; document.head.appendChild(link); }); }); });
    }).then(function () {
      guard.stage('interface scripts', 45000);
      return sequence(manager.selected.scripts, function (path) { progress('Arayüz yükleniyor…', 'Loading interface…', manager.selected.scripts.indexOf(path), manager.selected.scripts.length); return new Promise(function (resolve, reject) { var script = document.createElement('script'); script.onload = function () { if (manager.bootStopped) { reject(new Error('Startup cancelled.')); return; } progress('Arayüz yükleniyor…', 'Loading interface…', manager.selected.scripts.indexOf(path) + 1, manager.selected.scripts.length); resolve(); }; script.onerror = function () { reject(new Error('Kod yüklenemedi: ' + path)); }; manager.appendScript(script, path).catch(reject); }); });
    }).then(function () { if (root.FilmLegal && root.FilmLegal.consent && !root.FilmLegal.consent.accepted && document.getElementById('legal-overlay').getAttribute('aria-hidden') === 'false') manager.markHealthy(); });
  }
  try { start().catch(fail); } catch (error) { fail(error); }
})(window);

/* Film Merkezi (Sabri): adds the sabribeyaz-bot/filmlerim repositories and installs their plugins once. */
(function (root) {
  'use strict';
  var BASE = 'https://raw.githubusercontent.com/sabribeyaz-bot/filmlerim/main/';
  var REPOS = [
    { publisher: 'film-merkezi-puhutv', url: BASE + 'filmmerkezi-repository.json', plugins: ['p002'] },
    { publisher: 'film-merkezi-eklentiler', url: BASE + 'eklentiler/filmmerkezi-repository.json', plugins: ['p003', 'p005'] }
  ];
  var FLAG = 'sabri.depo.v2', SETUP = 'filmmerkezi.repository-setup.v1', tries = 0, running = false;
  function get(k) { try { return root.localStorage.getItem(k); } catch (e) { return 'err'; } }
  function set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} }
  function log(m) { try { console.log('[sabri-depo] ' + m); } catch (e) {} }
  function serial(list, fn) { return list.reduce(function (p, x) { return p.then(function (acc) { return fn(x).then(function (r) { return acc || r; }); }); }, Promise.resolve(false)); }
  function findRepo(m, r) {
    var ids = Object.keys(m.state.repositories || {});
    for (var i = 0; i < ids.length; i++) { var x = m.state.repositories[ids[i]]; if (x.publisherId === r.publisher || x.url === r.url) return ids[i]; }
    return '';
  }
  function installed(m, pid) { return Object.keys(m.state.plugins || {}).some(function (k) { return k.slice(-pid.length - 1) === '/' + pid; }); }
  function addRepo(m, r) {
    var id = findRepo(m, r);
    return (id ? Promise.resolve(id) : m.probe(r.url).then(function () { return m.approve(); })).then(function (repoId) {
      log('repo ' + r.publisher + ': ' + repoId);
      return serial(r.plugins, function (pid) {
        if (installed(m, pid)) return Promise.resolve(false);
        return m.download(repoId, pid).then(function () { log('installed ' + pid); return true; }, function (e) { log('skip ' + pid + ': ' + (e && e.message)); return false; });
      });
    });
  }
  function tick() {
    if (get(FLAG) === 'ok' || get(FLAG) === 'err' || ++tries > 150 || running) return;
    var m = root.FilmPlugins;
    if (!m || !m.state || !m.app || m.busy || m.blocked || !m.core || m.core.busy || (m.app.controller && m.app.controller.content)) { setTimeout(tick, 2000); return; }
    running = true;
    serial(REPOS, function (r) { return addRepo(m, r); }).then(function (changed) {
      set(FLAG, 'ok');
      set(SETUP, JSON.stringify({ version: 1, completed: true, step: 6, repoId: '', query: '', url: '' }));
      if (changed) root.location.reload();
    }, function (e) { running = false; log('error: ' + (e && e.message)); setTimeout(tick, 10000); });
  }
  setTimeout(tick, 5000);
})(window);
