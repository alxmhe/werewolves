import { Meteor } from 'meteor/meteor'

Meteor.publish('allGames', function() {
  if (!this.userId)
    return false
  var transform = game => {
    let roles = []
    game.players.forEach(p => {
      if (!p.isDead && roles.indexOf(p.role) === -1)
      roles.push(p.role)
    })
    return {
      ...game,
      players: game.players.map(player => {
        return {
          ...player,
          username: Meteor.users.findOne(player.userId).profile.username,
          role: (player.isDead || player.userId === this.userId) && player.role,
          data: player.userId === this.userId && player.data
        }
      }),
      roles
    }
  }

  var self = this
  var observer = Games.find().observe({
    added: function (game) {
      self.added('games', game._id, transform(game));
    },
    changed: function (newGame, oldGame) {
      self.changed('games', newGame._id, transform(newGame));
    },
    removed: function (oldGame) {
      self.removed('games', oldGame._id);
    }
  })

  self.onStop(() => {
    observer.stop()
  })

  self.ready()
})

Meteor.publish('allChats', () => {
  if (!this.userId)
    return false

  var transform = chat => {
    const game = Games.findOne(chat.gameId)
    const werewolf = game && game.players.find(p => p.userId === this.userId && p.role === "werewolf")
    return {
      ...chat,
      messages : !werewolf ? [] : chat.messages
    }
  }

  var self = this
  var observer = Chats.find().observe({
    added: function (chat) {
      self.added('chats', chat._id, transform(chat));
    },
    changed: function (newChat, oldChat) {
      self.changed('chats', newChat._id, transform(newChat));
    },
    removed: function (oldChat) {
      self.removed('chats', oldChat._id);
    }
  })

  self.onStop(() => {
    observer.stop()
  })

  self.ready()
})

function computeDeaths(gameId) {
  const game = Games.findOne(gameId)
  let deaths = []
  let night = null
  if (!game.isNight) {
    if (game.index > 0)
      night = game.nights && game.nights.find(n => n.index === game.index - 1)
    const day = game.days && game.days.find(d => d.index === game.index)
    if (day) {
      if (day.lynched)
        deaths.push(day.lynched)
      if (day.hunted)
        deaths.push(day.hunted)
    }
  }
  else if (game.isNight) {
    night = game.nights && game.nights.find(n => n.index === game.index)
    if (night) {
      if (night.attacked)
        deaths.push(night.attacked)
      if (night.poisoned)
        deaths.push(night.poisoned)
    }
  }

  // Add the deaths by cupid.
  if (night && night.cupids) {
    deaths.forEach(d => {
      if (night.cupids.indexOf(d) !== -1)
        deaths = [
          ...deaths,
          ...night.cupids.filter(c => deaths.indexOf(c) === -1)
        ]
    })
  }
  // Heal player
  if (game.isNight && night && night.healed) {
    const healedIndex = deaths.indexOf(night.healed)
    if (healedIndex >= 0)
      deaths.splice(healedIndex, 1)
  }
  return deaths
}

function endDay(gameId, deaths) {
  const game = Games.findOne(gameId)

  let modifier = {
    isNight: true,
    players: game.players && game.players.map(p => deaths.indexOf(p.userId) !==  -1 ? {
      ...p,
      isDead: true
    } : p)
  }
  let remainingWerewolves = game.nbWerewolves
  let remainingVillagers = game.players.length - game.nbWerewolves
  modifier.players.forEach(p => {
    if (p.isDead) {
      if (p.role === "werewolf")
        --remainingWerewolves
      else
        --remainingVillagers
    }
  })
  const remainingPlayers = remainingWerewolves + remainingVillagers

  // Case of the hunter.
  const day = !game.isNight && game.days.find(d => d.index === game.index)
  const hunter = modifier.players.find(p => p.role === "hunter")
  const hasHunted = !!game.days.find(d => !!d.hunted)
  // If the hunter is dead and has hunted, but no lynching yet.
  // Or he is dead, but he didn't hunt.
  // Then don't start the night.
  if (day && hunter && hunter.isDead && ((hasHunted && !day.lynched) || !hasHunted))
    modifier.isNight = false

  if (!(hunter && !hasHunted && remainingPlayers > 0) && (remainingVillagers <= 0 || remainingWerewolves <= 0)) {
    modifier.isNight = false
    modifier.endedAt = new Date()
  }

  const update = Games.update(gameId, {
    $set: modifier,
    $push: modifier.isNight && {
      nights: {
        index: game.index,
        votesAttack: [],
        attackChatId: Chats.insert({
          gameId,
          index: game.index,
          isNight: true,
          messages: [],
          werewolvesOnly: true
        })
      }
    }
  })
  return update && {
    gameOver: !!modifier.endedAt || false,
    deaths
  }
}

