const querystring = require('querystring');
const request = require('request');

var config = require('../config/environment');
var stripe = require('stripe')(config.stripe.secretKey);

const db = require('../dbConfig/dbAPI');


/**
 * GET /stripe/authorize
 *
 * Redirect to Stripe to set up payments.
 */
exports.stripeSetup = (req, res, next) => {
  // Set state as user id.
  req.session.state = req.userAccount.id;
  // Prepare the mandatory Stripe parameters.
  let parameters = {
    client_id: config.stripe.clientId,
    state: req.session.state/*,
    payout_schedule: {
      delay_days: 'minimum',
      interval: 'weekly',
      weekly_anchor: 'monday'
    }*/
  };

  var userUrl = "https://jive.live/" + req.userAccount.username;

  // Optionally, Stripe Connect accepts `first_name`, `last_name`, `email`,
  // and `phone` in the query parameters for them to be autofilled.
  parameters = Object.assign(parameters, {
    'stripe_user[business_type]': 'individual',
    'stripe_user[email]': req.userAccount.email,
    'stripe_user[url]': userUrl
  });
  // Redirect to Stripe to start the Connect onboarding.
  return res.json({
    redirect: config.stripe.authorizeUri + '?' + querystring.stringify(parameters)
  });
}

/**
 * GET /stripe/authorizeStandard
 *
 * Redirect to Stripe to set up payments w/ a Standard account.
 */
exports.stripeSetupStandard = (req, res, next) => {
  // Set state as user id.
  req.session.state = req.userAccount.id;
  // Prepare the mandatory Stripe parameters.
  let parameters = {
    client_id: config.stripe.clientId,
    response_type: 'code',
    scope: 'read_write',
    state: req.session.state,
    stripe_landing: 'register'/*,
    payout_schedule: {
      delay_days: 'minimum',
      interval: 'weekly',
      weekly_anchor: 'monday'
    }*/
  };

  var userUrl = "https://jive.live/" + req.userAccount.username;

  // Optionally, Stripe Connect accepts `first_name`, `last_name`, `email`,
  // and `phone` in the query parameters for them to be autofilled.
  parameters = Object.assign(parameters, {
    'stripe_user[business_type]': 'sole_prop',
    'stripe_user[email]': req.userAccount.email,
    'stripe_user[url]': userUrl
  });
  // Redirect to Stripe to start the Connect onboarding.
  return res.json({
    redirect: config.stripe.authorizeUriStandard + '?' + querystring.stringify(parameters)
  });
}

/**
 * GET /stripe/token
 *
 * Connect the new Stripe account to the platform account.
 */
exports.stripeConnect = async (req, res) => {
  // Check the state we got back equals the one we generated before proceeding.
  // ** If we are able to access and have a saved req.session.state, then pass
  // the userAccount data through here as well; for now we are just trusting state as user_id
  /*console.log(req.session.state);
  console.log(req.query.state);
  if (req.session.state != req.query.state) {
    console.log("Session and query states different.");
    return res.redirect(config.env.url + '/dashboard');
  }*/

  // Post the authorization code to Stripe to complete the authorization flow.
  request.post(config.stripe.tokenUri, {
    form: {
      grant_type: 'authorization_code',
      client_id: config.stripe.clientId,
      client_secret: config.stripe.secretKey,
      code: req.query.code
    },
    json: true
  }, (err, response, body) => {
    if (err || body.error) {
      console.log('The Stripe onboarding process has not succeeded.');
      return res.redirect(config.env.url + '/profile/payment');
    } else {
      // Update the model and store the Stripe account ID in the datastore.
      // This Stripe account ID will be used to pay out to the pilot.
      stripe.accounts.update(body.stripe_user_id, {
        'payout_schedule': {
          'delay_days': 'minimum',
          'interval': 'monthly',
          'monthly_anchor': 4
        }
      });

      db.knex.transaction(function(trx) {
        return trx.first().from('profiles').where({user_id: req.query.state})
          .then(function(userProfile) {
            userProfile.stripe_id = body.stripe_user_id;
            return trx.where({user_id: userProfile.user_id}).update(userProfile).into('profiles');
          });
      })
      .then(function() {
        return res.redirect(config.env.url + '/profile/payment');
      })
      .catch(function(error) {
        console.error(error);
        return res.redirect(config.env.url + '/profile/payment');
      });
    }
  });
};

