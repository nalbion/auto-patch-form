Polymer({
    is: 'smart-form',
    extends: 'form',

    properties: {
        /**
         * eg: <code>&lt;form is="smart-form" action="//api.example.com/smart-form"></code>
         * @type {String}
         */
        action: {
            type: String
        },
        /**
         * A comma-delimited string of events which require a GET request to the <code>action</code> URL.
         * eg: "ready"
         * @type {String}
         */
        getWhen: {
            type: String
        },

        /**
         * Can optionally request 'application/vnd.api+json'
         * @default 'application/json'
         * @type {String}
         */
        accept: {
            type: String
            // value: 'application/json'
        },

        /**
         * Whether or not to send credentials on the request. Default is false.
         * See [XMLHttpRequest.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials)
         * @type {Boolean}
         */
        withCredentials: {
            type: Boolean
        }
    },

    created: function() {
        console.info('smart-form created');
    },

    ready: function() {
        // `ready` is called after all elements have been configured, but
        // propagates bottom-up. This element's children are ready, but parents
        // are not.
        //
        // This is the point where you should make modifications to the DOM (when
        // necessary), or kick off any processes the element wants to perform.

        //window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        var self = this;

        this._locateControls();

        var model = {};
        this._loadLocalData(model, true, function() {
            if (self.getWhen) {
                var loadDirtyData = function() {
                    // load any data which has not been submitted over the remote data
                    self._loadLocalData(model, false, function() {
                        // apply data to inputs and controls
                        // save initial state - no undo beyond here
                        // listen for updates from inputs & controls
                        self.fire('smart-form-ready');
                    });
                };
                
                self.getWhenEvents = self.getWhen.split(',');
                if (self.getWhenEvents.indexOf('ready') >= 0) {
                    // load remote data over the top of the submitted data (if we have network access)
                    self._loadRemoteData(model).then(loadDirtyData);
                } else {
                    loadDirtyData();
                }
            }
        });
    },

    attached: function() {
        // `attached` fires once the element and its parents have been inserted
        // into a document.
        //
        // This is a good place to perform any work related to your element's
        // visual state or active behavior (measuring sizes, beginning animations,
        // loading resources, etc).
        console.info('smart-form attached');
    },

    detached: function() {
        // The analog to `attached`, `detached` fires when the element has been
        // removed from a document.
        //
        // Use this to clean up anything you did in `attached`.
        console.info('smart-form detached');
    },

    /** @private */
    _locateControls: function() {
        var controls = this.querySelectorAll('[json-path]');
        this.controls = {};
        for (var i = controls.length; i-- > 0; ) {
            var control = controls[i],
                path = control.getAttribute('json-path');
            this.controls[path] = control;
        }
    },

    /**
     * @private
     * @return {Promise}
     */
    _loadRemoteData: function(model) {
        var self = this;
        return this._send('GET').then( function(response) {
            // extract the relevant parts from the response
            if (self.accept == 'application/vnd.api+json') {
                self.jsonApiId = response.data.id;
                self.jsonApiType = response.data.type;
                response = response.data.attributes;
            }

            // merge the remote data into our model
            self.extend(model, response);

            // update the
            for (var path in self.controls) {
                if (self.controls.hasOwnProperty(path)) {
                    var names = path.split('.'),
                        node = model;
                    for (var i = 1; i < names.length; i++) {
                        node = node[names[i]];
                    }
                    self.controls[path].value = node;
                }
            }
        });
    },

    /**
     *
     * @param {String} method - 'GET' or 'PATCH'
     * @return {Promise}
     */
    _send: function(method) {
        //abortPending && this.abort();
        var request = document.createElement('iron-request'),
            options = {
                url: this.action,
                method: method,
                handleAs: 'json',
                headers: { 'Accept': this.accept || 'application/json' },
                withCredentials: this.withCredentials
            };

        return request.send(options).then( function(response) {
            this.pendingRequest = null;
            return response.response;
        }, function(error) {
            this.pendingRequest = null;
            throw error;
        });
    },

    /**
     * @param {Object<String, any}
     * @param {Boolean} submitted - any data which has been accepted by the server is marked as <code>submitted</code>
     */
    _loadLocalData: function(model, submitted, callback) {
        if (window.indexedDB) {
            var self = this;
            var open /*: IDBOpenDBRequest*/ = indexedDB.open('smart-form', 2);
            open.onerror = function(e) {
                console.error('Error loading database:', e);
            };

            open.onupgradeneeded = function(event) {
                var db = event.target.result;

                db.onerror = function(event) {
                    note.innerHTML += '<li>Error loading database.</li>';
                };

                // Create an objectStore for this database
                var objectStore = db.createObjectStore(self.action, { autoIncrement : true });

                // define what data items the objectStore will contain

                objectStore.createIndex('submitted', 'submitted', { unique: false });
                objectStore.createIndex('time', 'time', { unique: false });
            };

            open.onsuccess = function(event) {
                console.info('Database initialised');

                // store the result of opening the database in the db variable. This is used a lot later on, for opening transactions and suchlike.
                var db = open.result; // or event.target.result;
                db.onerror = function(event) {
                    console.error('Database error: ' + event.target.errorCode);
                };
                callback();
            };
        }
    }
});