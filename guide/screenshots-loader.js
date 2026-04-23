// For each screenshot placeholder, attempt to load the image.
// If it loads successfully, swap the placeholder for an <img>.
// If not, leave the placeholder visible showing the expected filename.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.screenshot-placeholder[data-img]').forEach(function (el) {
    var src = './screenshots/' + el.getAttribute('data-img');
    var img = new Image();
    img.onload = function () {
      var figure = document.createElement('figure');
      figure.className = 'screenshot';
      img.alt = el.querySelector('.ph-desc') ? el.querySelector('.ph-desc').textContent : '';
      figure.appendChild(img);
      el.parentNode.replaceChild(figure, el);
    };
    img.src = src;
  });
});