function endNight(gameId, deaths) {
  const game = Games.findOne(gameId)

  // Night ended by werewolf
  const night = game.isNight && game.nights.find(n => n.index === game.index)
  if (night && night.attacked && !night.witchDone) {
    const witch = game.players.find(p => p.role === "witch" && !p.isDead)
    const hasHealingPotion = witch && !game.nights.find(n => !!n.healed)
    if (hasHealingPotion)
      return {deaths}
  }

  let modifier = {
    isNight: false,
    index: game.index + 1,
    players: game.players.map(p => deaths.indexOf(p.userId) !==  -1 ? {
      ...p,
      isDead: true
    } : p)
  }

  // Case of killing the hunter.
  const hunter = game.players.find(p => p.role === "hunter" && !p.isDead)
  const hasHunted = !!game.days.find(d => !!d.hunted)

  // Compute end game if no hunter or hunted.
  if (!hunter || deaths.indexOf(hunter.userId) === -1 || hasHunted) {
    let remainingWerewolves = game.nbWerewolves
    let remainingVillagers = game.players.length - game.nbWerewolves
    modifier.players.forEach(p => {
      if (p.isDead) {
        if (p.role === "werewolf")
          --remainingWerewolves
        else
          --remainingVillagers
      }
    })
    if (remainingVillagers <= 0 || remainingWerewolves <= 0)
      modifier.endedAt = new Date()
  }


  const update = Games.update(gameId, {
    $set: modifier,
    $push: !!modifier.endedAt ? null : {
      days: {
        index: game.index + 1,
        votes: [],
        chatId: Chats.insert({
          gameId,
          index: game.index + 1,
          isNight: false,
          messages: [],
          werewolvesOnly: false
        })
      }
    }
  })
  return update && {
    gameOver: !!modifier.endedAt || false,
    deaths
  }
}

