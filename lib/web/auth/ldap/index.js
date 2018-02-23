'use strict'

const Router = require('express').Router
const passport = require('passport')
const LDAPStrategy = require('passport-ldapauth')
const config = require('../../../config')
const models = require('../../../models')
const logger = require('../../../logger')
const {setReturnToFromReferer} = require('../utils')
const {urlencodedParser} = require('../../utils')
const response = require('../../../response')

let ldapAuth = module.exports = Router()

passport.use(new LDAPStrategy({
  server: {
    url: config.ldap.url || null,
    bindDn: config.ldap.bindDn || null,
    bindCredentials: config.ldap.bindCredentials || null,
    searchBase: config.ldap.searchBase || null,
    searchFilter: config.ldap.searchFilter || null,
    searchAttributes: config.ldap.searchAttributes || null,
    tlsOptions: config.ldap.tlsOptions || null
  },
  passwordField: config.ldap.passwordField || 'password'
}, function (user, done) {
  var uuid = user.uidNumber || user.uid || user.sAMAccountName
  var username = uuid

  if (config.ldap.usernameField && user[config.ldap.usernameField]) {
    username = user[config.ldap.usernameField]
  }

  var profile = {
    id: 'LDAP-' + uuid,
    username: username,
    displayName: user.displayName,
    emails: user.mail ? [user.mail] : [],
    avatarUrl: null,
    profileUrl: null,
    provider: 'ldap'
  }
  var stringifiedProfile = JSON.stringify(profile)
  models.User.findOrCreate({
    where: {
      profileid: profile.id.toString()
    },
    defaults: {
      profile: stringifiedProfile
    }
  }).spread(function (user, created) {
    if (user) {
      var needSave = false
      if (user.profile !== stringifiedProfile) {
        user.profile = stringifiedProfile
        needSave = true
      }
      if (needSave) {
        user.save().then(function () {
          if (config.debug) { logger.debug('user login: ' + user.id) }
          return done(null, user)
        })
      } else {
        if (config.debug) { logger.debug('user login: ' + user.id) }
        return done(null, user)
      }
    }
  }).catch(function (err) {
    logger.error('ldap auth failed: ' + err)
    return done(err, null)
  })
}))

ldapAuth.post('/auth/ldap', urlencodedParser, function (req, res, next) {
  if (!req.body.username || !req.body.password) return response.errorBadRequest(res)
  setReturnToFromReferer(req)
  passport.authenticate('ldapauth', {
    successReturnToOrRedirect: config.serverurl + '/',
    failureRedirect: config.serverurl + '/',
    failureFlash: true
  })(req, res, next)
})
