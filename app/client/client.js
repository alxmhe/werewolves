import { Meteor } from 'meteor/meteor'
import { Template } from 'meteor/templating'
import { Session } from 'meteor/session'
import { ReactiveVar } from 'meteor/reactive-var'
import './bootstrap.min.css'
import './style.css'
import './stories/classic'
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

Template.registerHelper("currentUser", function() {
  return Meteor.user()
})

Template.dashboard.helpers({
  stories() {
    return [
      {
        value: "classic",
        name: "Classic Village",
        default: true
      }
    ]
  },
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
  'submit form.js-createGame'(e) {
    e.preventDefault()
    const story = e.target.story && e.target.story.value || "classic"
    Meteor.call('createGame', story, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'submit .js-saveUsername'(e) {
    e.preventDefault()
    Meteor.call('saveUsername', e.currentTarget.username.value, (err, data) => {
      if (err)
        console.error(err.message)
    })
  }
})

Template.gameOver.helpers({
  storyGameOver() {
    const gameId = Session.get('gameId', false)
    const game = gameId && Games.findOne({_id: gameId, endedAt: { $ne: null }})
    return (game && game.theme || "classic") + "_storyGameOver"
  },
  winner() {
    const gameId = Session.get('gameId', false)
    const game = gameId && Games.findOne({_id: gameId, endedAt: { $ne: null }})
    console.log(game)
    if (!game)
      return { team: null }
    let team = null
    const remainingWerewolves = game.nbWerewolves - game.players.filter(p => p.isDead && p.role === "werewolf").length
    const remainingVillagers = game.players.length - game.nbWerewolves - game.players.filter(p => p.isDead && p.role !== "werewolf").length
    if (remainingWerewolves > 0)
      team = "werewolves"
    else if (remainingVillagers > 0)
      team = "villagers"
    console.log({
      team,
      count: remainingWerewolves + remainingVillagers,
      isWerewolf: team === "werewolves"
    })
    return {
      team,
      count: remainingWerewolves + remainingVillagers,
      isWerewolf: team === "werewolves"
    }
  }
})

Template.gameOver.events({
  'click .js-dismiss'() {
    Session.set("gameId", null)
  }
})

Template.room.helpers({
  player() {
    const { game: { players }} = this
    return players && players.find(p => p.userId === Meteor.userId())
  }
})

Template.matchmaking.helpers({
  minimumPlayers() {
    return GAME_MINIMUM_PLAYERS
  },
  storyMatchmaking() {
    return (this.game.story || "classic") + "_storyMatchmaking"
  },
  hasEnoughPlayers() {
    return this.game.players.length >= GAME_MINIMUM_PLAYERS
  },
  onlineUsers() {
    return Meteor.users.find({ "status.online": true })
  }
})


Template.matchmaking.events({
  'click .js-joinGame'() {
    Meteor.call('joinGame', this.game._id, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'click .js-leaveGame'() {
    Meteor.call('leaveGame', this.game._id, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'click .js-startGame'() {
    Meteor.call('startGame', this.game._id, (err, data) => {
      if (err)
        console.error(err.message)
    })
  }
})

Template.board.helpers({
  isGameMaster(player) {
    return player && this.game.gameMaster === player.userId
  },
  remainingWerewolves() {
    let remainder = this.game.nbWerewolves
    this.game.players.forEach(p => {
      if (p.isDead && p.role === "werewolf")
        --remainder
    })
    return remainder
  },
  remainingVillagers() {
    const { players, nbWerewolves } = this.game
    let remainder = players.length - nbWerewolves
    players.forEach(p => {
      if (p.isDead && p.role !== "werewolf")
        --remainder
    })
    return remainder
  }
})

Template.board.events({
  'click .js-killGame'() {
    if (window.confirm('Are you sure you want to terminate the current game ?'))
      Meteor.call('killGame', this.game._id, (err, data) => {
        if (err)
          console.error(err.message)
        Session.set("gameId", null)
      })
  }
})

Template.ongoingGame.onCreated(function() {
  Session.set("markIntroRead", false)
  const { game, player } = Template.currentData()
  if (game) {
    Session.set("gameId", game._id)
    if (player)
      notifyPlayer("start")
  }
})

Template.ongoingGame.helpers({
  title() {
    const isIntro = this.game.index === 0 && !Session.get('markIntroRead', false)
    return !isIntro ? (!this.game.isNight ? "Day " : "Night ") + (this.game.index + 1) : null
  },
  deaths() {
    return 0
  }
})

Template.intro.helpers({
  storyIntro() {
    return (this.game.theme || "classic") + "_storyIntro"
  },
  storyInstructions() {
    return (this.game.theme || "classic") + "_storyInstructions"
  }
})

Template.intro.events({
  'click .js-markIntroRead'() {
    Session.set('markIntroRead', true)
  }
})

Template.day.onCreated(function() {
  this.timer = null
})

Template.day.onRendered(function() {
  const { game } = this.data
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
    if (user && user.status && user.status.idle && this.data.player)
      notifyPlayer("vote")
  }
})

Template.day.helpers({
  day() {
    return this.game.days.find(d => d.index === this.game.index)
  },
  isIntro() {
    return !Session.get('markIntroRead', false)
  },
  playerHasRole(role) {
    return this.player === role
  },
  alivePlayers() {
    return this.game.players.filter(p => !p.isDead)
  },
  hasLynched() {
    if (this.player && !this.player.isDead) {
      const day = this.game.days.find(d => d.index === this.index)
      const vote = day && day.votes && day.votes.find(v => v.userId === this.player.userId)
      return vote && vote.target && this.game.players.find(p => p.userId === vote.target)
    }
    return false
  },
  waitHunter() {
    return this.game.players.find(p => p.role === "hunter" && p.isDead) && !this.game.days.find(d => !!d.hunted)
  },
  remainingTime() {
    return Math.floor(Session.get('timer-day-'+this.game._id, 0) / 1000)
  }
})

Template.day.events({
  'click .js-lynch'(e, t) {
    Meteor.call('voteLynch', t.data.game._id, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'click .js-hunt'(e, t) {
    Meteor.call('hunt', t.data.game._id, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
    })
  }
})

Template.night.onCreated(function() {
  if (this.data.player)
    notifyPlayer("night")
})

Template.night.helpers({
  night() {
    return this.game.isNight && this.game.nights.find(n => n.index === this.game.index)
  },
  playerHasRole(role) {
    return this.player === role
  },
  waitSeer() {
    const { nights, index, isNight, roles } = this.game
    const night = isNight && nights && nights.find(n => n.index === index)
    return night && roles.indexOf('seer') !== -1 && !night.seered
  },
  waitCupid() {
    const { nights, index, isNight, roles } = this.game
    const night = isNight && nights && nights.find(n => n.index === index)
    return night && roles.indexOf('cupid') !== -1 && (!night.cupids || night.cupids.length <= 1)
  },
  waitWitch() {
    const { nights, index, isNight, roles } = this.game
    const night = isNight && nights && nights.find(n => n.index === index)
    const noMorePotions = !!nights.find(n => !!n.poisoned) && !!nights.find(n => !!n.healed)
    return night && roles.indexOf('witch') !== -1 && !night.witchDone && !noMorePotions
  },
  waitWerewolves() {
    const { nights, index, isNight, roles } = this.game
    const night = isNight && nights && nights.find(n => n.index === index)
    return night && roles.indexOf('werewolf') !== -1 && !night.werewolvesDone
  },
  showWerewolvesChat() {
    return this.game.nbWerewolves > 1
  },
  werewolfHasVoted() {
    const { nights, index, isNight, players } = this.game
    const { player } = this
    if (player && player.role === "werewolf" && !player.isDead) {
      const night = isNight && nights && nights.find(n => n.index === index)
      const vote = night.votesAttack.find(v => v.userId === player.userId)
      return vote && vote.target && players.find(p => p.userId === vote.target)
    }
    return false
  },
  witchHasPoison() {
    const { _id, nights } = this.game
    const { player } = this
    if (player && player.role === "witch" && !player.isDead) {
      const nightPoisoned = nights && nights.find(n => !!n.poisoned)
      return !nightPoisoned && !Session.get('witchPoisoned-' + _id, false)
    }
    return false
  },
  witchPoisonedPlayer() {
    const poisoned = Session.get('witchPoisoned-' + this.game._id, null)
    return poisoned && this.game.players.find(p => p.userId === poisoned)
  },
  witchHasHealing() {
    const { _id, nights } = this.game
    const { player } = this
    if (player && player.role === "witch" && !player.isDead) {
      const nightHealed = nights && nights.find(n => !!n.healed)
      return !nightHealed && !Session.get('witchHealed-' + _id, false)
    }
    return false
  },
  witchHealedPlayer() {
    const healed = Session.get('witchPoisoned-' + this.game._id, null)
    return healed && this.game.players.find(p => p.userId === healed)
  },
  seerPeople() {
    const { player, game } = this
    if (player && player.role === "seer" && !player.isDead)
      return game.players.filter(p => !p.isDead && p.userId !== player.userId)
    return []
  },
  witchDeadPeople() {
    const { nights, index, isNight, players } = this.game
    const { player } = this
    if (player && player.role === "witch" && !player.isDead) {
      let dead = []
      const night = isNight && nights && nights.find(n => n.index === index)
      const deaths = night && [night.attacked]
      return deaths && players.filter(p => !p.isDead && deaths.indexOf(p.userId) !== -1)
    }
    return []
  },
  alivePeople() {
    const { nights, index, isNight, players } = this.game
    let dead = []
    const night = isNight && nights && nights.find(n => n.index === index)
    const deaths = night && [night.attacked]
    return deaths && players.filter(p => !p.isDead && deaths.indexOf(p.userId) === -1)
  }
})

Template.night.events({
  'click .js-seer'(e, t) {
    Meteor.call('seer', t.data.game._id, this.userId, (err, seered) => {
      if (err)
        console.error(err.message)
      alert(this.username + ' is ' + seered)
    })
  },
  'click .js-werewolf'(e, t) {
    Meteor.call('voteAttack', t.data.game._id, this.userId, (err, data) => {
      if (err)
        console.error(err.message)
    })
  },
  'click .js-poison'(e, t) {
    Session.set("witchPoisoned-"+t.data.game._id, this.userId)
  },
  'click .js-heal'(e, t) {
    Session.set("witchHealed-"+t.data.game._id, this.userId)
  },
  'click .js-witch'(e, t) {
    const gameId = t.data.game._id
    const poisoned = Session.get("witchPoisoned-"+gameId, null)
    const healed = Session.get("witchHealed-"+gameId, null)
    Meteor.call('witch', gameId, poisoned, healed, (err, data) => {
      if (err)
        console.error(err.message)
    })
  }
})

Template.chatbox.helpers({
  placeholder() {
    const chat = Chats.findOne(this.chatId)
    return chat ? ("Message the " + (chat.werewolvesOnly ? "werewolves" : "players")) : ""
  },
  canPost() {
    return this.player && !this.player.isDead
  },
  messages() {
    const chat = Chats.findOne(this.chatId)
    return chat && chat.messages && chat.messages.map(m => {
      const author = m.author && this.game.players && this.game.players.find(p => p.userId === m.author)
      return {
        ...m,
        authorName: author && author.username ? author.username : "Anonymous"
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
      })
    e.currentTarget.reset()
  }
})
