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

        /** (iron-form provides this)
         * HTTP request headers to send
         *
         * Note: setting a `Content-Type` header here will override the value
         * specified by the `contentType` property of this element.
         * /
        headers: {
            type: Object,
            value: function() {
                return {};
            }
        },*/

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

    /**
     * Fired once the form has loaded its initial local and/or remote data
     * @event auto-patch-form-read
     */
    /**
     * Fired if the form cannot be submitted because it's invalid.
     * @event iron-form-invalid
     */
    /**
     * Fired after the form is submitted.
     * @event iron-form-submit
     */
    /** Fired after the form is submitted and a response is received.
     * @event iron-form-response
     */
    /**
     * Fired after the form is submitted and an error is received.
     * @event iron-form-error
     */

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

    listeners: {
        // doesn't work, need to listen to each individually: 'change': '_onChange'
        'iron-form-element-unregister': '_unregisterElement'
    },

    /** called once by `ready()` */
    _locateControls: function() {
        var elements = this.querySelectorAll('[json-path]');
        this.controls = {};
        for (var i = elements.length; i-- > 0; ) {
            var element = elements[i];
            this._registerElement(element);
        }
        // now that we've done the initial query, listen for new elements
        this.listen(this, 'iron-form-element-register', '_registerElement');
    },

    _registerElement: function(e) {
        e = e.target || e;      // e is now the element
        e._parentForm = this;
        var path = e.getAttribute('json-path');
        if (path && !this.controls[path]) {
            this.controls[path] = e; //{control: control, path: path.split('.')};
            this.listen(e, 'change', '_onChange');        // or value-changed?
        }
    },

    _unregisterElement: function(e) {
        var target = e.detail.target;
        if (target) {
            var path = target.getAttribute('json-path');
            if (this.controls[path]) {
                delete this.controls[path];
                this.unlisten(target, 'change', '_onChange');
            }
        }
    },

    _onChange: function(e) {
        var el = e.target;
        if (/*!this.noValidate &&*/ !this.validate(el)) {
            // In order to trigger the native browser invalid-form UI, we need
            // to do perform a fake form submit.
            //if (!this.disableNativeValidationUi) {
                this._doFakeSubmitForValidation();
            //}
            this.fire('iron-form-invalid', el);
            return;
        }

        var path = el.getAttribute('json-path'),
            value = ((el.type == 'checkbox' || el.type == 'radio' ||
                    el.getAttribute('role') == 'checkbox' || el.getAttribute('role') == 'radio')) ? el.checked : el.value;
            // value = el.value; // serialize();

        this._activityLog.push({
            time: new Date().getTime(),
            path: path,
            value: value,
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

        if (this.validate()) {
            this.patchPending = true;
            this.debounce('autoPatch', this._autoPatch /*.bind(this)*/, this.debounceMs);
        }
    },

    /**
     * @param {HTMLElement=} el - if not provided, validate the whole form
     */
    validate: function(el) {
        var valid = true;
        if (!el) {
            for (var path in this.controls) {
                valid &= this.validate(this.controls[path]);
            }
        } else {
            if (el.required && !el.disabled) {
                if (el.validate) {
                    valid &= el.validate();
                }
            } else if (el.willValidate && el.checkValidity) {
                valid &= el.checkValidity();
            }
        }
        return valid;
    },

    _autoPatch: function() {
        var body = {},
            len = this._activityLog.length,
            self = this;
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
            //console.info('PATCH response:', response.status, response.response);
            // update the state of each _activityLog item to 3: ACCEPTED
            var i = submittedRecords.length;
            while (i-- != 0) {
                submittedRecords[i].state = 3;
            }
            self.patchPending = false;
            self.fire('iron-form-response', response);
        }, function(err) {
            self.fire('iron-form-error', err);
            var i = submittedRecords.length;
            while (i-- != 0) {
                submittedRecords[i].state = 0;      // reset to PENDING
            }
        });
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
            //var now = new Date().getTime();
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
     * @param {Object=} body - only required for PATCH
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

        var p = request.send(options);
        if (body) {
            this.fire('iron-form-submit', body);
        }
        return p;
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
    },
    
    // borrowed directly from iron-form
    _doFakeSubmitForValidation: function() {
        var fakeSubmit = document.createElement('input');
        fakeSubmit.setAttribute('type', 'submit');
        fakeSubmit.style.display = 'none';
        this.appendChild(fakeSubmit);

        fakeSubmit.click();

        this.removeChild(fakeSubmit);
    }
});