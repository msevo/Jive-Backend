const passport = require('passport');
const webpush = require('web-push');
const { Client } = require('pg');
const request = require('request');
var parseString = require('xml2js').parseString;
var moment = require('moment');
const async = require('async');

const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');

var config = require('../config/environment');

// multer required for the file uploads
var multer = require('multer');

// set the directory for the uploads to the uploaded to
var DIR = './uploads/';
//define the type of upload multer would be doing and pass in its destination, in our case, its a single file with the name photo
var upload = multer({ dest: DIR }).single('image');

const db = require('../dbConfig/dbAPI');
const passwordApi = require('./passwordApi');
const dataStorage = require('./dataStorage');
const chatController = require('./chat');
const paymentApi = require('./payment');

webpush.setVapidDetails(
  'mailto:https://jive.live',
  config.env.applicationServerPublicKey,
  config.env.applicationServerPrivateKey
);

/**
 * POST /api/login
 * Sign in using email and password.
 */
exports.login = (req, res, next) => {
  req.assert('email', 'Email is not valid').isEmail();
  req.assert('password', 'Password cannot be blank').notEmpty();

  const errors = req.validationErrors();

  if (errors) {
    console.log(errors);
    return res.status(401).json({errors:{'email or password': ["is invalid"]}});
  }

  passport.authenticate('local', (err, userAccount, info) => {
    const error = err || info;
    if (error || userAccount.fb_user) { //Cannot login w/ password if FB user
      if (error) {
        console.log(error);
      }
      return res.status(401).json({errors:{'email or password': ["is invalid"]}});
    }
    if (!userAccount) {
      console.log("User not found");
      return res.status(401).json({ errors: {'message': ['Something went wrong, please try again.']}});
    }

    db.knex.first().from('profiles').where({user_id: userAccount.id}).asCallback(function(err, userProfile) {
      if(err){
        return done(err);
      }
      if (!userProfile) {
        console.log("User not found");
        return res.status(401).json({ errors: {'message': ['Something went wrong, please try again.']}});
      }

      res.json({
        userAccount: userAccount,
        userProfile: userProfile
      });
    });
  })(req, res, next);
};

/**
 * POST /register
 * Create a new user account.
 */
exports.register = (req, res, next) => {
  req.assert('email', 'Email is not valid').isEmail();
  req.assert('password', 'Password must be at least 6 characters long').len(6);
  req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

  const errors = req.validationErrors();

  if (errors) {
    console.log(errors);
    return res.status(401).json({errors:{'email or password': ["is invalid"]}});
  }

  const newUserAccount = {
    username: req.body.username,
    email: req.body.email,
    fb_user: req.body.fbUser
  };

  const newUserProfile = {
    username: req.body.username,
    name: req.body.name
  };

  //new DB code
  db.knex.select('email', 'username').from('users').where({email: req.body.email}).orWhere({username: req.body.username}).first().asCallback(function(err, user) {
    if (err) {
      return res.status(401).json(err);
    }
    if (user && user.email == req.body.email) {
      return res.status(401).json({ errors: {'User': [' with this email already exists.']}});
    } else if (user && user.username == req.body.username) {
      return res.status(401).json({ errors: {'Username': [' taken.']}});
    }

    db.addUser(newUserAccount, newUserProfile, req.body.password, function(err, addedUserAccount, addedUserProfile) {
      if (err) {
        return res.status(401).json({ errors: {'message': ['Something went wrong, please try again.']}});
      }

      //make chat room for user:
      chatController.addNamespace(addedUserAccount.id);

      return res.json({
        userAccount: addedUserAccount,
        userProfile: addedUserProfile
      });
    });
  });
};

/**
 * GET /user
 * Get current user details
 */
exports.getCurrentUser = (req, res, next) => {
  if (!req.userAccount || !req.userProfile) {
    console.log(err);
    return res.status(401).json({ errors: {'Token': ['invalid']}});
  }
  return res.json({
    userAccount: req.userAccount,
    userProfile: req.userProfile
  });
};

