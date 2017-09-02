(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
NOTE: this needs .indexOf and Promises support
*/

  var cid = 1;
  var buildQueryString = function(params) {
    var result = '';
    var io1 = 0 - 1, ko1, vo1;
    for (ko1 in params) { io1++; vo1 = params[ko1];
      result += ((io1==0)?'':'&')+encodeURIComponent(ko1)+'='+encodeURIComponent(vo1);
    }
    return result;
  };
  module.exports = function jsonpAdapter(config) {
  //window.jsonpAdapter = function(config) {
    /* Specific config properties (same as in jQuery):
       jsonp: 'callback'                          (specifies the callback parameter name, for jsonp the name of this param is 'callback' by default)
       jsonpCallback: 'axiosJsonpCallback[cid]'   (specifies the callback parameter value, which for jsonp is the global function to execute with the data received e.g. axiosJsonpCallback12(dataMap) )
    */
    if (config==null)  config = {};
      if (config.jsonp==null)  config.jsonp = 'callback';
      if (config.jsonpCallback==null)  config.jsonpCallback = 'axiosJsonpCallback'+(cid++);
    
    return new Promise(function (resolve, reject) {
      var query_string = '';
      var script = document.createElement('script');
      var src = config.url;
      if (config.params) {
        query_string = buildQueryString(config.params);
        if (query_string!='') {
          src += (
            src.indexOf('?') >= 0
              ? '&'
              : '?'
          ) + query_string;
        }
      }
      script.async = true;
      var old = window[config.jsonpCallback];
      var isAbort = false;
      window[config.jsonpCallback] = function(responseData) {
        window[config.jsonpCallback] = old;
        if (isAbort)  return;
        var response = {
          data  : responseData,
          status: 200
        };
        resolve(response);
      };
      var params_jsonp = {};
        params_jsonp[config.jsonp] = config.jsonpCallback; 
        params_jsonp['_'] = (new Date().getTime()); 
      query_string += (query_string==''?'':'&') + buildQueryString(params_jsonp);
      src          += (src.indexOf('?')==-1?'?':'&') + query_string;
      script.onload = script.onreadystatechange = function() {
        if (!script.readyState || /loaded|complete/.test(script.readyState)) {
          script.onload = script.onreadystatechange = null;
          if (script.parentNode) {
            script
              .parentNode
              .removeChild(script);
          }
          script = null;
        }
      };
      if (config.cancelToken) {
        config
          .cancelToken
          .promise
          .then(function(cancel) {
            if (!script)  return;
            isAbort = true;
            reject(cancel);
          });
      }
      script.src = src;
      document
        .head
        .appendChild(script);
      if (config.timeout>0) {
        setTimeout(function() {
          reject('jsonp request timed out after '+config.timeout+' ms');
        }, config.timeout);
      }
        
    });
  };
},{}],2:[function(require,module,exports){
/*
@ Install browserify:
npm install --global browserify
@ Go to:
D:\xampp\htdocs\http_server_es6
@ Run:
browserify ./index_browser.js -o ../dist/index.js
*/ 
window.jsonpAdapter = require('./index.js');





},{"./index.js":1}]},{},[2]);
