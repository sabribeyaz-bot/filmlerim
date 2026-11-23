/* Film Merkezi (Sabri): sabribeyaz-bot/filmlerim deposunu ilk açılışta otomatik ekler ve P002'yi kurar.
   Yalnızca uygulamanın kendi probe/approve/download akışını kullanır; imza doğrulamaları aynen geçerlidir. */
(function (root) {
  'use strict';
  var URL = 'https://raw.githubusercontent.com/sabribeyaz-bot/filmlerim/main/filmmerkezi201-repository.json';
  var FLAG = 'sabri.depo.v1', SETUP = 'filmmerkezi.repository-setup.v1', PLUGIN = 'p002', tries = 0, running = false;
  function get(k) { try { return root.localStorage.getItem(k); } catch (e) { return 'err'; } }
  function set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} }
  function log(m) { try { console.log('[sabri-depo] ' + m); } catch (e) {} }
  function repoId(m) {
    var ids = Object.keys(m.state.repositories || {});
    for (var i = 0; i < ids.length; i++) if (m.state.repositories[ids[i]].url === URL) return ids[i];
    return '';
  }
  function finish(reload) {
    set(FLAG, 'ok');
    set(SETUP, JSON.stringify({ version: 1, completed: true, step: 6, repoId: '', query: '', url: '' }));
    log(reload ? 'P002 kuruldu, yeniden aciliyor' : 'zaten kurulu');
    if (reload) root.location.reload();
  }
  function tick() {
    if (get(FLAG) === 'ok' || get(FLAG) === 'err' || ++tries > 150 || running) return;
    var m = root.FilmPlugins;
    if (!m || !m.state || !m.app || m.busy || m.blocked || !m.core || m.core.busy || (m.app.controller && m.app.controller.content)) { setTimeout(tick, 2000); return; }
    running = true;
    var existing = repoId(m);
    var step = existing ? Promise.resolve(existing) : m.probe(URL).then(function () { return m.approve(); });
    step.then(function (id) {
      log('depo: ' + id);
      if (m.state.plugins[id + '/' + PLUGIN]) return false;
      return m.download(id, PLUGIN).then(function () { return true; });
    }).then(finish, function (e) {
      running = false;
      log('hata: ' + (e && e.message));
      setTimeout(tick, 10000);
    });
  }
  setTimeout(tick, 5000);
})(window);
