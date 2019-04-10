//Knex
var knex = require('./knexConfig');
exports.knex = knex;

const bcrypt = require('bcrypt-nodejs');

/* Users and Passwords */
exports.addUser = function (userAccount, userProfile, password, callback) {
  //hash password first
  hashPassword(password, function(err, hashedPassword) {
    if (err) { callback(err); }

    var addedUserAccount = null;
    var addedUserProfile = null;

    knex.transaction(function(trx) {
      return trx.insert(userAccount, '*').into('users')
        .then(function(userAccounts) {
          addedUserAccount = userAccounts[0];
          userProfile.user_id = addedUserAccount.id;

          return trx.insert(userProfile, '*').into('profiles')
          .then(function(userProfiles) {
            addedUserProfile = userProfiles[0];

            const userPassword = {
              user_id: addedUserAccount.id,
              password: hashedPassword
            };

            return trx.insert(userPassword).into('passwords')
            .then(function() {
              const streamInfo = {
                user_id: addedUserAccount.id,
                title: "@" + addedUserAccount.username + "'s Stream"
              };

              return trx.insert(streamInfo).into('stream_information')
              .then(function() {
                const emailListing = {
                  name: userProfile.name,
                  email: addedUserAccount.email
                };

                return trx.insert(emailListing).into('email_list');
              })
              .catch(function(err) {
                console.log(err);
              });
            })
            .catch(function(err) {
              console.log(err);
            });
          })
          .catch(function(err) {
            console.log(err);
          });
        });
    })
    .then(function() {
      callback(null, addedUserAccount, addedUserProfile);
    })
    .catch(function(err) {
      callback(err);
    });
  });
};

exports.updatePassword = function (userId, newPassword, callback) {
  //hash password first
  hashPassword(newPassword, function(err, hashedPassword) {
    if (err) { callback(err); }

    const userPassword = {
      user_id: userId,
      password: hashedPassword
    };

    knex('passwords').where({user_id: userId}).update(userPassword).asCallback(function(err) {
      callback(err);
    });
  });
};

//Password hashing
var hashPassword = exports.hashPassword = function(password, callback) {
  bcrypt.genSalt(10, function (err, salt) {
    if (err) { callback(err); }

    bcrypt.hash(password, salt, null, function (err, hash) {
      if (err) { callback(err); }

      callback(null, hash);
    });
  });
}

//Helper method for validating user's password.
exports.comparePassword = function (candidatePassword, dbPassword, cb) {
  bcrypt.compare(candidatePassword, dbPassword, (err, isMatch) => {
    cb(err, isMatch);
  });
};

/* Streams */
exports.addLiveStream = function (userAccount, userProfile, password, callback) {
  const liveStream = {user_id: userId}; //rest of live_stream values have defualt values/will be updated later

  knex.insert(liveStream).into('live_streams').asCallback(function(err) {
    callback(err);
  });
};
