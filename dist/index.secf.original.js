(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*

SECF - Strategy Expiring Cache First (same as the strategy used in our service worker but without the need of service workers!)
It is similar to https://www.npmjs.com/package/axios-cache-adapter
NOTE: this needs .indexOf, Promises, and Object.assign support.
*/

  function adapter() {
    return function(config) {
      var secfAdapter = this;  // Instance of SecfAdapter class
      // axios >= 0.13.0 only passes the config and expects a promise to be
      // returned. axios < 0.13.0 passes (resolve, reject, config).
      if (arguments.length === 3) {
        config = arguments[2];
        handleRequest(secfAdapter, arguments[0], arguments[1], config);
      } else {
        return new Promise(function(resolve, reject) {
          handleRequest(secfAdapter, resolve, reject, config);
        });
      }
    }.bind(this);
  } 

  function SecfAdapter(axiosInstance, config) {
    var secfAdapter = this;  // Instance of SecfAdapter class
    if (secfAdapter===window)  return null;
    if (axiosInstance && axiosInstance.defaults) {
      this.axiosInstance = axiosInstance;
      this.adapterOriginal = axiosInstance.defaults.adapter;
      this.adapterConfig = config || {};
      return adapter.call(secfAdapter);
    }
    return null;
  }

  SecfAdapter.prototype.adapter = adapter;
  
  // Export adapter:
  module.exports = module.exports.default = SecfAdapter;
  
  
  // -------------------------------------------------
  // strategy_home   functionality. See service worker
  // -------------------------------------------------
  var buildQueryString = function(params) {
    var result = '';
    var io1 = 0 - 1, ko1, vo1;
    for (ko1 in params) { io1++; vo1 = params[ko1];
      result += ((io1==0)?'':'&')+encodeURIComponent(ko1)+'='+encodeURIComponent(vo1);
    }
    return result;
  };
  
  var dbs = {};
  var connection = {
    status: 'maybe_online',  // maybe_online | offline
    async_id: null
  };

  function handleRequest(secfAdapter, handleRequestResolve, handleRequestReject, options) {
    // 'secfAdapter' is an instance of the SecfAdapter class
    // 'options' is the config map passed to the adapter
    const idbVersion = 1;
    if (options==null)  options = {};
    options = Object.assign(secfAdapter.adapterConfig || {}, options);
      if (options.secf==null)  options.secf = {};
        if (options.secf.idbVersion==null)   options.secf.idbVersion = idbVersion;
        if (options.secf.idbName==null) {
          options.secf.idbName = 'axios-secf-cache-control';
          options.secf.idbVersion = idbVersion;
        }
        if (options.secf.maxAge==null)       options.secf.maxAge = 2 * 60;  // In seconds
        if (options.secf.cacheName==null)    options.secf.cacheName = 'axios-secf-cache-control';
        if (options.secf.log_enabled==null)  options.secf.log_enabled = false;
    
    var config = options;
    options = options.secf;
    
    if (options.log_enabled==true) console.log('[expiring_cache_first] - maxAge:'+options.maxAge+'  url:'+config.url+'  params:'+JSON.stringify(config.params));
    var db, row_cache_control, now_utc_timestamp, strategy, url, tx, query_string;

    // ~~~~~~~~
    // Closures
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    var $open_db_cache_control = function() {
      var db = dbs[''+options.idbName+'__'+options.idbVersion];
      // Open indexedDB
      return new Promise(function(resolve,reject) {
        if (db!=null)  { resolve(db); return; }
        var idbOpenDBRequest = indexedDB.open(options.idbName, options.idbVersion);
        idbOpenDBRequest.onupgradeneeded = function(event) {
          // Upgrade function
          var db = event.target.result;
          db.createObjectStore('urls', { keyPath:'url' });
          dbs[''+options.idbName+'__'+options.idbVersion] = db; resolve(db);
        };
        idbOpenDBRequest.onsuccess = function(event) {
          var db = event.target.result;
          dbs[''+options.idbName+'__'+options.idbVersion] = db; resolve(db);
        };
        idbOpenDBRequest.onerror = function(event) { 
          if (options.log_enabled==true) console.log('  [expiring_cache_first] - Error opening the indexedDb '+options.idbName+' - Error:'+idbOpenDBRequest.error);
          reject(event);
        };
        idbOpenDBRequest.onblocked = function(event) { reject(event); };
      });
    };
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    var $process_response = function(response, origin) {
      // 'response' could be a response object from the network of from cache
      // 'origin' is an optional arg and can be: 'network' or 'cache'. This tells the function if the response comes from the network or the cache.
      // If we don't specify 'origin' the function will try to find out by itself like this:
      // The function checks if the response is from the cache if the 'date' header is the same as the 'date' property of row_cache_control object.
      // If they are NOT the same, then the function stores the response in the cache!
      // The problem is that the 'date' header will NOT be present on CORS request unless the server exposes it!
      // The function also sets the connection.status to 'offline' or 'maybe_online' depending on the 'response' and the 'strategy' used.
      return new Promise(function(resolve,reject) {
        if (!response)  { if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Bad response while fetching resource ['+url+']'); reject(); }
        else            { if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Good response while fetching resource ['+url+']');
          var response_header_date_utc, response_header_date_utc_timestamp;
          // IMPORTANT!!! The 'date' header will NOT be present in CORS requests! See: https://stackoverflow.com/a/37931084/3621841
          response_header_date_utc = response.headers && response.headers['date'];
          if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - response_header_date_utc:'+response_header_date_utc+'   url:['+url+']');
          // NOTE: the 'date' header in an http response is ALWAYS in string format, and the date itself is in UTC always.
          // Also, this date string can be safely be parsed directly by new Date(date_header) to convert it to date format.
          if (response_header_date_utc!=null &&
              (response_header_date_utc_timestamp = new Date(response_header_date_utc).getTime())!=null &&
              isNaN(response_header_date_utc_timestamp)==false) {
            // We have a valid response_header_date_utc_timestamp!
          } else {
            // We don't have a valid response_header_date_utc_timestamp!
            response_header_date_utc_timestamp = null;
          }
          if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - response_header_date_utc_timestamp:'+response_header_date_utc_timestamp+'   url:['+url+']');
          if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] -          row_cache_control.expires:'+row_cache_control.expires+'   url:['+url+']');
          
          // If we have a valid response_header_date_utc_timestamp and its value is the same as the one stored in row_cache_control
          // that would tell us that the response itself comes from the cache (since the date header has NOT changed since the last time)
          if (origin=='cache' ||
              (response_header_date_utc_timestamp!=null &&
               row_cache_control.date_utc_timestamp==response_header_date_utc_timestamp)) {
            if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - Resource was retrieved from CACHE'+'   url:['+url+']');
            if (strategy=='networkFirst' && connection.status=='maybe_online') {
              //console.log('SWITCHING connection.status to offline');
              connection.status = 'offline';
              connection.async_id = setTimeout(function() {
                //console.log('SWITCHING connection.status back to maybe_online');
                connection.status = 'maybe_online';
              }, 15*1000);
            }
            resolve();
          } else {
            if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - Resource was retrieved from NETWORK'+'   url:['+url+']');
            if (connection.status=='offline') {
              //console.log('SWITCHING connection.status to maybe_online');
              connection.status = 'maybe_online';
              if (connection.async_id!=null)  { clearTimeout(connection.async_id); connection.async_id = null; }
            }
            // Now we can insert/update row_cache_control
            var method = (row_cache_control.url==null) ? 'add' : 'put';
            now_utc_timestamp = Date.now();
            row_cache_control.url = url;
            row_cache_control.date_utc_timestamp = response_header_date_utc_timestamp;  // Could be null if the date header is not present in the response.
            row_cache_control.expires = now_utc_timestamp + (options.maxAge*1000);
            row_cache_control.response = {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              data: response.data
            };
            if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - updating row_cache_control to:'+JSON.stringify(row_cache_control)+'   url:['+url+']');
            var urls = db.transaction(['urls'], 'readwrite').objectStore('urls');
              if (method=='add')  requestUpdate = urls.add(row_cache_control);
              else                requestUpdate = urls.put(row_cache_control);
            requestUpdate.onerror = function(event) {
              if (options.log_enabled==true) console.log('  [expiring_cache_first] - Error updating cache-control data associated to resource ['+url+'] - Error:'+requestUpdate.error);
              reject();
            };
            requestUpdate.onsuccess = function(event) {
              if (options.log_enabled==true) console.log('      [expiring_cache_first.'+strategy+'] - row_cache_control updated to:'+JSON.stringify(row_cache_control)+'   url:['+url+']');
              resolve();
            };
          }
        }
      });
    };
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    

    new Promise(function(resolve,reject) {
      // Get database instance:
      db = dbs[''+options.idbName+'__'+options.idbVersion];
      if (db==null) {
        $open_db_cache_control().catch(function(err){
          if (options.log_enabled==true) console.log(err);
        }).then(function(_db){
          db = _db;
          resolve(db);
        });
      } else resolve(db);
    }).then(function(db) {
      
      // Get response from database:
      query_string = '';
      url = ''+config.url;
      if (config.params) {
        query_string = buildQueryString(config.params);
        if (query_string!='') {
          url += (
            url.indexOf('?') >= 0
              ? '&'
              : '?'
          ) + query_string;
        }
      }
      row_cache_control = {};
      return new Promise(function(resolve,reject) {
        var requestGet = db.transaction('urls', 'readonly').objectStore('urls').get(url);
        requestGet.onerror = function(event) {
          if (options.log_enabled==true) console.log('  [expiring_cache_first] - Error reading cache-control data associated to resource ['+url+'] - Error:'+requestGet.error);
          resolve(null);
        };
        requestGet.onsuccess = function(event) { resolve(requestGet.result); };
      });
    }).catch(function(err){
      if (options.log_enabled==true) console.log('  [expiring_cache_first] - Error reading cache-control data associated to resource ['+url+'] - Error:'+err);
    }).then(function(_row_cache_control) {
      row_cache_control = _row_cache_control || {};
      if (options.log_enabled==true) console.log('  [expiring_cache_first] - row_cache_control for this resource:'+JSON.stringify(row_cache_control)+'   url:['+url+']');
      now_utc_timestamp = Date.now(); // Same as: new Date().getTime(); // NOTE: this is in UTC always since the value returned by the getTime method is the number of milliseconds since 1 January 1970 00:00:00 UTC
      
      if (options.log_enabled==true) console.log('  [expiring_cache_first] - row_cache_control.expires (1): '+row_cache_control.expires+'   url:['+url+']');
      if (options.log_enabled==true) console.log('  [expiring_cache_first] -         now_utc_timestamp (2): '+now_utc_timestamp+'   url:['+url+']');
      if (options.log_enabled==true) console.log('  [expiring_cache_first] -                       (1)>(2): '+(row_cache_control.expires>now_utc_timestamp)+'   url:['+url+']');
      if (connection.status=='offline' ||
          (row_cache_control!=null &&
           row_cache_control.expires!=null &&
           row_cache_control.expires>now_utc_timestamp)) {
        // The response data we have in cache has NOT expired yet, so we can use it.
        strategy = 'cacheFirst';
        if (options.log_enabled==true) console.log('  [expiring_cache_first] - strategy: '+strategy);
        if (row_cache_control==null)  {
          // Cache request failed. Try to get response from network
          config.adapter = secfAdapter.adapterOriginal;
          secfAdapter
            .axiosInstance
            .request(config)
            .then(
              function(response) {
                return $process_response(response, 'network').catch(function(err){
                  if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Error while handling cache-control data associated to resource ['+url+'] - Error:',err);
                  handleRequestResolve(response); return response;
                }).then(function(){
                  handleRequestResolve(response); return response;
                });
              },
              function(err) {
                if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Error while fetching resource ['+url+'] - Error:'+JSON.stringify(err));
                handleRequestReject(err); return null;
              }
            );
        } else handleRequestResolve(row_cache_control.response);        
        
      } else {
        // The response data we have in the cache HAS expired or does not exist, so we cannot use it. We must get the response from the network.
        strategy = 'networkFirst';
        if (options.log_enabled==true) console.log('  [expiring_cache_first] - strategy:'+strategy);
        config.adapter = secfAdapter.adapterOriginal;
        secfAdapter
          .axiosInstance
          .request(config)
          .then(
            function(response) {
              return $process_response(response, 'network').catch(function(err){
                if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Error while handling cache-control data associated to resource ['+url+'] - Error:',err);
                handleRequestResolve(response); return response;
              }).then(function(){
                handleRequestResolve(response); return response;
              });
            },
            function(err) {
              // Network request failed. Try to get response from cache
              if (row_cache_control==null)  {
                if (options.log_enabled==true) console.log('    [expiring_cache_first.'+strategy+'] - Error while fetching resource ['+url+'] - Error:'+JSON.stringify(err));
                handleRequestReject(err); return null;
              } else {
                handleRequestResolve(row_cache_control.response); return null;
              }
            }
          );
      }
    });    
    
    
    /*
    if (options.cancelToken) {
      options
        .cancelToken
        .promise
        .then(function(cancel) {
          if (!script)  return;
          isAbort = true;
          reject(cancel);
        });
    }

    if (true) {
      // response from cache
      var response = {
        data: {a:1},
        status: 200,
        statusText: 'OK',
        headers: {},
        //config: options
        //request: request
      };
      resolve(response);
    }
    */
    
  };
  
},{}],2:[function(require,module,exports){
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
window.SecfAdapter = require('./index.js');
if (true && window.axios!=null)
  // Create a default instance of the adapter with default params
  window.secfAdapter = new SecfAdapter(window.axios);
  
},{"./index.js":1}]},{},[2]);