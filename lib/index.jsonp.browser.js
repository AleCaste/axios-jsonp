/*
@ Install browserify:
npm install --global browserify
@ Go to:
D:/git_repos/axios-jsonp
@ Run:
browserify ./lib/index.jsonp.browser.js -o ./dist/index.jsonp.js
@ To uglify, run:
uglifyjs ./dist/index.jsonp.js --compress --mangle --verbose -o ./dist/index.jsonp.min.js
*/ 
window.jsonpAdapter = require('./index.jsonp.module.js');




