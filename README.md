# auto-patch-form

A form decorator which removes the need for a submit button - it sends pooled PATCH requests automatically.

<b>Note:</b> There's no point adding `method="patch"` as browsers will likely convert it to get or post.

The example below automatically sends a `GET` to the `action` URL in the form's `ready()` lifecycle event handler.
When the response is received it updates the `value` property of the elements with a `json-path` attribute.

When the user updates the form a `PATCH` is sent to the `action` URL for each field which has been updated.
The PATCH requests are debounced so that they can be pooled if necessary.

    <form is="auto-patch-form" get-when="ready" action="//api.example.com/auto-patch-form">
      <paper-input label="First name" json-path="$.user.first_name"></paper-input>
      <paper-input label="Last name" json-path="$.user.last_name"></paper-input>
    </form>

The system supports simple [`json-path`](http://goessner.net/articles/JsonPath/) expressions which start with `$.`
followed by one or more element names separated by dots.  The `json-path` expression describes the path to the value in the GET response. eg:

    {
        "user": {
            "first_name": "Test",
            "last_name": "User",
            "email": "test@example.com"
        },
        "note": "this field is ignored by the form"
    }

A [JSON API](http://jsonapi.org/) response would be requested by adding `content-type="application/vnd.api+json"' to the form and
served as:

    {
        "data": {
            "type": "user",
            "id": "12345678",
            "attributes": {
                "user": {
                    "first_name": "Test",
                    "last_name": "User",
                    "email": "test@example.com"
                },
                "note": "this field is ignored by the form"
            }
        }
    }

To allow the back-end to manage syncing of PATCH requests from multiple clients, the format differs from
 the REQUEST:

    {
        "$.user.first_name": {
            "value": "Updated",
            "time": 1463484440707
        },
        "$.user.last_name": {
            "value": "Name",
            "time": 1463484440907
        }
    }

The JSON API PATCH request has the equivalent content in the `attributes` field and echos the `type` and `id` of the GET
request, or defaults to `{ "type": "merge", "id": "self", ... }` if no GET request was issued.