/**
 * GET /user
 * Get user details
 */
exports.getUserAccount = (req, res, next) => {
  const {username} = req.params;

  if (!username || username === null) {
    return res.status(401).json({ errors: {'Username': ['is required.']}});
  }

  db.knex.first().from('users').where({username: username}).asCallback(function(err, userAccount) {
    if(err){
      console.log(err);
      return res.status(401).json({ errors: {'Username': [err]}});
    }
    if (!userAccount) {
      console.log("user does not exist");
      return res.status(401).json({ errors: {'Username': ['does not exist.']}});
    }

    return res.json({
      userAccount: userAccount
    });
  });
};

exports.getUserProfile = (req, res, next) => {
  const {username} = req.params;

  if (!username || username === null) {
    return res.status(401).json({ errors: {'Username': ['is required.']}});
  }

  db.knex.first().from('profiles').where({username: username}).asCallback(function(err, userProfile) {
    if(err){
      console.log(err);
      return res.status(401).json({ errors: {'Username': [err]}});
    }
    if (!userProfile) {
      console.log("user does not exist");
      return res.status(401).json({ errors: {'Username': ['does not exist.']}});
    }

    return res.json({
      userProfile: userProfile
    });
  });
};

/*
  GET /user/exists
  Checks for user
*/
exports.checkForUser = (req, res, next) => {
  const uname = req.body.username;

  if(!uname || uname === null){
    return res.status(401).json({ errors: {'Username': ['is required.']}});
  }

  db.knex.select('username').from('users').where({username: uname}).first().asCallback(function(err, user) {
    if(err){
        return res.status(401).json({ errors: {'Username': ['does not exist.']}});
    }
    if (!user) {
      console.log("user does not exist");
      return res.status(401).json({ errors: {'Username': ['does not exist.']}});
    }

    return res.json({ result:true });
  });
}

/*
  GET /userByEmail
  Returns user based on their email address
*/
exports.getUserByEmail = (req, res, next) => {
  const {email} = req.params;

  if(!email || email === null){
    return res.status(401).json({ errors: {'Email': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.first().from('users').where({email: email})
      .then(function(user) {
        if (user) {
          const userId = user.id;

          return trx.first().from('profiles').where({user_id: userId})
            .then(function(profile) {
              return res.json({
                userAccount: user,
                userProfile: profile
              });
          });
        } else {
          return res.json({
            userAccount: null,
            userProfile: null
          });
        }
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get user by email.': [err]}});
  });
}

/**
 * PUT /user
 * update user details
 */
exports.updateUser = (req, res, next) => {
  const {userId} = req.params;
  const updatedUserAccount = req.body.userAccount;
  const updatedUserProfile = req.body.userProfile;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.select('email', 'username').from('users')
  .whereNot({id: userId})
  .where(function() {
    this.where({email: updatedUserAccount.email}).orWhere({username: updatedUserAccount.username})
  })
  .first()
  .asCallback(function(err, userAccount) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Token': ['invalid']}});
    }

    if (userAccount && updatedUserAccount.username == userAccount.username) {
      return res.status(401).json({ errors: {'User': ['with same username already exists.']}});
    } else if (userAccount && updatedUserAccount.email == userAccount.email) {
      return res.status(401).json({ errors: {'User': ['with same email already exists.']}});
    } else {
      db.knex.transaction(function(trx) {
        return trx.where({id: userId}).update(updatedUserAccount).into('users')
          .then(function() {
            return trx.where({user_id: userId}).update(updatedUserProfile).into('profiles');
          });
      })
      .then(function() {
        return res.json({
          userAccount: updatedUserAccount,
          userProfile: updatedUserProfile
        });
      })
      .catch(function(err) {
        console.error(err);
        return res.status(401).json({ errors: {'User Id': [err]}});
      });
    }
  });
};

/* Followers */
exports.follow = (req, res, next) => {
  const {userId} = req.params;
  const followsId = req.body.followsId;
  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  const follower = {
    user_id: userId,
    follows_id: followsId
  };

  db.knex.insert(follower).into('followers').asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to follow user.': [err]}});
    }
    return res.json({
      result: "Now following user."
    });
  });
};