Meteor.methods({
  createGame() {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')

    return Games.insert({
      players: [
        {
          userId: this.userId
        }
      ],
      createdAt: new Date()
    })
  },
  saveUsername(username) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    return Meteor.users.update(this.userId, {
      $set: {
        profile: {
          username
        }
      }
    })
  },
  joinGame(gameId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (game.players.length > 0 && game.players.map(p => p.userId === this.userId).reduce((acc, val) => acc && val))
      throw new Meteor.Error('You are already in.')
    if (!!game.startedAt)
      throw new Meteor.Error('Game already started.')
    return Games.update(gameId, {
      $push: {
        players: { userId: this.userId }
      }
    })
  },
  leaveGame(gameId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.players.map(p => p.userId === this.userId).reduce((acc, val) => acc && val))
      throw new Meteor.Error('You are not in.')
    if (!!game.startedAt)
      throw new Meteor.Error('Game already started.')
    const index = game.players.findIndex(p => p.userId === this.userId)
    if (index >= 0)
      game.players.splice(index, 1)
    return Games.update(gameId, {
      $set: {
        players: game.players
      }
    })
  },
  startGame(gameId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!!game.startedAt)
      throw new Meteor.Error('Game already started.')
    if (!game.players.find(p => p.userId === this.userId))
      throw new Meteor.Error('You are not a player.')
    const nbPlayers = game.players.length
    if (nbPlayers < GAME_MINIMUM_PLAYERS)
      throw new Meteor.Error('Not enough players.')
    let nbWerewolves = Math.floor(nbPlayers / 2 - 1)
    if (nbWerewolves <= 0)
      nbWerewolves = 1
    let roles = []
    var i
    for (i = 0 ; i < nbPlayers ; ++i) {
      if (i < nbWerewolves)
        roles.push('werewolf')
      else if (i < nbWerewolves + 1)
        roles.push('seer')
      else if (i < nbWerewolves + 2)
        roles.push('witch')
      else if (i < nbWerewolves + 3)
        roles.push('hunter')
      else if (i < nbWerewolves + 4)
        roles.push('mayor')
      else if (i < nbWerewolves + 5)
        roles.push('cupid')
      else if (i < nbWerewolves + 6)
        roles.push('prince')
      else if (i < nbWerewolves + 7)
        roles.push('priest')
      else
        roles.push('villager')
    }
    // Shuffling array of roles
    let currentIndex = roles.length, temporaryValue, randomIndex
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex)
      --currentIndex
      temporaryValue = roles[currentIndex]
      roles[currentIndex] = roles[randomIndex]
      roles[randomIndex] = temporaryValue
    }
    // Assign to players
    return Games.update(gameId, {
      $set: {
        isNight: false,
        index: 0,
        players: game.players.map((player, index) => {
          return {
            ...player,
            role: roles[index]
          }
        }),
        nbWerewolves,
        startedAt: new Date()
      },
      $push: {
        days: {
          index: 0,
          votes: [],
          chatId: Chats.insert({
            gameId,
            index: 0,
            werewolvesOnly: false,
            messages: [],
            members: game.players.map(p => p.userId)
          })
        }
      }
    })
  },
  voteLynch(gameId, targetId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.isDead)
      throw new Meteor.Error('You are dead.')

    const target = game.players.find(p => p.userId === targetId)
    if (!target)
      throw new Meteor.Error('Your target is not in.')
    if (target.isDead)
      throw new Meteor.Error('Your target is dead.')

    let day = !game.isNight && game.days.find(d => d.index === game.index)
    if (!day)
      throw new Meteor.Error('Invalid day.')
    if (day.votes.find(v => v.userId === this.userId))
      throw new Meteor.Error('You already voted.')

    day.votes = [
      ...day.votes,
      {
        userId: this.userId,
        target: targetId
      }
    ]
    // Send vote
    const voteSent = Games.update(gameId, {
      $set: {
        days: game.days.map(d => d.index !== day.index ? d : day)
      }
    })
    if (!voteSent)
      throw new Meteor.Error('Unable to vote.')

    // Check if everyone has voted.
    const missingVoters = game.players.find(p => !p.isDead && !day.votes.find(v => v.userId === p.userId))
    if (!!missingVoters)
      return true

    // Compute votes result.
    let results = game.players.map(p => {
      return {
        ...p,
        votesAgainst: p.isDead ? 0 : day.votes.map(v => {
          if (v.target !== p.userId)
            return 0
          // mayor vote counts for 2
          return game.players.find(voter => voter.userId === v.userId).role === "mayor" ? 2 : 1
        }).reduce((acc, val) => acc + val, 0)
      }
    })
    results.sort((val1, val2) => val1.votesAgainst < val2.votesAgainst)

    if (results.length < 2 || results[0].votesAgainst !== results[1].votesAgainst)
      day.lynched = results[0].userId
    return Games.update(gameId, {
      $set: {
        days: game.days.map(d => d.index !== day.index ? d : day)
      }
    }) && endDay(gameId, computeDeaths(gameId))
  },

  cupid(gameId, playerA, playerB) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.role !== "cupid")
      throw new Meteor.Error('You are not cupid.')
    const targetA = game.players.find(p => p.userId === playerA)
    const targetB = game.players.find(p => p.userId === playerB)
    if (!targetA || !targetB)
      throw new Meteor.Error('Your target is not in.')
    if (targetA.isDead || targetB.isDead)
      throw new Meteor.Error('Your target is dead.')

    let night = game.isNight && game.nights && game.nights.find(n => n.index === game.index)
    if (!night)
      throw new Meteor.Error('Invalid night.')
    if (night.cupids && night.cupids.length > 0)
      throw new Meteor.Error('You already selected your lovers.')

    night.cupids = [playerA, playerB]
    return Games.update(gameId, {
      $set: {
        nights: game.nights.map(n => n.index !== night.index ? n : night)
      }
    })
  },
  seer(gameId, targetId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game || !game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.role !== "seer")
      throw new Meteor.Error('You are not seer.')
    const target = game.players.find(p => p.userId === targetId)
    if (!target)
      throw new Meteor.Error('Your target is not in.')
    if (target.isDead)
      throw new Meteor.Error('Your target is dead.')
    let night = game.isNight && game.nights && game.nights.find(n => n.index === game.index)
    if (!night)
      throw new Meteor.Error('Invalid night.')
    if (night.seered)
      throw new Meteor.Error('You already selected your target.')

    const seered = game.players.find(p => p.userId === targetId)
    return seered && Games.update(gameId, {
      $set: {
        nights: game.nights.map(n => n.index !== night.index ? n : {
          ...n,
          seered: targetId
        })
      }
    }) && seered.role
  },
  voteAttack(gameId, targetId) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.isDead)
      throw new Meteor.Error('You are dead.')
    if (player.role !== "werewolf")
      throw new Meteor.Error('You are not werewolf.')
    let night = game.isNight && game.nights && game.nights.find(n => n.index === game.index)
    if (!night)
      throw new Meteor.Error('Invalid night.')
    if (night.votesAttack && night.votesAttack.find(v => v.userId === this.userId))
      throw new Meteor.Error('You already voted.')

    night.votesAttack = [
      ...night.votesAttack,
      {
        userId: this.userId,
        target: targetId
      }
    ]
    // Send vote
    const voteSent = Games.update(gameId, {
      $set: {
        nights: game.nights.map(n => n.index !== night.index ? n : night)
      }
    })
    if (!voteSent)
      throw new Meteor.Error('Unable to vote.')

    // Check if every wolf has voted.
    const remainingVoter = game.players.find(p => !p.isDead && p.role === "werewolf" && !night.votesAttack.find(v => v.userId === p.userId))
    if (remainingVoter)
      return true
    night.werewolvesDone = true

    // Compute votes result.
    let results = game.players.filter(p => !p.isDead).map(p => {
      return {
        ...p,
        votesAgainst: night.votesAttack.map(v => v.target === p.userId ? 1 : 0).reduce((acc, val) => acc + val, 0)
      }
    })
    results.sort((val1, val2) => val1.votesAgainst < val2.votesAgainst)

    if (results.length === 1 || results[0].votesAgainst !== results[1].votesAgainst)
      night.attacked = results[0].userId

    return Games.update(gameId, {
      $set: {
        nights: game.nights.map(n => n.index !== night.index ? n : night)
      }
    }) && endNight(gameId, computeDeaths(gameId))
  },
  witch(gameId, poisoned, healed) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.role !== "witch")
      throw new Meteor.Error('You are not witch.')
    let night = game.isNight && game.nights && game.nights.find(n => n.index === game.index)
    if (!night)
      throw new Meteor.Error('Invalid night.')
    if (night.witchDone)
      throw new Meteor.Error('You already played.')
    if (poisoned && player.data && player.data.usedPoison)
      throw new Meteor.Error('You already used your poison potion.')
    if (healed && player.data && player.data.usedHealing)
      throw new Meteor.Error('You already used your healing potion.')

    if (poisoned && game.players.find(p => !p.isDead && p.userId === poisoned))
      night.poisoned = poisoned
    if (healed && game.players.find(p => !p.isDead && p.userId === healed))
      night.healed = healed
    night.witchDone = true

    return Games.update(gameId, {
      $set: {
        nights: game.nights.map(n => n.index !== night.index ? n : night)
      }
    }) && endNight(gameId, computeDeaths(gameId))
  },
  hunt(gameId, target) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const game = Games.findOne(gameId)
    if (!game.startedAt)
      throw new Meteor.Error('Game not started.')
    const player = game.players.find(p => p.userId === this.userId)
    if (!player)
      throw new Meteor.Error('You are not in.')
    if (player.role !== "hunter")
      throw new Meteor.Error('You are not hunter.')
    if (!player.isDead)
      throw new Meteor.Error('You cannot hunt.')
    if (game.days.find(d => !!d.hunted))
      throw new Meteor.Error('You already hunted.')
    let day = !game.isDay && game.days && game.days.find(d => d.index === game.index)
    if (!day)
      throw new Meteor.Error('Invalid day.')

    day.hunted = target
    return Games.update(gameId, {
      $set: {
        days: game.days.map(d => d.index !== day.index ? d : day)
      }
    }) && endDay(gameId, computeDeaths(gameId))
  },
  sendMessage(chatId, content) {
    if (!this.userId)
      throw new Meteor.Error('You need to log in.')
    const chat = Chats.findOne(chatId)
    if (!chat || !chat.gameId)
      throw new Meteor.Error('No chat available.')
    const game = Games.findOne(chat.gameId)
    if (!game)
      throw new Meteor.Error('No chat available.')
    const members = game.players.filter(p => (!chat.werewolvesOnly || p.role === "werewolf") && !p.isDead).map(p => p.userId)
    if (members.indexOf(this.userId) === -1)
      throw new Meteor.Error('You cannot participate in this chat.')
    return Chats.update(chatId, {
      $push: {
        messages: {
          author: this.userId,
          sentAt: new Date(),
          content
        }
      }
    })
  }
})
