// Tema de Chaski: "system" (por defecto), "light" o "dark". Se carga en <head> antes de pintar
// para que no parpadee. La app cambia la preferencia con el evento "chaski-theme".
(function () {
  var KEY = 'chaski-theme';
  var mq = matchMedia('(prefers-color-scheme: dark)');
  function pref() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
  function apply() {
    var p = pref();
    var dark = p === 'dark' || (p === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e0e11' : '#ffffff');
  }
  apply();
  mq.addEventListener('change', apply);
  addEventListener('chaski-theme', apply);
})();
