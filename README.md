# smart-form

A form which does not require a submit button - it sends a PATCH automatically, 
which can be pooled and batched by a [Service Worker](http://www.html5rocks.com/en/tutorials/service-worker/introduction/).

The form supports undo/redo and smart merging on the server of multiple requests, potentially submitted by different clients.


Ideally, we would save all updates to [IndexDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), 
but that currently [doesn't have very good support in IE and Safari](http://caniuse.com/#search=indexdb).
We will therefore have to fall back to [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
...maybe it should use a shim such as [localForage](https://github.com/mozilla/localForage)...