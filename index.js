require('dotenv').config()
const bodyParser = require('body-parser')
const express = require('express')
const app = express()
const eventController = require('./app/controllers/event_controller')
const configurationController = require('./app/controllers/configuration_controller')
const logger = require('./config/logger')
const mongoose = require('mongoose')
const trelloCheckerJob = require('./app/jobs/trello_checker')
const moment = require('moment-timezone')

app.use(bodyParser.json());
app.get('/', (req, res) => {
  res.send('Hello World!')
})

// trello webhook event
app.post('/', function(req, res) {
  res.send('OK')
  let controller = new eventController()
  controller.trelloEvents(req.body['action'])
})

// subscribe app as trello webhook
app.post('/configure/subscribe/trello/webhook', (req, res) => {
  let controller = new configurationController()
  controller.subscribeTrelloWebhook(req.body).then((result) => {
    res.send(result)
  }, (error) => {
    res.send(error)
  })
})

// @todo this is patch for cron job scheduling. In future use, cron instead!
setInterval(() => {
  let date = moment().tz('Asia/Kolkata')
  if(!['0', '6'].includes(date.format('e')) && date.format('H') >= 9 && date.format('H') <= 20) {
    // don't run checker job on Sunday and Saturday.
    // Also don't run job before 9:00 and after 20:59.
    console.log('running checker job')
    new trelloCheckerJob()
  }
}, (25*60*1000))

mongoose.connect('mongodb://' + process.env.DB_URI, {useNewUrlParser: true, useCreateIndex: true})
  .then(() => {
      logger.info('MONGODB CONNECTION SUCCESFULL');
      app.listen(process.env.PORT, () => {
        logger.info('Listening on ' + process.env.PORT)
      })
    }, (err) => {
    logger.error('connection error:', err);
  });