exports.unfollow = (req, res, next) => {
  const {userId} = req.params;
  const followsId = req.body.followsId;
  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex('followers').where({user_id: userId, follows_id: followsId}).del().asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to unfollow user.': [err]}});
    }
    return res.json({
      result: "Unfollowed user."
    });
  });
};

exports.follows = (req, res, next) => {
  const userId = req.params.userId;
  const followsId = req.params.followsId;
  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.first().from('followers').where({user_id: userId, follows_id: followsId}).asCallback(function(err, followRelation) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to check if following.': [err]}});
    }
    if (followRelation) {
      return res.json({
        result: true
      });
    }
    return res.json({
      result: false
    });
  });
};

exports.getFollowers = (req, res, next) => {
  const {userId} = req.params;
  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('user_id').from('followers')
    .where({follows_id: userId})
      .then(function(followers) {
        var returnedFollowerUserIds = followers.map(values => values.user_id);

        return trx.select().from('profiles')
        .whereIn('user_id', returnedFollowerUserIds)
          .then(function(userProfiles) {
            return res.json({
              profiles: userProfiles
            });
        });
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get followers.': [err]}});
  });
};

exports.getFollowing = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('follows_id').from('followers')
    .where({user_id: userId})
      .then(function(following) {
        var returnedFollowingUserIds = following.map(values => values.follows_id);

        return trx.select().from('profiles')
        .whereIn('user_id', returnedFollowingUserIds)
          .then(function(userProfiles) {
            return res.json({
              profiles: userProfiles
            });
        });
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get followers.': [err]}});
  });
};

