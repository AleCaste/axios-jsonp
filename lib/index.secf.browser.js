/*
@ Install browserify:
npm install --global browserify
@ Go to:
D:/git_repos/axios-jsonp
@ Run:
browserify ./lib/index.secf.browser.js -o ./dist/index.secf.js
@ To uglify, run:
uglifyjs ./dist/index.secf.js --compress --mangle --verbose -o ./dist/index.secf.min.js
*/ 
window.SecfAdapter = require('./index.secf.module.js');
if (true && window.axios!=null)
  // Create a default instance of the adapter with default params
  window.secfAdapter = new SecfAdapter(window.axios);




