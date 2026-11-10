/* Invented stand-in screen: a counter kept in localStorage, a fetch of a same-origin file, a blob worker and a canvas. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  $('stand-when').textContent = new Date().toISOString().slice(0, 10) + ' #' + Math.floor(Math.random() * 1000);
  $('stand-coins').textContent = String(window.UWEditor.model.coins);
  $('stand-coin').addEventListener('click', function () {
    window.UWEditor.model.coins += 1; window.UWEditor.commit();
    $('stand-coins').textContent = String(window.UWEditor.model.coins);
  });
  $('stand-example').addEventListener('click', function () {
    fetch('example.json').then(function (r) { return r.json(); }).then(function (j) {
      var url = URL.createObjectURL(new Blob(['onmessage=function(e){postMessage(e.data.units.length)}'], { type: 'text/javascript' }));
      var w = new Worker(url);
      w.onmessage = function (e) { $('stand-out').textContent = j.name + ': ' + e.data + ' suites'; w.terminate(); };
      w.postMessage(j);
    });
  });
  $('stand-probe').addEventListener('click', function () {
    var r = [];
    try { (0, eval)('1'); r.push('eval allowed'); } catch (e) { r.push('eval blocked'); }
    try { new Function('return 1'); r.push('function allowed'); } catch (e) { r.push('function blocked'); }
    fetch('https://example.invalid/x').then(function () { r.push('outside allowed'); }, function () { r.push('outside blocked'); }).then(function () { $('stand-probe-out').textContent = r.join(', '); });
  });
  var g = $('stand-canvas').getContext('2d'); g.fillStyle = '#c80'; g.fillRect(10, 10, 60, 20);
})();