/* Streams */
exports.startLiveStream = (req, res, next) => {
  const streamKey = req.body.key;
  if (!streamKey || streamKey === null) {
    return res.status(401).json({ errors: {'Stream key': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('id', 'username').first().from('users').where({stream_key: streamKey})
    .then(function(user) {
      const userId = user.id;
      const username = user.username;
      if (userId) {
        return trx.where({user_id: userId}).update({currently_live: 't', has_streamed: 't'}).into('profiles')
        .then(function() {
          //rest of live_stream values have defualt values or will be updated later
          const newLiveStream = {
            user_id: userId,
            thumbnail: "http://18.144.41.175:8086/thumbnail?application=live&streamname=" + streamKey + "&size=1280x720"
          };

          return trx.insert(newLiveStream).into('live_streams')
          .then(function() {
            //Trigger push notifications to all that follow streamer and have notifications enabled
            return trx.select('user_id').from('followers').where({follows_id: userId})
            .then(function(followers) {
              var returnedFollowerUserIds = followers.map(values => values.user_id);
              return trx.select('notification_subscription').from('profiles')
              .whereIn('user_id', returnedFollowerUserIds)
              .whereNotNull('notification_subscription')
              .then(function(subscriptions) {
                for (var i = 0; i < subscriptions.length; i++) {
                  var notificationTitle = "@" + username + " is live on Jive!";
                  var notificationUrl = "https://jive.live/" + username;

                  const pushMsg = JSON.stringify({
                    notification: {
                      title: notificationTitle,
                      icon: "https://s3-us-west-1.amazonaws.com/jive-user-photos/jive_essentials/jive_icon1.png",
                      data: {
                        url: notificationUrl
                      }
                    }
                  });
                  triggerPushMsg(subscriptions[i].notification_subscription, pushMsg)
                }
              });
            });
          });
        });
      }
    });
  })
  .then(function() {
    return res.json({
      result: "Live stream added."
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to add live stream.': [err]}});
  });
};

exports.stopLiveStream = (req, res, next) => {
  const streamKey = req.body.key;
  if (!streamKey || streamKey === null) {
    return res.status(401).json({ errors: {'Stream key': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('id').first().from('users').where({stream_key: streamKey})
    .then(function(user) {
      const userId = user.id;
      if (userId) {
        return trx.where({user_id: userId}).update('currently_live', 'f').into('profiles')
        .then(function() {
          return trx('live_streams').where({user_id: userId}).del();
        });
      }
    });
  })
  .then(function() {
    return res.json({
      result: "Live stream stopped."
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to stop live stream.': [err]}});
  });
};

exports.updateLiveStream = (req, res, next) => {
  //Will be updating current and total viewer counts here
  /*const {userId} = req.params;
  const liveStream = req.body.liveStream;

  db.knex('live_streams').where({user_id: userId}).update(liveStream).asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to update live stream': [err]}});
    }
    return res.json({
      result: "Live stream updated."
    });
  });*/
};

exports.getLiveStream = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.first().from('live_streams').where({user_id: userId}).asCallback(function(err, liveStream) {
    if(err){
      console.log(err);
      return res.status(401).json({ errors: {'Failed to get live stream': [err]}});
    }
    if (!liveStream) {
      return res.json({
        liveStream: null
      });
    }

    return res.json({
      liveStream: liveStream
    });
  });
};

exports.getArchivedStream = (req, res, next) => {
  const username = req.params.username;
  const streamId = req.params.streamId;

  if (!username || username === null || !streamId || streamId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('id').first().from('users').where({username: username})
    .then(function(user) {
      const userId = user.id;
      if (userId) {
        return trx.first().from('archived_streams').where({user_id: userId, stream_id: streamId})
        .then(function(archivedStream) {
          return res.json({
            archivedStream: archivedStream
          });
        });
      }
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get archived stream.': [err]}});
  });
};

exports.getArchivedStreams = (req, res, next) => {
  const {username} = req.params;

  if (!username || username === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('id').first().from('users').where({username: username})
    .then(function(user) {
      const userId = user.id;
      if (userId) {
        return trx.select().from('archived_streams').where({user_id: userId}).orderBy('start_timestamp', 'desc')
        .then(function(archivedStreams) {
          return res.json({
            archivedStreams: archivedStreams
          });
        });
      }
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get archived streams.': [err]}});
  });
};

exports.deleteArchivedStream = (req, res, next) => {
  const userId = req.params.userId;
  const streamId = req.params.streamId;

  if (!userId || userId === null || !streamId || streamId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex('archived_streams').where({user_id: userId, stream_id: streamId}).del().asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to delete stream.': [err]}});
    }
    return res.json({
      result: "Stream deleted."
    });
  });
};

exports.updateArchivedStream = (req, res, next) => {
  const archivedStream = req.body.archivedStream;

  if (!archivedStream || archivedStream === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex('archived_streams').where({user_id: archivedStream.user_id, stream_id: archivedStream.stream_id}).update(archivedStream).asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to update stream.': [err]}});
    }
    return res.json({
      result: "Stream updated."
    });
  });
};

exports.updateStreamInfo = (req, res, next) => {
  const streamInfo = req.body.streamInfo;

  if (!streamInfo.user_id || streamInfo.user_id === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex('stream_information').where({user_id: streamInfo.user_id}).update(streamInfo).asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to update stream info': [err]}});
    }
    return res.json({
      result: "Stream information updated."
    });
  });
};

exports.increaseTotalViews = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex('stream_information').where({user_id: userId}).increment('total_views', 1).asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to update total view count.': [err]}});
    }
    return res.json({
      result: "Total view count updated."
    });
  });
};

exports.getStreamInfo = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.first().from('stream_information').where({user_id: userId}).asCallback(function(err, streamInfo) {
    if(err){
      console.log(err);
      return res.status(401).json({ errors: {'Failed to get stream info': [err]}});
    }
    if (!streamInfo) {
      console.log("Stream info does not exist.");
      return res.status(401).json({ errors: {'Stream info': ['does not exist.']}});
    }

    return res.json({
      streamInfo: streamInfo
    });
  });
};

