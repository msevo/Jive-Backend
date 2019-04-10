/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const chalk = require('chalk');
const errorHandler = require('errorhandler');
const dotenv = require('dotenv');
const flash = require('express-flash');
const path = require('path');
const passport = require('passport');
const expressValidator = require('express-validator');
const expressStatusMonitor = require('express-status-monitor');
const sass = require('node-sass-middleware');
const multer = require('multer');

const upload = multer({ dest: path.join(__dirname, 'uploads') });

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load({ path: '.env.example' });

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const apiController = require('./controllers/api');
const chatController = require('./controllers/chat');

/**
 * Middleware Services.
 */
const auth = require('./services/auth.service');

/**
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');
const config = require('./config/environment');

/**
 * Create Express server.
 */
const app = express();

//Chat
//var server = require('http').Server(express);
var server = require('http').Server(app);
var io = require('socket.io')(server);

/**
 * Express configuration.
 */
// Change here, allow multiple ports
app.use(function(req, res, next) {
    var allowedOrigins = config.allowedOriginsApi;
    var origin = req.headers.origin;
    if(allowedOrigins.indexOf(origin) > -1){
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, PATCH, PUT');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    return next();
});
app.use("/static", express.static(__dirname + '/static'));

app.set('host', process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0');
app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 9000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(expressStatusMonitor({ websocket: io, port: app.get('port') })); //this line needed to be edited for chat to work
app.use(compression());
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public')
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use('/api/uploads', express.static('uploads')); // Serve documents
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  res.locals.userAccount = req.userAccount;
  next();
});

//Chat
chatController.chatInit(io);

/**
 * Primary app routes.
 */
app.get('/', homeController.index);

/**
 * API routes.
 */
app.post('/api/login', apiController.login);             //login method path: controllers/api.js
app.post('/api/register', apiController.register);       //register method path: controllers/api.js
app.get('/api/user', auth.isAuthenticated, apiController.getCurrentUser);      //getting current login user detail method path: controllers/api.js
app.put('/api/user/update/:userId', auth.isAuthenticated, apiController.updateUser);  //update user details method path: controllers/api.js
app.get('/api/userAccount/:username', apiController.getUserAccount);     //getting user detail by username method path: controllers/api.js
app.get('/api/userProfile/:username', apiController.getUserProfile);     //getting user detail by username method path: controllers/api.js
app.post('/api/user/exists', apiController.checkForUser);
app.post('/api/uploadImage', auth.isAuthenticated, apiController.uploadImage);    //uploading profile picture method path: controllers/api.js
app.get('/api/userByEmail/:email', apiController.getUserByEmail);
app.post('/api/follow/:userId', auth.isAuthenticated, apiController.follow);
app.put('/api/unfollow/:userId', auth.isAuthenticated, apiController.unfollow);
app.get('/api/follows/:userId/:followsId', auth.isAuthenticated, apiController.follows);
app.get('/api/followers/:userId', auth.isAuthenticated, apiController.getFollowers);
app.get('/api/following/:userId', auth.isAuthenticated, apiController.getFollowing);
app.post('/api/liveStream/started', apiController.startLiveStream);
app.post('/api/liveStream/stopped', apiController.stopLiveStream);
//app.put('/api/liveStream/update/:userId', auth.isAuthenticated, apiController.updateLiveStream);
app.get('/api/liveStream/:userId', apiController.getLiveStream);
app.put('/api/liveStream/increaseTotalViews/:userId', apiController.increaseTotalViews);
app.get('/api/archivedStream/:username/:streamId', apiController.getArchivedStream);
app.get('/api/archivedStreams/:username', apiController.getArchivedStreams);
app.put('/api/archivedStreams/delete/:userId/:streamId', apiController.deleteArchivedStream);
app.put('/api/archivedStreams/update', apiController.updateArchivedStream);
app.get('/api/feed', apiController.getFeed); //returns all followed user profiles and live streams that are live
app.get('/api/search/:searchText', apiController.search); //returns all user profiles and live streams that match search
app.put('/api/streamInfo/update', auth.isAuthenticated, apiController.updateStreamInfo);
app.get('/api/streamInfo/:userId', apiController.getStreamInfo);
app.get('/api/streamKey/:userId', apiController.getStreamKey);
app.get('/api/randomStream', apiController.getRandomStream);
app.get('/api/liveStream/currentViewerCount/:userId', apiController.getCurrentViewerCount);
app.post('/api/saveArchivedStream', apiController.saveArchivedStream);
app.post('/api/notification_subscription/:userId', apiController.addNotificationSubscription);
app.get('/api/featuredStreams', apiController.getFeaturedStreams); //returns all streams for new landing page
app.post('/api/reportStream/:user_id/:start_timestamp/:reason', apiController.notificationReportedStream);

//app.put('/api/streamPublished/:streamName', apiController.streamPublished);
//app.put('/api/streamUnpublished/:streamName', apiController.streamUnpublished);
app.get('/api/stripe/setup', auth.isAuthenticated, apiController.stripeSetup);        //stripe payment setup
app.get('/api/stripe/setupStandard', auth.isAuthenticated, apiController.stripeSetupStandard);        //stripe payment setup Standard account
app.get('/api/stripe/token', apiController.stripeConnect);        //stripe payment setup
app.get('/api/stripe/transfers', auth.isAuthenticated, apiController.stripeTransfers);        //redirect to stripe account
app.post('/api/stripe/pay', apiController.stripePay);        //payment method stripe
app.post('/api/saveTransaction', apiController.saveTransaction);
app.get('/api/userTransactions/:userId', apiController.getUserTransactions);
app.post('/api/forgot', apiController.forgot);            //Forgot Password method
app.get('/reset/:token', apiController.getReset);          //Reset password method
app.post('/reset/:token', apiController.resetPassword);
app.put('/api/updatePassword/:userId', auth.isAuthenticated, apiController.updatePassword);
app.put('/api/incrementChat/:userId/:chatId/:sentTo', chatController.incrementChat);
app.put('/api/decrementChat/:userId/:chatId/:sentTo', chatController.decrementChat);
app.post('/api/saveChat/:userId/:sentTo', chatController.saveChat);
app.get('/api/getRecentChat/:sentTo', chatController.getRecentChat);


/**
 * Error Handler.
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
server.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
  console.log('  Press CTRL-C to stop\n');
});

module.exports = app;
