Polymer({
    is: 'auto-patch-form',
    extends: 'form',

    properties: {
        /**
         * eg: <code>&lt;form is="auto-patch-form" action="//api.example.com/auto-patch-form"></code>
         * @type {String}
         */
        action: {
            type: String
        },

        /**
         * A comma-delimited string of events which require a GET request to the <code>action</code> URL.
         * eg: "ready"
         */
        getWhen: {
            type: String
        },

        /**
         * Can optionally send/request 'application/vnd.api+json'
         * @default 'application/json'
         */
        contentType: {
            type: String
            // value: 'application/json'
        },

        /**
         * Whether or not to send credentials on the request. Default is false.
         * See [XMLHttpRequest.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials)
         */
        withCredentials: {
            type: Boolean
        },

        /**
         * Number of milliseconds to wait before sending
         */
        debounceMs: {
            type: Number,
            value: 5000
        },

        /**
         * All changes are recorded before being automatically submitted as PATCHes.
         * Changes which have not been submitted can be reverted by calling undo.
         * This value restricts the size of the undo buffer
         */
        maxHistory: {
            type: Number,
            value: 50
        },

        /** Set to true when the form has updates which are still queued or waiting for acknowledgement from the server */
        patchPending: {
            type: Boolean,
            readOnly: true,
            reflectToAttribute: true
        },

        /**
         * @default false if indexedDB is supported
         */
        useLocalStorage: {
            type: Boolean,
            value: function() {
                return !window.indexedDB;
            }
        }
    },

    // created: function() {
    //     console.info('auto-patch-form created');
    // },

    ready: function() {
        // `ready` is called after all elements have been configured, but
        // propagates bottom-up. This element's children are ready, but parents
        // are not.
        //
        // This is the point where you should make modifications to the DOM (when
        // necessary), or kick off any processes the element wants to perform.

        //window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        var self = this;

        this._activityLog = [];
        this._locateControls();

        var model = {};
        this._loadLocalData(model, true, function() {
            var loadDirtyData = function() {
                // load any data which has not been submitted over the remote data
                self._loadLocalData(model, false, function() {
                    // apply model data to inputs and controls
                    for (var path in self.controls) {
                        //var path = self.controls[control];
                        if (model[path] !== undefined) {
                            control = self.controls[path];
                            // TODO: support other options for updating the value
                            control.value = model[path].value;
                        }
                    }

                    // save initial state - no undo beyond here
                    // listen for updates from inputs & controls
                    self.fire('auto-patch-form-ready');
                });
            };
            
            self.getWhenEvents = self.getWhen ? self.getWhen.split(',') : null;
            if (self.getWhenEvents.indexOf('ready') >= 0) {
                // load remote data over the top of the submitted data (if we have network access)
                self._loadRemoteData(model).then(loadDirtyData, loadDirtyData);
            } else {
                loadDirtyData();
            }
        });
    },

    // attached: function() {
    //     // `attached` fires once the element and its parents have been inserted
    //     // into a document.
    //     //
    //     // This is a good place to perform any work related to your element's
    //     // visual state or active behavior (measuring sizes, beginning animations,
    //     // loading resources, etc).
    //     console.info('auto-patch-form attached');
    // },
    //
    // detached: function() {
    //     // The analog to `attached`, `detached` fires when the element has been
    //     // removed from a document.
    //     //
    //     // Use this to clean up anything you did in `attached`.
    //     // console.info('auto-patch-form detached');
    // },

    /** @private */
    _locateControls: function() {
        var controls = this.querySelectorAll('[json-path]'),
            boundOnChange = this._onChange.bind(this);
        this.controls = {};
        for (var i = controls.length; i-- > 0; ) {
            var control = controls[i],
              path = control.getAttribute('json-path');
            this.controls[path] = control; //{control: control, path: path.split('.')};
            //this.listen(control, 'change', '_onChange');
            control.addEventListener('change', boundOnChange);        // or value-changed?
        }
    },

    _onChange: function(e) {
        this.patchPending = true;
        var path = e.target.getAttribute('json-path');

        this._activityLog.push({
            time: new Date().getTime(),
            path: path,
            value: e.target.value,
            state: 0    // 0: PENDING, 1: SUPERSEDED, 2: SUBMITTED, 3: ACCEPTED
        });
        // clean up the _activityLog so that it doesn't get too large
        var len = this._activityLog.length,
            max = this.maxHistory,
            lastOfPath = {};
        for (var i = 0; i < len && len > max; i++ ) {
            var activity = this._activityLog[i];
            if (activity.state != 0) {
                this._activityLog.splice(i--, 1);
                len--;
            } else {
                var previous = lastOfPath[activity.path];
                if (previous !== undefined) {
                    // this one hasn't been submitted yet, but we can remove a redundant entry
                    activity.previous = this._activityLog[previous].value;
                    this._activityLog.splice(previous, 1);
                    len--;
                    i--;
                }
                lastOfPath[activity.path] = i;
            }
        }

        var self = this;
        this.debounce('autoPatch', function() {
            var body = {};
            // starting with the oldest records, and sending only PENDING changes,
            // over-write any other PENDING changes for the same path
            var submittedRecords = [];
            for (var i = 0; i < len; i++ ) {
                var activity = this._activityLog[i];
                if (activity.state == 0) {
                    var superseded = body[activity.path];
                    if (superseded) {
                        submittedRecords.splice( submittedRecords.indexOf(superseded), 1 );
                        superseded.state = 1;           // SUPERSEDED
                    }
                    activity.state = 2;                 // SUBMITTED
                    submittedRecords.push(activity);
                    body[activity.path] = {value: activity.value, time: activity.time}
                }
            }
            if (this.contentType == 'application/vnd.api+json') {
                body = {
                    data: {
                        type: self.jsonApiType || 'merge',
                        id: self.jsonApiId || 'self',
                        attributes: body
                    }
                };
            }

            self._send('PATCH', body).then( function(response) {
                console.info('PATCH response:', response.status, response.response);
                // update the state of each _activityLog item to 3: ACCEPTED
                var i = submittedRecords.length;
                while (i-- != 0) {
                    submittedRecords[i].state = 3;
                }
                self.patchPending = false;
            }, function(err) {
                var i = submittedRecords.length;
                while (i-- != 0) {
                    submittedRecords[i].state = 0;      // reset to PENDING
                }
            });
        }, this.debounceMs);
    },

    /**
     * @private
     * @return {Promise}
     */
    _loadRemoteData: function(model) {
        var self = this;
        return this._send('GET').then( function(response) {
            response = response.response;
            // extract the relevant parts from the response
            if (self.contentType == 'application/vnd.api+json') {
                self.jsonApiId = response.data.id;
                self.jsonApiType = response.data.type;
                response = response.data.attributes;
            }
            // response is now a simple JSON object with values which can be located using the `json-path` of each control
            // our model is a map of json-path: {value: any} // maybe: time:number, dirty:boolean, previous:any}
            // controls is a map of json-path: {control: HTMLElement, path: string[]}

            // merge the remote data into our model, select the paths that our controls are interested in
            // self.extend(model, response);
            var now = new Date().getTime();
            for (var path in self.controls) {
                if (self.controls.hasOwnProperty(path)) {
                    var //control = self.controls[path],
                        //names = control.path, // path.split('.'),
                        names = path.split('.'),
                        node = response;
                    for (var i = 1; i < names.length; i++) {
                        node = node[names[i]];
                    }

                    // over-write anything that we had loaded from storage which has already been submitted
                    model[path] = {
                        value: node
                        // previous: node,
                        // dirty: false,
                        // time: now
                    };
                }
            }
        });
    },

    /*
     * @param {String} method - 'GET' or 'PATCH'
     * @param {Object=} body
     * @return {Promise}
     */
    _send: function(method, body) {
        //abortPending && this.abort();
        var request = document.createElement('iron-request'),
            contentType = this.contentType || 'application/json',
            options = {
                url: this.action,
                method: method,
                handleAs: 'json',
                headers: { 'accept': contentType },
                withCredentials: this.withCredentials
            };
        if (body) {
            options.body = body;
            options.headers['content-type'] = contentType;
        }

        return request.send(options);
    },

    /**
     * @param {Object<String, any}
     * @param {Boolean} submitted - any data which has been accepted by the server is marked as <code>submitted</code>
     */
    _loadLocalData: function(model, submitted, callback) {
        if (!this.useLocalStorage) {
            var self = this;
            var open /*: IDBOpenDBRequest*/ = indexedDB.open('auto-patch-form');
            open.onerror = function(e) {
                console.error('Error loading database:', e);
                callback(e);
            };

            open.onupgradeneeded = function(event) {
                var db = event.target.result;

                db.onerror = function(event) {
                    callback(event);
                };
console.info('upgrading indexedDB, creating table:', self.action);
                // Create an objectStore for this database
                var store = db.createObjectStore(self.action, { autoIncrement : true });

                store.createIndex('state', 'state', { unique: false });
                // store.createIndex('time', 'time', { unique: false });
            };

            open.onsuccess = function() {
                // store the result of opening the database in the db variable. This is used a lot later on, for opening transactions and suchlike.
                var db = open.result; // or event.target.result;
                db.onerror = function(event) {
                    console.error('Database error: ' + event.target.errorCode);
                };
                var query = db.transaction(self.action).objectStore(self.action).index('state').getAll(submitted ? IDBKeyRange.lowerBound(1) : 0);
                query.onerror = callback;
                query.onsuccess = function(e) {
                    // query.result is an array of {path: '$.json.path', submitted: 1, time: msSinceEpoch, value: any}
                    var i = query.result.length;
                    while (i--) {
                        var item = query.result[i];
                        model[item.path] = {
                            value: item.value
                        };
                    }

                    callback();
                };
            };
        } else {
            var formRecords = localStorage.getItem('auto-patch-form.' + this.action) || '[]';
            formRecords = JSON.parse(formRecords);
            var i = formRecords.length;
            while (i--) {
                var item = formRecords[i];
                if ((item.state != 0) == submitted) {
                    model[item.path] = {
                        value: item.value
                    };
                }
            }
            callback();
        }
    }
});