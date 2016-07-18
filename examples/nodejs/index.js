var client = require('../../src/castmydata');

// Create new endpoint
var endpoint = new client.Endpoint('https://www.castmydata.com', 'testendpoint', {
    storage: 'memory'
});

// Start subscription
endpoint.subscribe();

// Handle records
endpoint.on('sync', function(records){
    console.log(records);
});

// Handle posts
endpoint.on('post', function(data){
    console.log('post', data);

    // Update the data
    endpoint.put(data.id, {
        done: true
    });
});

// Handle updates
endpoint.on('put', function(data){
    console.log('put', data);

    // Delete the data
    endpoint.delete(data.id);
});

// Handle deletes
endpoint.on('delete', function(data){
    console.log('delete', data);

    // Clear the db
    endpoint.clear();
});

// Handle broadcasts
endpoint.on('broadcast:some-channel', function(message){
    console.log(message);
});

// Handle clear
endpoint.on('clear', function(){
    console.log('cleared!');
});

// Broadcast some data
endpoint.broadcast('some-channel', 'hey there!');

// Create some data
endpoint.post({
    title: 'Buy Milk',
    done: false
});
