var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var request = require('request');
var config = require('./config');
var OpenTok = require('opentok');

var app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

if (!config.apiKey || !config.apiSecret) {
  throw new Error('API_KEY or API_SECRET must be defined as an environment variable');
}

var opentok = new OpenTok(config.apiKey, config.apiSecret);
var sessionId;
var webrtcToken;
var sipToken;

opentok.createSession({ mediaMode:"routed" }, function(error, session) {
  if (error) {
    throw new Error("Error creating session:"+error);
  } else {
    sessionId = session.sessionId;

    // For web tokens, moderator role is used to force disconnect SIP calls.
    // For SIP tokens, an identifying SIP flag is embedded in the metadata.
    webrtcToken = opentok.generateToken(sessionId, {role: "moderator"});
    sipToken = opentok.generateToken(sessionId, {data: "sip=true"});
  }
});

/* GET home page. */
app.get('/', function(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({
    sessionId: sessionId,
    token: webrtcToken,
    apiKey: config.apiKey
  }));
});

/* POST to start Wormhole SIP call. */
app.post('/sip/start', function(req, res, next) {
  var sessionId = req.body.sessionId;
  var apiKey = req.body.apiKey;
  opentok.dial(sessionId, sipToken, config.sipUri, {
    auth: {
      username: config.sipUsername,
      password: config.sipPassword
    },
    headers: config.sipHeaders
  }, function (err, sipCall) {
    if (err) {
      console.error(err);
      return res.status(500).send('Platform error starting SIP Call:'+err);
    }
    console.dir(sipCall);
    res.send(sipCall);
  });
});

app.get('/host', function(req, res) {
  var sessionId = app.get('sessionId'),
      // generate a fresh token for this client
      token = opentok.generateToken(sessionId, { role: 'moderator' });

  res.render('host.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token
  });
});

app.post('/start', function(req, res) {
  var hasAudio = (req.param('hasAudio') !== undefined);
  var hasVideo = (req.param('hasVideo') !== undefined);
  var outputMode = req.param('outputMode');
  opentok.startArchive(app.get('sessionId'), {
    name: 'Node Archiving Sample App',
    hasAudio: hasAudio,
    hasVideo: hasVideo,
    outputMode: outputMode
  }, function(err, archive) {
    if (err) return res.send(500,
      'Could not start archive for session '+sessionId+'. error='+err.message
    );
    res.json(archive);
  });
});

app.get('/stop/:archiveId', function(req, res) {
  var archiveId = req.param('archiveId');
  opentok.stopArchive(archiveId, function(err, archive) {
    if (err) return res.send(500, 'Could not stop archive '+archiveId+'. error='+err.message);
    res.json(archive);
  });
});

app.get('/participant', function(req, res) {
  var sessionId = app.get('sessionId'),
      // generate a fresh token for this client
      token = opentok.generateToken(sessionId, { role: 'moderator' });

  res.render('participant.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token
  });
});

app.get('/history', function(req, res) {
  var page = req.param('page') || 1,
      offset = (page - 1) * 5;
  opentok.listArchives({ offset: offset, count: 5 }, function(err, archives, count) {
    if (err) return res.send(500, 'Could not list archives. error=' + err.message);
    res.render('history.ejs', {
      archives: archives,
      showPrevious: page > 1 ? ('/history?page='+(page-1)) : null,
      showNext: (count > offset + 5) ? ('/history?page='+(page+1)) : null
    });
  });
});

app.get('/delete/:archiveId', function(req, res) {
  var archiveId = req.param('archiveId');
  opentok.deleteArchive(archiveId, function(err) {
    if (err) return res.send(500, 'Could not stop archive '+archiveId+'. error='+err.message);
    res.redirect('/history');
  });
});

app.get('/download/:archiveId', function(req, res) {
  var archiveId = req.param('archiveId');
  opentok.getArchive(archiveId, function(err, archive) {
    if (err) return res.send(500, 'Could not get archive '+archiveId+'. error='+err.message);
    res.redirect(archive.url);
  });
});

var port = process.env.PORT || 3000;
app.listen(port);
console.log('Sample app is listening on port ' + port);
