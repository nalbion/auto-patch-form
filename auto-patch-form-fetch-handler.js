self.smartFormFetchHandler = function(request) {
    console.info('smartFormFetchHandler:', request);
    return new Response('', {
        status: 203,
        statusText: 'Via customFetchHandler'
    });
};