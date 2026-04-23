// Fetch the SVG sprite and inject it into the document body so that
// <use href="icons.svg#id"> references resolve correctly in all browsers.
(function () {
  var script = document.currentScript;
  var base = script ? script.src.replace(/[^/]*$/, '') : '';
  fetch(base + 'icons.svg')
    .then(function (r) { return r.text(); })
    .then(function (svg) {
      var div = document.createElement('div');
      div.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
      div.setAttribute('aria-hidden', 'true');
      div.innerHTML = svg;
      document.body.insertBefore(div, document.body.firstChild);
    })
    .catch(function () { /* icons unavailable, degrade silently */ });
}());