exports.getStreamKey = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.select('stream_key').first().from('users').where({id: userId}).asCallback(function(err, streamKey) {
    if(err){
      console.log(err);
      return res.status(401).json({ errors: {'Failed to get stream info': [err]}});
    }
    if (!streamKey) {
      console.log("Stream key does not exist.");
      return res.status(401).json({ errors: {'Stream key': ['does not exist.']}});
    }

    return res.json({
      streamKey: streamKey.stream_key
    });
  });
}

/*exports.storeLiveStream = (req, res, next) => {
  const stream_key = req.body.stream_key;
  const video_path = req.body.video_path;
  const start_timestamp = req.body.start_timestamp;
  const duration_seconds = req.body.duration_seconds;

  if (!streamKey || streamKey === null) {
    return res.status(401).json({ errors: {'Stream key': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('user_id').from('users').where({stream_key: stream_key})
      .then(function(following) {
        var followingIds = following.map(values => values.follows_id);
        return trx.select().from('profiles').whereIn('user_id', followingIds).andWhere({currently_live: 't'})
        .then(function(profiles) {
          var followingLiveIds = profiles.map(values => values.user_id);

          return res.json({
            profiles: profiles,
            liveStreams: liveStreamArray
          });
        });
      });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get profiles/streams.': [err]}});
  });

}*/