/**
 * GET /stripe/transfers
 *
 * Redirect to Stripe to view transfers and edit payment details.
 */
exports.stripeTransfers = async (req, res, next) => {
  // Make sure the logged-in pilot had completed the Stripe onboarding.
  if (!req.userProfile.stripe_id) {
    return res.json({
      redirect: config.env.url + '/profile/payment'
    });
  }

  try {
    // Generate a unique login link for the associated Stripe account.
    const loginLink = await stripe.accounts.createLoginLink(req.userProfile.stripe_id);
    // Retrieve the URL from the response and redirect the user to Stripe.
    return res.json({
      redirect: loginLink.url
    });
  } catch (err) {
    console.log('Failed to create a Stripe login link.');
    return res.json({
      redirect: config.env.url + '/profile/payment'
    });
  }
};

/**
 * POST /stripe
 * make stripe payment
 */
exports.stripePay = (req, res, next) => {
  /* calculate fees */
  //forst, we take a % from total amount
  var feesTaken = Math.ceil(req.body.amount * config.stripe.jiveFee);

  stripe.accounts.retrieve(req.body.destinationStripeId,
    function(err, account) {
      console.log(account);
      if (account) {
        if (account.type == "standard") {
          stripe.charges.create({
            amount: req.body.amount,
            currency: "usd",
            source: req.body.token.id,
            application_fee: feesTaken,
          }, {
            stripe_account: req.body.destinationStripeId,
          }).then(function(charge) {
            if(err) {
              console.log(err);
              return res.status(401).json({ errors: {'stripe': ["error occured during payment"]}});
            }
            return res.json({
              result: "Payment success."
            });
          });
        } else {
          //only for express destination charges, stripe 2.9% + 30 cents
          feesTaken += Math.ceil(req.body.amount * config.stripe.percentageFee) + config.stripe.flatFee;
          var finalPaymentAmt = req.body.amount - feesTaken;
          console.log(req.body.amount);
          console.log(req.body.token);

          // call stripe api for paying the payment
          stripe.charges.create({
            amount: req.body.amount,
            currency: "usd",
            description: req.body.token.email,
            source: req.body.token.id,
            destination: {
              amount: finalPaymentAmt,
              account: req.body.destinationStripeId,
            },
          }, function(err, charge) {
            if(err) {
              console.log(err);
              return res.status(401).json({ errors: {'stripe': ["error occured during payment"]}});
            }
            return res.json({
              amount: finalPaymentAmt,
              currency: "usd",
              source: req.body.token.id,
              account: req.body.destinationStripeId,
              result: "Payment success."
            });
          });
        }
      } else {
        return res.status(401).json({ errors: {'stripe': ["no stripe account with that id"]}});
      }
    }
  );
};

exports.saveTransaction = (req, res, next) => {
  const transaction = {
    from_user_id: req.body.donaterId,
    to_user_id: req.body.receiverId,
    currency_code: req.body.currency,
    amount: req.body.amount
  };
  db.knex.insert(transaction).into('user_transactions').asCallback(function(err) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to insert transaction.': [err]}});
    }
    return res.json({
      result: "Transaction inserted."
    });
  });
}

exports.getUserTransactions = (req, res, next) => {
  var fromIdentifier = db.knex.raw('??', ['user_transactions.from_user_id']);
  var from_subq1 = db.knex.select('username').from('profiles').where('user_id', fromIdentifier).as('from_user');
  var from_subq2 = db.knex.select('profile_pic').from('profiles').where('user_id', fromIdentifier).as('profile_pic');
  db.knex.select(from_subq1, from_subq2, 'amount', 'currency_code').from('user_transactions').where({to_user_id: req.params.userId}).orderBy('user_transactions.date_of_transaction', 'desc').asCallback(function(err, userTransactions ) {
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Failed to retrieve transactions.': [err]}});
    }
    return res.json({
      userTransactions: userTransactions
    });
  });
}


/*exports.stripeCharge = async (req, res, next) => {

  stripe.charges.create({
    amount: 1000,
    currency: "usd",
    source: "tok_visa",
    destination: {
      account: "{CONNECTED_STRIPE_ACCOUNT_ID}",
    },
  }).then(function(charge) {
    // asynchronously called
  });
}*/
