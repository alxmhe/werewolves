# Werewolves
Have fun !

## Dependencies
Meteor (development and build) : https://www.meteor.com  
Docker (deployment) : http://www.docker.com

## Build
`(cd app && meteor build ../ --server-only --architecture os.linux.x86_64)`

## Deployment
`tar xzf app.tar.gz && docker-compose up -d`

## TODO
- Secure werewolves chat.
- Make number of werewolves proportional to the square root of the total number of players.
- Implement more roles.
- Add mail server for lost password.
- Figure out what happens when witch is cupided with someone else, save herself, kills the someone else.
