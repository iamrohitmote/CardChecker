const slackPublisher = require('../publishers/slack')
const logger = require('../../config/logger')
const cardModel = require('../models/card')
const cardUtilities = require('../utilities/card')

class Card {
  constructor(action) {
    this.action = action
    this.handlerDispatcher()
  }

  handlerDispatcher() {
    let cardId = this.action['data']['card']['id']
    cardUtilities.fetchCard(cardId, {attachments: true, checklists: 'all'}).then((card) => {
      let cardCategory = this.getCardCategory(card)
      switch(this.action['type']) {
      case 'createCard':
        this.handlerCreateCard(card, {cardCategory: cardCategory})
        break
      case 'updateCard':
        this.handleUpdateCard(card, {cardCategory: cardCategory})
        break
      case 'deleteCard':
        this.handleArchivedCardAction(card)
        break
      }
    }).catch((error) => {
      logger.error(error)
    })
    return
  }


  /**
   * Get the card category eg. development, other
   * Category helps to decide which rule should be applied to card.
   * Support categories - development, other
   * Default category is set to `development`.
   * @param  {Object}  card Trello card Object.
   * @return {String} Category of card
   */
  getCardCategory(card) {
    // Currently to check whether card is dev or not, it only check the label naming 'development'.
    // @todo make this configurable.
    let labels = card.labels
    let category = 'development'

    labels.forEach((labelObject) => {
      let name = labelObject.name.toLowerCase()
      if(name.match(/^.*non-dev.*$/)) {
        category = 'other'
      }
    })
    return category
  }

  handlerCreateCard(card, options) {
    let rules = [
      'titleWordCount',
      'titleTitleize',
      'descriptionAvailabilty',
      'labels',
      'listOfNewCard'
    ]
    this.executeRules(card, rules, 'createCard')
  }

  handleUpdateCard(card, options) {
    let rules = []
    switch(this.action['display']['translationKey']) {
    case 'action_move_card_from_list_to_list':
      rules = this.getListToListCardMoveRules(card, options)
      break
    case 'action_archived_card':
      this.handleArchivedCardAction(card)
      break
    }

    // If rules are empty, return.
    if(!rules)
      return
    this.executeRules(card, rules, 'updateCard')
  }

  handleArchivedCardAction(card) {
    cardUtilities.deleteCardDoc(card['id'])
  }

  getListToListCardMoveRules(card, options) {
    let data = this.action['data']
    let rules = []
    // let listBefore = data['listBefore']['name'].toLowerCase()
    let listAfter = data['listAfter']['name'].toLowerCase()
    if(listAfter == 'in progress') {
      rules.push('inProgressListMembersRequired', 'dueDate')
    }
    if(listAfter == 'in review' && card['checklists'].length > 0) {
      rules.push('checkListItemStateCompletion')
    }
    // PR only exists for dev cards, not for marketing or SEO tasks. So check here, if card category is development or not?
    if(listAfter == 'in review' && options.cardCategory == 'development') {
      rules.push('checkPullRequestAttachment')
    }
    return rules
  }

  executeRules(card, rules, eventType) {
    let options = {actionData: this.action['data']}

    let result = cardUtilities.executeRules(card, rules, options)

    if(result['ticketValid']) {
      // if ticket is valid, delete the entry from DB.
      cardUtilities.deleteCardDoc(card['id'])
    } else {
      this.handleInvalidCard(card, result['errorMessages'], eventType)
    }
  }

  handleInvalidCard(card, errorMessages, eventType) {
    if(eventType == 'createCard') {
      // for new card, save card. no need to check
      cardUtilities.createCardDoc(card).then(() => {
        this.notifyErrors(card, errorMessages)
      }, (error) => {
        logger.error(error)
      }).catch((error) => {
        logger.error(error)
      })
    } else if(eventType == 'updateCard') {
      cardModel.findOne({card_id: card['id']}, (error, doc) => {
        if(error){
          logger.error(error)
        } else if(!doc) {
          cardUtilities.createCardDoc(card).then(() => {
            this.notifyErrors(card, errorMessages)
          }, (error) => {
            logger.error(error)
            new slackPublisher({msg: 'Your db is having problem'})
          }).catch((error) => {
            logger.error(error)
          })
        } else {
          this.notifyErrors(card, errorMessages)
        }
      })
    }
  }

  notifyErrors(card, errorMessages) {
    // notify on slack
    let titleMsg = '@' + this.action['memberCreator']['username'] + '\n :white_frowning_face: Awwww! Looks like you didn\'t followed the trello ticket standards \n'
    let msg = cardUtilities.buildMessage(card, titleMsg, errorMessages)
    new slackPublisher({msg: msg})
  }
}

module.exports = Card