exports.saveArchivedStream = (req, res, next) => {
  const archivedStreamInfo = req.body.streamName.split('_');
  if (!archivedStreamInfo || archivedStreamInfo === null || archivedStreamInfo.length < 3) {
    return res.status(401).json({ errors: {'Stream name': ['is required.']}});
  }

  var streamKey = archivedStreamInfo[0] + "_" + archivedStreamInfo[1];
  var startTimestampFormatted = moment(archivedStreamInfo[2], "YYYY-MM-DD-HH.mm.ss.SSS").format("YYYY-MM-DD HH:mm:ss.SSS");
  var startTimestampUnformatted = moment(archivedStreamInfo[2], "YYYY-MM-DD-HH.mm.ss.SSS");
  var durationInSeconds = moment().utc().diff(startTimestampUnformatted, "seconds");

  var thumbnail = "thumbnails/" + req.body.streamName.replace(/\.\w+$/, ".jpg");

  db.knex.transaction(function(trx) {
    return trx.select('id').first().from('users').where({stream_key: streamKey})
    .then(function(user) {
      const userId = user.id;
      if (userId) {
        return trx.first().from('stream_information').where({user_id: userId})
        .then(function(streamInfo) {
          const archivedStream = {
            user_id: userId,
            stream_file_name: req.body.streamName,
            thumbnail: thumbnail,
            start_timestamp: startTimestampFormatted,
            total_views: streamInfo.total_views,
            duration_seconds: durationInSeconds,
            title: streamInfo.title,
            description: streamInfo.description,
            tags: streamInfo.tags
          }
          return trx.insert(archivedStream).into('archived_streams').then(function() {
            return trx.where({user_id: userId}).update('total_views', 0).into('stream_information');
          });
        });
      }
    });
  })
  .then(function() {
    return res.json({
      result: "Live stream saved."
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to save live stream.': [err]}});
  });
};

//this gets only the streams of those a user is following
/*exports.getFeed = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.select('follows_id').from('followers').where({user_id: userId})
      .then(function(following) {
        var followingIds = following.map(values => values.follows_id);
        return trx.select().from('profiles').whereIn('user_id', followingIds).andWhere({currently_live: 't'})
        .then(function(profiles) {
          var followingLiveIds = profiles.map(values => values.user_id);
          return trx.select().from('live_streams').whereIn('user_id', followingLiveIds)
          .then(function(liveStreams) {
            return trx.select().from('stream_information').whereIn('user_id', followingLiveIds)
            .then(function(streamInfo) {
              var liveStreamArray = [];
              for (var i = 0; i < liveStreams.length; i++) {
                liveStreams[i].username = profiles[i].username;
                liveStreams[i].profile_pic = profiles[i].profile_pic;
                liveStreamArray.push(Object.assign({}, liveStreams[i], streamInfo[i]));
              }
              return res.json({
                profiles: profiles,
                liveStreams: liveStreamArray
              });
            });
          });
        });
      });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get profiles/streams.': [err]}});
  });
}*/

exports.getFeed = (req, res, next) => {
  db.knex.transaction(function(trx) {
    return trx.select().from('profiles').where({currently_live: 't'}).orderBy('user_id', 'desc')
    .then(function(profiles) {
      var liveUserIds = profiles.map(values => values.user_id);
      return trx.select().from('live_streams').whereIn('user_id', liveUserIds).orderBy('user_id', 'desc')
      .then(function(liveStreams) {
        return trx.select().from('stream_information').whereIn('user_id', liveUserIds).orderBy('user_id', 'desc')
        .then(function(streamInfo) {
          var liveStreamArray = [];
          for (var i = 0; i < liveStreams.length; i++) {
            liveStreams[i].username = profiles[i].username;
            liveStreams[i].profile_pic = profiles[i].profile_pic;
            liveStreamArray.push(Object.assign({}, liveStreams[i], streamInfo[i]));
          }
          return res.json({
            liveStreams: liveStreamArray
          });
        });
      });
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get profiles/streams.': [err]}});
  });
}


exports.getFeaturedStreams = (req, res, next) => {
  db.knex.transaction(function(trx) {
    return trx.select().from('profiles').where({currently_live: 't'}).orderBy('user_id', 'desc')
    .then(function(profiles) {
      var liveUserIds = profiles.map(values => values.user_id);
      return trx.select().from('live_streams').whereIn('user_id', liveUserIds).orderBy('start_timestamp', 'desc').limit(13)
      .then(function(liveStreams) {
        return trx.select().from('stream_information').whereIn('user_id', liveUserIds).orderBy('user_id', 'desc')
          .then(function(streamInfo) {
            var newLimit = 13 -liveStreams.length;
            return trx.select('user_id', 'start_timestamp', 'thumbnail', 'title', 'description', 'tags', 'stream_file_name', 'stream_id').from('archived_streams').whereRaw('start_timestamp = (SELECT MAX(start_timestamp) FROM archived_streams a WHERE archived_streams.user_id = a.user_id)').orderBy('start_timestamp', 'desc').limit(newLimit)
              .then(function(archivedArray) {
                var archivedStramIds = archivedArray.map(values => values.stream_id);
                var finalLimit = 13 - liveStreams.length - archivedArray.length;
                return trx.select('user_id', 'start_timestamp', 'thumbnail', 'title', 'description', 'tags', 'stream_file_name', 'stream_id').from('archived_streams').whereNotIn('stream_id', archivedStramIds).orderBy('start_timestamp', 'desc').limit(finalLimit)
                .then(function(archivedArrayComplete) {
                  var archivedUserIds = archivedArray.map(values => values.user_id);
                  return trx.select('user_id', 'username', 'profile_pic').from('profiles').whereIn('user_id', archivedUserIds)
                    .then(function(archivedProfiles) {
                      var liveStreamArray = [];
                      for (var i = 0; i < liveStreams.length; i++) {
                        var j = 0
                        while(liveStreams[i].user_id != profiles[j].user_id) {
                          j++;
                        }
                        liveStreams[i].username = profiles[j].username;
                        liveStreams[i].profile_pic = profiles[j].profile_pic;
                        liveStreams[i].isLive = true;
                        liveStreamArray.push(Object.assign({}, liveStreams[i], streamInfo[j]));
                      }
                      var completeArchived = archivedArray.concat(archivedArrayComplete);
                      for(var i = 0; i < completeArchived.length; i++) {
                        completeArchived[i].isLive = false;
                        var j = 0;
                        while(completeArchived[i].user_id != archivedProfiles[j].user_id) {
                          j++;
                        }
                        liveStreamArray.push(Object.assign({}, completeArchived[i], archivedProfiles[j]));
                      }
                return res.json({
                  allStreams: liveStreamArray
                });
              });
            });
          });
        });
      });
    });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get profiles/streams.': [err]}});
  });
}

exports.search = (req, res, next) => {
  const searchText = req.params.searchText;
  db.knex.transaction(function(trx) {
    return trx.select().from('profiles')
    .where(db.knex.raw("name ~* '(\\m" + searchText + ")'"))
    .orWhere(db.knex.raw("username ~* '(\\m" + searchText + ")'"))
      .then(function(profiles) {
        var returnedProfilesUserIds = profiles.map(values => values.user_id);
        return trx.select().from('stream_information')
        .where(db.knex.raw("title ~* '(\\m" + searchText + ")'"))
        .orWhere(db.knex.raw("tags ~* '(\\m" + searchText + ")'"))
        .orWhereIn('user_id', returnedProfilesUserIds)
        .orderBy('user_id', 'desc')
          .then(function(streamInfo) {
            var returnedStreamsUserIds = streamInfo.map(values => values.user_id);
            return trx.select().from('live_streams')
            .whereIn('user_id', returnedStreamsUserIds)
            .orderBy('user_id', 'desc')
              .then(function(liveStreams) {
                return trx.select().from('profiles')
                .whereIn('user_id', returnedStreamsUserIds)
                .andWhere({currently_live: 't'})
                .orderBy('user_id', 'desc')
                  .then(function(profiles2) {
                    //this last query calls profiles again to get those associated w/ streams that were found
                    var liveStreamArray = [];
                    for (var i = 0; i < liveStreams.length; i++) {
                      liveStreams[i].username = profiles2[i].username;
                      liveStreams[i].profile_pic = profiles2[i].profile_pic;
                      liveStreamArray.push(Object.assign({}, liveStreams[i], streamInfo[i]));
                    }
                    return res.json({
                      profiles: profiles,
                      liveStreams: liveStreamArray
                    });
                });
              });
          });
      });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get profiles/streams.': [err]}});
  });
}

Array.prototype.unique = function() {
    var a = this.concat();
    for(var i=0; i<a.length; ++i) {
        for(var j=i+1; j<a.length; ++j) {
            if(a[i] === a[j])
                a.splice(j--, 1);
        }
    }

    return a;
};

exports.updatePassword = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.first().from('passwords').where({user_id: userId}).asCallback(function(err, userPassword) {
    if (err) {
      return res.status(401).json({ errors: {'Failed to update password': [err]}});
    }

    db.comparePassword(req.body.oldPassword, userPassword.password.toString(), (err, isMatch) => {
      if (err) {
        return res.status(401).json({ errors: {'Failed to update password': [err]}});
      }
      if (isMatch) {
        db.updatePassword(userId, req.body.newPassword, function(err) {
          if (err) {
            return res.status(401).json({ errors: {'Failed to update password': [err]}});
          }

          return res.json({
            result: "success"
          });
        });
      } else {
        return res.status(401).json({ errors: {'Old password': ['incorrect.']}});
      }
    });
  });
}

exports.getRandomStream = (req, res, next) => {
    db.knex.first().from('profiles').where({currently_live: 't'}).orderBy(db.knex.raw('RANDOM()'))
    .asCallback(function(err, userProfile) {
      if (err) {
        return res.status(401).json({ errors: {'Failed to get random live stream': [err]}});
      }
      if (userProfile) {
        return res.json({
          userProfile: userProfile
        });
      } else {
        return res.json({
          userProfile: null
        });
      }
    });
}

exports.getCurrentViewerCount = (req, res, next) => {
  const {userId} = req.params;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx.first().from('users').where({id: userId})
      .then(function(user) {
        if (user) {
          return trx.first().from('live_streams').where({user_id: userId})
          .then(function(liveStream) {
            if (liveStream) {
              const getUrl = "http://" + config.env.wowza_ip + ":8087/v2/servers/_defaultServer_/vhosts/_defaultVHost_/applications/live/instances/_definst_/incomingstreams/" + user.stream_key + "/monitoring/current";

              request(getUrl, (err, response, body) => {
                if (err || body.error) {
                  return res.status(401).json({ errors: {'Failed to get': ['viewer count.']}});
                } else {
                  return res.json({
                    result: body,
                    isLive: true
                  });
                }
              });
            } else {
              return res.json({
                result: null,
                isLive: false
              });
            }
          });
        } else {
          return res.status(401).json({ errors: {'Failed to get': ['viewer count.']}});
        }
      });
  })
  .then(function() {
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'Failed to get viewer count.': [err]}});
  });
};

