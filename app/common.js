import { Mongo } from 'meteor/mongo'
import SimpleSchema from 'simpl-schema'

GAME_MINIMUM_PLAYERS = 4

SimpleSchema.extendOptions(['autoform'])

Games = new Mongo.Collection('games')
Games.attachSchema(new SimpleSchema({
  isNight: {
    type: Boolean,
    defaultValue: false
  },
  index: Number,
  days: Array,
  "days.$": Object,
  "days.$.index": Number,
  "days.$.votes": Array,
  "days.$.votes.$": Object,
  "days.$.votes.$.userId": String,
  "days.$.votes.$.target": String,
  "days.$.lynched": String,
  "days.$.chatId": String,
  "days.$.hunted": String,
  "days.$.cupided": [String],
  nights: Array,
  "nights.$": Object,
  "nights.$.index": Number,
  "nights.$.cupids": [String],
  "nights.$.seered": String,
  "nights.$.attackChatId": String,
  "nights.$.votesAttack": Array,
  "nights.$.votesAttack.$": Object,
  "nights.$.votesAttack.$.userId": String,
  "nights.$.votesAttack.$.target": String,
  "nights.$.attacked": String,
  "nights.$.werewolvesDone": {
    type: Boolean,
    defaultValue: false
  },
  "nights.$.healed": String,
  "nights.$.poisoned": String,
  "nights.$.witchDone": {
    type: Boolean,
    defaultValue: false
  },
  gameMaster: {
    type: String,
    defaultValue: "system"
  },
  players: Array,
  "players.$": Object,
  "players.$.userId": String,
  "players.$.role": String,
  "players.$.isDead": {
    type: Boolean,
    defaultValue: false
  },
  "players.$.data": {
    type: Object,
    blackbox: true // store current lovers, potions usage ...
  },
  nbWerewolves: Number,
  createdAt: { type: Date, required: true },
  startedAt: Date,
  endedAt: Date
}, { requiredByDefault: false }))

Chats = new Mongo.Collection('chats')
Chats.attachSchema(new SimpleSchema({
  gameId: String,
  index: Number,
  isNight: Boolean,
  werewolvesOnly: {
    type: Boolean,
    defaultValue: false
  },
  messages: Array,
  "messages.$": Object,
  "messages.$.author": String,
  "messages.$.sentAt": Date,
  "messages.$.content": String
}, { requiredByDefault: false }))
