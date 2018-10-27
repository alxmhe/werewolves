import { Meteor } from 'meteor/meteor'
import { Template } from 'meteor/templating'
import { Session } from 'meteor/session'
import 'bootstrap/dist/css/bootstrap.css'
import './index.html'

Meteor.subscribe('allGames')
Meteor.subscribe('allChats')
Meteor.subscribe('allUsers')

var swRegistration

Meteor.startup(function() {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    if (Notification.permission !== "granted")
      Notification.requestPermission()
    navigator.serviceWorker.register('sw.js')
    .then(function(swReg) {
      swRegistration = swReg
    })
    .catch(function(error) {})
  }
})

function getRolesObject(role) {
  return {
    isWerewolf: role === "werewolf",
    isSeer: role === "seer",
    isWitch: role === "witch",
    isHunter: role === "hunter",
    isPriest: role === "priest",
    isPrince: role === "prince",
    isCupid: role === "cupid",
    isMayor: role === "mayor",
    isVillager: role === "villager"
  }
}

function notifyPlayer(type = "poke") {
  if (swRegistration) {
    const title = "Smells like werewolf"
    let options = {
      body: "You're needed back on set."
    }
    switch (type) {
      case "vote":
        options.body = "Please vote."
        break
      case "start":
        options.body = "The game is on."
        break
      case "night":
        options.body = "Everybody, close your eyes!"
        break
      default:
    }
    if (Notification.permission === "granted")
      swRegistration.showNotification(title, options)
    else if (Notification.permission !== "denied")
      Notification.requestPermission().then(permission => {
        if (permission === "granted")
          swRegistration.showNotification(title, options)
      })
  }
}

Template.registerHelper('currentUser', function() {
  return Meteor.user()
})

Template.registerHelper('hasRole', function(gameId, role) {
  const userId = Meteor.userId()
  const game = userId && Games.findOne(gameId)
  const player = game && game.players.find(p => p.userId === userId)
  return player && player.role === role
})

Template.dashboard.helpers({
  currentGame() {
    return Games.findOne({ createdAt: { $ne: null }, endedAt: null })
  },
  games() {
    return Games.find({ endedAt: { $ne: null }})
  },
  gameIsOver() {
    const gameId = Session.get('gameId', false)
    return gameId && Games.findOne({_id: gameId, endedAt: { $ne: null }})
  }
})

