var knex = require('knex')({
  client: 'pg',
  connection: {
    host : '',
    user : '',
    password : '',
    database : ''
  },
  acquireConnectionTimeout: 10000
});

module.exports = knex;
