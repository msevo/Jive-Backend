const db = require('../dbConfig/dbAPI');
var socketIo;
var userNamespaces = [];

function initNamespace(id) {
    var userNamespace = socketIo.of('/user/'+id);
    userNamespace.on('connection', function(socket){
      //console.log('Client connected to room ' + id);

      socket.on('message', function(msg) {
          //console.log('[server](message): %s', JSON.stringify(msg));
          userNamespace.emit('message', msg);
      });

      socket.on('disconnect', () => {
          //console.log('Client disconnected from room ' + id);
      });
    });

    return userNamespace;
}

exports.chatInit = (io) => {
  socketIo = io;

  //Query all users and initiate a socket.io namespace for all of them
  db.knex.select('id').from('users').asCallback(function(err, users) {
    if (err) {
      console.log("Error querying all users: " + err);
    } else {
      //successfully queried all usernames
      users.forEach(function(userElement) {
        userNamespaces.push(initNamespace(userElement.id));
      });
    }
  });
}

exports.addNamespace = (id) => {
  userNamespaces.push(initNamespace(id));
}

exports.saveChat = (req, res, next) => {
  const userId = req.params.userId;
  const sentTo = req.params.sentTo;
  const chatMessage = req.body.chatMessage;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  const chat_message = {
    user_id: userId,
    sent_to: sentTo,
    message: chatMessage
  };

  db.knex.transaction(function(trx) {
    return trx.insert(chat_message, 'chat_id').into('chat_messages');
  })
  .then(function(chatId) {
    return res.json({
      chatId: chatId
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to save chat message.': [err]}});
  });
};

exports.getRecentChat = (req, res, next) => {
  const sentTo = req.params.sentTo;
  if (!sentTo || sentTo === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }


  db.knex.transaction(function(trx) {
    return trx.from('chat_messages as chat').innerJoin('profiles as profile', 'chat.user_id', 'profile.user_id')
    .whereRaw("chat.sent_at >= now() - ('30 MINUTES'::INTERVAL)")
    .andWhere("sent_to", sentTo)
    .orderBy('chat.sent_at')
    .then(function(chatMessages) {
        return res.json({
          chatMessages: chatMessages
        });
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get recent chat messages.': [err]}});
  });
}

exports.incrementChat = (req, res, next) => {
  var userId = req.params.userId;
  var chatId = req.params.chatId;
  var sentTo = req.params.sentTo;
  if (!userId || userId === null || !chatId || chatId === null || !sentTo || sentTo === null) {
    return res.status(401).json({ errors: {'Chat Id': ['is required.']}});
  }
  db.knex.transaction(function(trx) {
    return trx.from('chat_messages').where({user_id: userId, chat_id: chatId, sent_to: sentTo}).increment('votes', 1);
  })
  .then(function() {
    return res.json({
      result: "success"
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to update chat rating.': [err]}});
  });
};

exports.decrementChat = (req, res, next) => {
  var userId = req.params.userId;
  var chatId = req.params.chatId;
  var sentTo = req.params.sentTo;
  if (!userId || userId === null || !chatId || chatId === null || !sentTo || sentTo === null) {
    return res.status(401).json({ errors: {'Chat Id': ['is required.']}});
  }
  db.knex.transaction(function(trx) {
    return trx.from('chat_messages').where({user_id: userId, chat_id: chatId, sent_to: sentTo}).decrement('votes', 1);
  })
  .then(function() {
    return res.json({
      result: "success"
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to update chat rating.': [err]}});
  });
};
