const async = require('async');
const crypto = require('crypto');

const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');

const db = require('../dbConfig/dbAPI');

/*
  POST Forgot Password Method
*/

exports.forgot = (req,res,next) => {
  async.waterfall([
    function(done){
      crypto.randomBytes(20, function(err, buf){
        var token = buf.toString('hex');
        done(err, token);
      })
    },
    function(token, done){

      db.knex.first().from('users').where({email: req.body.email}).asCallback(function(err, user) {
        if(err){
          console.log(err);
          return res.status(401).json({ errors: {'An': ['error occured. Please try again.']}});
        }
        if (!user) {
          console.log("User not found");
          return res.status(401).json({ errors: {'The': ['email you entered was not found in our database. Please try again.']}});
        }

        user.reset_password_token = token;
        user.reset_password_expires = Date.now() + 3600000; //Sets expiration time to one hour

        db.knex('users').where({id: user.id}).update(user).asCallback(function(err) {
          done(err, token, user);
        });
      });
    },
    function(token, user, done){
      var SMTPTransport = nodemailer.createTransport(smtpTransport({
        service: 'Gmail',
        auth: {
          user: '',
          pass: ''
        }
      }));

      var mailOptions = {
        to: user.email,
        from: '',
        subject: 'Jive Password Reset',
        text: 'Hey, please reset your password by clicking on the link below.\n\n' +
          req.protocol +"://" + req.headers.host + '/reset/' + token + '\n\n' +
          'Thank you for using Jive!'
      };


      SMTPTransport.sendMail(mailOptions, function(err){
        req.flash('info', 'An email has been sent to ' + user.email + 'with further instructions.');
        done(err, 'done');
      });
    }
  ], function(err){
    if(err){ return next(err) }
    return res.json({ Message: 'Email sent successfully'})
  });
};

exports.getReset = (req, res) => {
  db.knex.first().from('users').where({reset_password_token: req.params.token})
  .andWhere('reset_password_expires', '>', Date.now()).asCallback(function(err, user) {
    if(!user || err) {

      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.send('Password reset token is invalid or has expired.');
    }

    res.render('reset', {
      user: req.user
    });
  });
}

exports.resetPassword = (req, res) => {
  async.waterfall([
    function(done) {
      db.knex.first().from('users').where({reset_password_token: req.params.token})
      .andWhere('reset_password_expires', '>', Date.now()).asCallback(function(err, user) {
        if (!user || err) {
          req.flash('error', 'Password reset token is invalid or has expired.');
          return res.redirect('back');
        }
        if(req.body.password != req.body.newPassword){
          return res.render('reset',{message: 'Confirm Password does not match New Password field'})
        }
        else if(req.body.password.length < 6){
          return res.render('reset', {message: 'Password must be at least 6 characters long'})
        }

        db.updatePassword(user.id, req.body.password, function(err) {
          req.logIn(user, function(err) {
            done(err, user);
          });
        });
      });
    },
    function(user, done) {
      var SMTPTransport = nodemailer.createTransport(smtpTransport({
        service: 'Gmail',
        auth: {
          user: '',
          pass: ''
        }
      }));
      var mailOptions = {
        to: user.email,
        from: 'passwordreset@demo.com',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
      };
      SMTPTransport.sendMail(mailOptions, function(err) {
        req.flash('success', 'Success! Your password has been changed.');
        done(err);
      });
    }
  ], function(err) {
    res.redirect('https://jive.live');
  });
}