Template.dashboard.events({
  'click .js-createGame'() {
    Meteor.call('createGame', (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  },
  'submit .js-saveUsername'(e) {
    e.preventDefault()
    Meteor.call('saveUsername', e.currentTarget.username.value, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  }
})

Template.gameOver.helpers({
  winner() {
    const gameId = Session.get('gameId', false)
    const game = gameId && Games.findOne({_id: gameId, endedAt: { $ne: null }})
    if (!game)
      return { team: null }
    let team = null
    const remainingWerewolves = game.nbWerewolves - game.players.filter(p => p.isDead && p.role === "werewolf").length
    const remainingVillagers = game.players.length - game.nbWerewolves - game.players.filter(p => p.isDead && p.role !== "werewolf").length
    if (remainingWerewolves > 0)
      team = "werewolves"
    else if (remainingVillagers > 0)
      team = "villagers"
    return {
      team,
      count: remainingWerewolves + remainingVillagers
    }
  }
})

Template.gameOver.events({
  'click .js-dismiss'() {
    Session.set("gameId", null)
  }
})

Template.game.helpers({
  player() {
    const userId = Meteor.userId()
    const p = this.players.find(p => p.userId === userId)
    return p && {
      ...p,
      ...getRolesObject(p.role)
    }
  },
  isGameMaster() {
    const userId = Meteor.userId()
    return this.players.find(p => p.userId === userId) && this.gameMaster === userId
  },
  hasEnoughPlayers() {
    return this.players.length >= GAME_MINIMUM_PLAYERS
  },
  isNight() {
    return this.stage === 'night'
  },
  players() {
    return this.players.map(p => {
      return {
        ...p,
        ...getRolesObject(p.role)
      }
    })
  },
  onlineUsers() {
    return Meteor.users.find({})
  },
  remainingWerewolves() {
    let remainder = this.nbWerewolves
    this.players.forEach(p => {
      if (p.isDead && p.role === "werewolf")
        --remainder
    })
    return remainder
  },
  remainingVillagers() {
    let remainder = this.players.length - this.nbWerewolves
    this.players.forEach(p => {
      if (p.isDead && p.role !== "werewolf")
        --remainder
    })
    return remainder
  }
})

Template.game.events({
  'click .js-joinGame'() {
    Meteor.call('joinGame', this._id, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  },
  'click .js-leaveGame'() {
    Meteor.call('leaveGame', this._id, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  },
  'click .js-startGame'() {
    Meteor.call('startGame', this._id, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  },
  'click .js-killGame'() {
    if (window.confirm('Are you sure you want to terminate the current game ?'))
      Meteor.call('killGame', this._id, (err, data) => {
        if (err)
          console.error(err.message)
        console.log("data", data)
      })
  }
})

Template.ongoingGame.onRendered(function() {
  const game = Games.findOne(this.data._id)
  if (game) {
    Session.set("gameId", game._id)
    if (game.players.find(p => p.userId === Meteor.userId()))
      notifyPlayer("start")
  }
})

Template.ongoingGame.helpers({
  isDead() {
    const player = this.players.find(p => p.userId === Meteor.userId())
    return player && player.isDead
  },
  isWitness() {
    const player = this.players.find(p => p.userId === Meteor.userId())
    return !player
  },
  title() {
    const isIntro = this.index === 0 && !Session.get('markIntroRead', false)
    return !isIntro ? (!this.isNight ? "Day " : "Night ") + (this.index + 1) : null
  },
  isIntro() {
    return !Session.get('markIntroRead', false)
  },
  deaths() {
    return 0
  }
})

Template.ongoingGame.events({
  'click .js-markIntroRead'() {
    Session.set('markIntroRead', true)
  }
})

Template.ongoingDay.onCreated(function() {
  this.timer = null
})

Template.ongoingDay.onRendered(function() {
  const game = Games.findOne(this.data._id)
  if (game) {
    Session.set('timer-day-'+game._id, GAME_DAY_DURATION)
    this.timer = setInterval(function() {
      // @TODO :  Initialize to correct value.
      const remainingTime = Session.get('timer-day-'+game._id, 0)
      if (!remainingTime || remainingTime <= 0) {
        clearInterval(this.timer)
        this.timer = null
      } else
        Session.set('timer-day-'+game._id, remainingTime - 1000)
    }, 1000)
    // Notify of vote
    const user = Meteor.user()
    if (user && user.status && user.status.idle && game.players.find(p => p.userId === Meteor.userId()))
      notifyPlayer("vote")
  }
})

Template.ongoingDay.helpers({
  day() {
    return this.days.find(d => d.index === this.index)
  },
  player() {
    const userId = Meteor.userId()
    const p = this.players.find(p => p.userId === userId)
    return p && {
      ...p,
      ...getRolesObject(p.role)
    }
  },
  alivePlayers() {
    return this.players.filter(p => !p.isDead)
  },
  hasLynched() {
    const player = this.players.find(p => !p.isDead && p.userId === Meteor.userId())
    if (player) {
      const day = this.days.find(d => d.index === this.index)
      const vote = day && day.votes && day.votes.find(v => v.userId === player.userId)
      return vote && vote.target && this.players.find(p => p.userId === vote.target)
    }
    return false
  },
  waitHunter() {
    return this.players.find(p => p.role === "hunter" && p.isDead) && !this.days.find(d => !!d.hunted)
  },
  remainingTime() {
    return Math.floor(Session.get('timer-day-'+this._id, 0) / 1000)
  }
})

Template.ongoingDay.events({
  'click .js-lynch'(e, t) {
    Meteor.call('voteLynch', t.data._id, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'click .js-hunt'(e, t) {
    Meteor.call('hunt', t.data._id, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
    })
  }
})

Template.ongoingNight.onCreated(function() {
  const game = Games.findOne(this.data._id)
  if (game && game.players.find(p => p.userId === Meteor.userId()))
    notifyPlayer("night")
})

Template.ongoingNight.helpers({
  night() {
    return this.nights.find(n => n.index === this.index)
  },
  player() {
    const userId = Meteor.userId()
    const p = this.players.find(p => p.userId === userId)
    return p && {
      ...p,
      ...getRolesObject(p.role)
    }
  },
  waitSeer() {
    const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
    return night && this.roles.indexOf('seer') !== -1 && !night.seered
  },
  waitCupid() {
    const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
    return night && this.roles.indexOf('cupid') !== -1 && (!night.cupids || night.cupids.length <= 1)
  },
  waitWitch() {
    const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
    const noMorePotions = !!this.nights.find(n => !!n.poisoned) && !!this.nights.find(n => !!n.healed)
    return night && this.roles.indexOf('witch') !== -1 && !night.witchDone && !noMorePotions
  },
  waitWerewolves() {
    const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
    return night && this.roles.indexOf('werewolf') !== -1 && !night.werewolvesDone
  },
  showWerewolvesChat() {
    return this.nbWerewolves > 1
  },
  werewolfHasVoted() {
    const player = this.players.find(p => p.userId === Meteor.userId() && p.role === "werewolf" && !p.isDead)
    if (player) {
      const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
      const vote = night.votesAttack.find(v => v.userId === player.userId)
      return vote && vote.target && this.players.find(p => p.userId === vote.target)
    }
    return false
  },
  witchHasPoison() {
    const player = this.players.find(p => p.userId === Meteor.userId() && p.role === "witch" && !p.isDead)
    if (player) {
      const nightPoisoned = this.nights && this.nights.find(n => !!n.poisoned)
      return !nightPoisoned && !Session.get('witchPoisoned-' + this._id, false)
    }
    return false
  },
  witchPoisonedPlayer() {
    const poisoned = Session.get('witchPoisoned-' + this._id, null)
    return poisoned && this.players.find(p => p.userId === poisoned)
  },
  witchHasHealing() {
    const player = this.players.find(p => p.userId === Meteor.userId() && p.role === "witch" && !p.isDead)
    if (player) {
      const nightHealed = this.nights && this.nights.find(n => !!n.healed)
      return !nightHealed && !Session.get('witchHealed-' + this._id, false)
    }
    return false
  },
  witchHealedPlayer() {
    const healed = Session.get('witchPoisoned-' + this._id, null)
    return healed && this.players.find(p => p.userId === poisoned)
  },
  seerPeople() {
    const player = this.players.find(p => p.userId === Meteor.userId() && p.role === "seer" && !p.isDead)
    if (player)
      return this.players.filter(p => !p.isDead && p.userId !== player.userId)
    return []
  },
  witchDeadPeople() {
    const player = this.players.find(p => p.userId === Meteor.userId() && p.role === "witch" && !p.isDead)
    if (player) {
      let dead = []
      const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
      const deaths = night && [night.attacked]
      return deaths && this.players.filter(p => !p.isDead && deaths.indexOf(p.userId) !== -1)
    }
    return []
  },
  alivePeople() {
    let dead = []
    const night = this.isNight && this.nights && this.nights.find(n => n.index === this.index)
    const deaths = night && [night.attacked]
    return deaths && this.players.filter(p => !p.isDead && deaths.indexOf(p.userId) === -1)
  }
})

Template.ongoingNight.events({
  'click .js-seer'(e, t) {
    Meteor.call('seer', t.data._id, this.userId, (err, seered) => {
      if (err)
        console.error(err.message)
      alert(this.username + ' is ' + seered)
    })
  },
  'click .js-werewolf'(e, t) {
    const gameId = t.data._id
    Meteor.call('voteAttack', gameId, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  },
  'click .js-poison'(e, t) {
    const gameId = t.data._id
    Session.set("witchPoisoned-"+gameId, this.userId)
  },
  'click .js-heal'(e, t) {
    const gameId = t.data._id
    Session.set("witchHealed-"+gameId, this.userId)
  },
  'click .js-witch'(e, t) {
    const gameId = t.data._id
    const poisoned = Session.get("witchPoisoned-"+gameId, null)
    const healed = Session.get("witchHealed-"+gameId, null)
    Meteor.call('witch', gameId, poisoned, healed, (err, data) => {
      if (err)
        console.error(err.message)
      console.log("data", data)
    })
  }
})

Template.chatbox.helpers({
  canPost() {
    const player = this.players.find(p => p.userId === Meteor.userId())
    return player && !player.isDead
  },
  messages() {
    const chat = Chats.findOne(this.chatId)
    return chat && chat.messages.map(m => {
      return {
        ...m,
        authorName: this.players.find(p => p.userId === m.author).username
      }
    }).reverse()
  }
})

Template.chatbox.events({
  'submit .js-sendMessage'(e) {
    e.preventDefault()
    const message =  e.currentTarget.message.value
    if (message)
      Meteor.call("sendMessage", this.chatId, message, (err, data) => {
        if (err)
          console.error(err.message)
        console.log("data", data)
      })
    e.currentTarget.reset()
  }
})
