const express = require('express')
const app = express()
const eventHandler = require('./app/event_handler')

app.get('/', (req, res) => res.send('Hello World!'))

// post trello webhook
app.post('/', (req, res) => {
  new eventHandler(req.body)
})

app.listen(8080, () => {
  console.log('Listening on 3000')
})
