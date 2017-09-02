/*
@ Install browserify:
npm install --global browserify
@ Go to:
D:\xampp\htdocs\http_server_es6
@ Run:
browserify ./index_browser.js -o ../dist/index.js
uglifyjs -o ../dist/index.min.js ../dist/index.js
*/ 
window.jsonpAdapter = require('./index.js');




