var client = require('../../src/castmydata');

// Create new endpoint
var endpoint = new client.Endpoint('https://www.castmydata.com', 'testendpoint');

// Start subscription
endpoint.subscribe();

// Handle records
endpoint.on('records', function(records){
    console.log(records);
});

// Handle posts
endpoint.on('post', function(data){
    console.log(data);
});

// Handle updates
endpoint.on('put', function(data){
    console.log(data);
});

// Handle deletes
endpoint.on('delete', function(data){
    console.log(data);
});

// Handle broadcasts
endpoint.on('broadcast', function(message){
    console.log(message);
});

// Broadcast some data
endpoint.broadcast('hey there!');

// Create some data
endpoint.post({
    id: 1,
    title: 'Buy Milk',
    done: false
});

// Update the data with id 1
endpoint.put(1, {
    done: true
});

// Delete the data with id 1
endpoint.delete(1);
