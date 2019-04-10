const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const db = require('../dbConfig/dbAPI');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.knex.first().from('users').where({id: id}).asCallback(function(err, user) {
    done(err, user);
  });
});

/**
 * Sign in using Email and Password.
 */
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
  //new DB code
  db.knex.first().from('users').where({email: email}).asCallback(function(err, user) {
    if(err){
      return done(err);
    }
    if (!user) {
      return done(null, false, { msg: `Email ${email} not found.` });
    }

    db.knex.first().from('passwords').where({user_id: user.id}).asCallback(function(err, userPassword) {
      if (err) { return done(err); }

      db.comparePassword(password, userPassword.password.toString(), (err, isMatch) => {
        if (err) { return done(err); }
        if (isMatch) {

          return done(null, user);
        }
        return done(null, false, { msg: 'Invalid email or password.' });
      });
    });
  });
}));
