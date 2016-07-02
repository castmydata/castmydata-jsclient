
var endpoint = new CastMyData.Endpoint('https://www.castmydata.com', 'testendpoint');
endpoint
    .subscribe()
    .listen('some-channel');

// Example 1: Broadcasting

endpoint.on('broadcast:some-channel', function(message){
    $('#received').text(message);
});

function broadcast() {
    var messageEl = $('#message');
    endpoint.broadcast('some-channel', messageEl.val());
    messageEl.val('');
    return false;
}

// Example 2: Realtime Database

var editForm = $('#editForm').hide();
var todoForm = $('#todoForm');
var todoTemplate = $('.todo-template').remove();
var editNameEl = $('#editName');
var edittingTodo;

function startEditing(model) {
    edittingTodo = model;
    editForm.show();
    todoForm.hide();
    editNameEl.val(model.name);
}

function cancelEdit() {
    edittingTodo = undefined;
    editForm.hide();
    todoForm.show();
}

function saveEdittingTodo() {
    edittingTodo.put({
        name: editNameEl.val()
    });
    editNameEl.val('');
    cancelEdit();
    return false;
}

function saveTodo() {
    var nameEl = $('#name');
    endpoint.post({
        name: nameEl.val()
    });
    nameEl.val('');
    return false;
}

function createNewTodo(model) {
    var newTodo = todoTemplate.clone();
    var nameEl = $('.name', newTodo)
        .text(model.name);
    $('.delete-btn', newTodo).click(function(){
        model.delete();
    });
    $('.edit-btn', newTodo).click(function(){
        startEditing(model);
    });
    newTodo.attr('id', model.id);
    $('#todo-forms').before(newTodo);
}

function clearDb() {
    endpoint.clear();
}

var query = endpoint.where(function(model){
    return model.meta.deletedAt == null;
});

query.on('sync post put delete clear merge', function(){
    $('.todo-item').remove();
    query.models.forEach(createNewTodo);
});
