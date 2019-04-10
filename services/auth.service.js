const db = require('../dbConfig/dbAPI');

/**
 * Attaches the user object to the request if authenticated
 * Otherwise returns 403
 */
exports.isAuthenticated = (req, res, next) => {
  const token = req.headers.authorization;
    if (token) {
      db.knex.first().from('users').where({auth_token: token}).asCallback(function(err, userAccount) {
      if (!userAccount) {
        return res.status(401).json({ errors: {'Token': ['invalid']}});
      }
        db.knex.first().from('profiles').where({user_id: userAccount.id}).asCallback(function(err, userProfile) {
          if (!userProfile) {
            return res.status(401).json({ errors: {'Token': ['invalid']}});
          }
          req.userAccount = userAccount;
          req.userProfile = userProfile;
          next();
        });
      });
    } else {
    return res.status(401).json({ errors: {'Token': ['invalid']}});
    next();
  }
};