exports.addNotificationSubscription = (req, res, next) => {
  const {userId} = req.params;
  const notification_subscription = req.body.notification_subscription;

  if (!userId || userId === null) {
    return res.status(401).json({ errors: {'User Id': ['is required.']}});
  }

  db.knex.transaction(function(trx) {
    return trx('profiles').first().where({user_id: userId})
      .then(function(profile) {
        profile.notification_subscription = notification_subscription;
        return trx.where({user_id: userId}).update(profile).into('profiles');
      });
  })
  .then(function() {
    return res.json({
      result: 'success'
    });
  })
  .catch(function(err) {
    console.error(err);
    return res.status(401).json({ errors: {'User Id': [err]}});
  });
}

/*exports.streamPublished = (req, res, next) => {
  const {streamName} = req.params;

  if (!streamName || streamName === null) {
    return res.status(401).json({ errors: {'Stream Name': ['is required.']}});
  }

  console.log(streamName + " published!");

  return res.json({
    result: "success"
  });
}

exports.streamUnpublished = (req, res, next) => {
  const {streamName} = req.params;

  if (!streamName || streamName === null) {
    return res.status(401).json({ errors: {'Stream Name': ['is required.']}});
  }

  console.log(streamName + " unpublished!");

  return res.json({
    result: "success"
  });
}*/

