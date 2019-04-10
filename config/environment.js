'use strict';

// Development specific configuration
// ==================================
module.exports = {
  //environment
  env: {
    url: 'https://jive.live', //prod
    //url: 'http://localhost:4300', //test
    wowza_ip: '',
    applicationServerPrivateKey: '',
    applicationServerPublicKey: ''
  },
  // CORS
  allowedOriginsApi: [
    'http://localhost',
    'http://localhost:4300',
    'https://localhost:4300',
    'https://jive.live',
    'https://www.jive.live',
    'http://jive.live/',
    'http://www.jive.live/',
    ''
  ],
  stripe:{
    /* live */
    publishableKey: '',
    secretKey: '',
    clientId: '',
    /* testing */
  //  publishableKey: '',
  //  secretKey: '',
  //  clientId: '',

    authorizeUri: 'https://connect.stripe.com/express/oauth/authorize',
    authorizeUriStandard: 'https://connect.stripe.com/oauth/authorize',
    tokenUri: 'https://connect.stripe.com/oauth/token',

    percentageFee: 0.029,
    flatFee: 30,
    jiveFee: 0.1
  },

};
