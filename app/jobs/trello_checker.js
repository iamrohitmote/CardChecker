const logger = require('../../config/logger')
const cardModel = require('../models/card')
const cardUtilities = require('../utilities/card')
const slackPublisher = require('../publishers/slack')

class TrelloChecker {

  constructor() {
    this.perform()
  }

  perform() {
    // first get all invalid cards from db
    cardModel
      .find({is_valid: false})
      .select('card_id')
      .exec((error, cardIds) => {
      if(error) {
        logger.error(error)
      } else {
        this.handleInvalidCards(cardIds)
      }
    })
  }

  handleInvalidCards(cardIds) {
    cardIds.forEach((doc) => {
      cardUtilities.fetchCard(doc['card_id']).then((card) => {
        let rules = this.getRules(card)
        this.executeRules(card, rules)
      }).catch((error) => {
        logger.error(error)
      })
    })
  }

  getRules(card) {
    let rules = [
      'titleWordCount',
      'titleTitleize',
      'descriptionAvailabilty',
      'labels'
    ]
    return rules
    // @todo add the rule of member checking.
  }

  executeRules(card, rules) {
    let result = cardUtilities.executeRules(card, rules, {})

    if(result['ticketValid']) {
      // if ticket is valid, delete the entry from DB.
      cardUtilities.deleteCardDoc(card['id'])
    } else {
      this.handleInvalidCard(card, result['errorMessages'])
    }
  }

  handleInvalidCard(card, errorMessages) {
    cardModel.findOne({card_id: card['id']}, (error, doc) => {
      if(error) {
        logger.info(error)
      } else {
        let warningCount = doc['warning_count']
        warningCount = warningCount + 1
        doc.save((error, doc) => {
          if(error) {
            logger.info(error)
          } else {
            let titleMsg = '😓 Again!!!!! \n' + card['name'] + ' \n This card still has some unresolved standard issues. \
                            Fix it or I will not tired of notifying you! \n \
                            Warning number - ' + doc['warning_count'] + ' \n'
            let msg = cardUtilities.buildMessage(card, titleMsg, errorMessages)
            new slackPublisher({msg: msg})
          }
        })
      }
    })
  }
}
module.exports = TrelloChecker