/* Notifications */
const triggerPushMsg = function(subscription, dataToSend) {
  const options = {
    TTL: 3600
  }

  return webpush.sendNotification(subscription, dataToSend, options)
  .catch((err) => {
    if (err.statusCode === 410 || err.statusCode === 404) {
      //delete subscription from db
      //return deleteSubscriptionFromDatabase(subscription._id);
      console.log('404/410 error: ', err);
    } else {
      console.log('Subscription is no longer valid: ', err);
    }
  });
};

exports.notificationReportedStream = (req, res) => {
  let mailList = [''];
  async.waterfall([
    function(done) {
      let SMTPTransport = nodemailer.createTransport(smtpTransport({
        service: 'Gmail',
        auth: {
          user: '',
          pass: ''
        }
      }));
      let mailOptions = {
        to: mailList,
        from: 'reportedstreams@jive.live',
        subject: 'A Stream has been reported',
        text: 'Hello,\n\n' +
          'This is a notification that the stream for the following userId ' + req.params.user_id + ' and timestamp ' + req.params.start_timestamp + ' has just been reported.\n\n For this reason: \n\n'
          + req.params.reason + '\n\n'

      };
      SMTPTransport.sendMail(mailOptions, function(err) {
        req.flash('success', 'Stream has been reported');
        done(err);
      });
    }
  ], function(err) {
    res.send('Email has been sent to site administrator.');
  });
}



/* Payment */
exports.stripeSetup = paymentApi.stripeSetup;
exports.stripeSetupStandard = paymentApi.stripeSetupStandard;
exports.stripeConnect = paymentApi.stripeConnect;
exports.stripeTransfers = paymentApi.stripeTransfers;
exports.stripePay = paymentApi.stripePay;
exports.saveTransaction = paymentApi.saveTransaction;
exports.getUserTransactions = paymentApi.getUserTransactions;

/* Data storage */
exports.uploadImage = dataStorage.uploadImage;

/* Forgot password */
exports.forgot = passwordApi.forgot;
exports.getReset = passwordApi.getReset;
exports.resetPassword = passwordApi.resetPassword;
