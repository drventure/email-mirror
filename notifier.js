/*jslint node: true, vars: true, indent: 4 */
"use strict"

var util = require('util'),
    Imap = require('imap'),
    debug = require('debug'),
    MailParser = require('mailparser').MailParser,
    EventEmitter = require('events').EventEmitter,
    Log = require('../../js/logger')

//var dbg = debug('mailnotifier');

var numberOfEmails

/**
 *
 * @param {obj} opts Options for the email account to check
 * based on node-imap
 */
function Notifier(opts) {
    EventEmitter.call(this)
    var self = this
    self.options = opts
    numberOfEmails = opts.numberOfEmails
    if (self.options.username) {
        //backward compat
        self.options.user = self.options.username
    }
    self.options.box = self.options.box || 'INBOX'
    //self.options.debug = debug('imap');
}
util.inherits(Notifier, EventEmitter)

module.exports = function (opts) {
    return new Notifier(opts)
}

/**
 * Start email check for a single email address
 */
Notifier.prototype.start = function () {
    var self = this
    Log.log('Starting to connect: ' + self.options.host)
    self.imap = new Imap(self.options)
    self.imap.on('uidvalidity', function (uidvalidity) {
        Log.log('new uidvalidity: ' + self.options.host + ' : ' + uidvalidity)
    })
    self.imap.once('ready', function () {
        Log.log('Connecting: ' + self.options.host)
        self.emit('connected')
        self.imap.openBox(self.options.box, false, function (err, box) {
            if (err) {
                Log.log('unable to open box: ' + self.options.host + ' : ' + box)
                self.emit('error', err)
                return
            }
            self.scan()
            self.imap.on('mail', function (id) {
                Log.log('mail event: ' + self.options.host + ' : ' + id)
                self.scan()
            })
            self.imap.on('scanfinished', function () {
                Log.log('scanfinished event: ' + self.options.host)
                self.imap.end();
            })
        })
    })
    self.imap.once('end', function () {
        Log.log('imap end:' + self.options.host)
        self.emit('end')
    })
    self.imap.once('error', function (err) {
        Log.log('imap error: ' + self.options.host + ' : ' + err)
        self.emit('error', err)
    })
    self.imap.once('close', function (haserr) {
        Log.log('imap close: ' + self.options.host + ' : ' + haserr ? 'normal' : 'errored')
        self.emit('close')
    })
    self.imap.connect()
    return this
}


/**
 * Scan an opened mail connection for unseen messages
 */
Notifier.prototype.scan = function () {
    var self = this,
        search = self.options.search || ['UNSEEN']

    Log.log(
        'scanning: ' +
        self.options.host +
        ' : ' +
        self.options.box +
        ' : Filter: ' +
        search
    )

    //Set up to perform search
    self.imap.search(search, function (err, searchResults) {
        if (err) {
            self.emit('error', err)
            return
        }

        //pluck off the last x messages (as configured)
        Log.log('Search results: ' + self.options.host + ' : ' + (!searchResults ? searchResults.length : 0))
        searchResults = searchResults.slice(-numberOfEmails)
        if (!searchResults || searchResults.length == 0) {
            Log.log('no new mail: ' + self.options.host + ' : ' + self.options.box)
            self.emit('nonew')
            return
        }
        Log.log('scan results: ' + self.options.host + ' : length:' + searchResults.length)

        //looks like there's messages so fetch them
        //and populate the return package (payload)
        var fetch = self.imap.fetch(searchResults, {
            markSeen: self.options.markSeen !== false,
            bodies: ''
        })
        fetch.on('message', function (msg) {
            var mp = new MailParser()
            var s = null
            msg.once('body', function (stream, info) {
                stream.pipe(mp)
                s = info.seqno
            })
            mp.once('end', function (mail) {
                Log.log('Mail detected: ' + self.options.host + ' : ' + s)
                self.emit('mail', mail, s)
            })
        })
        fetch.once('end', function () {
            Log.log('Done fetching all messages for: ' + self.options.host)
            self.imap.emit('scanfinished');
        })
        fetch.once('error', function (err) {
            Log.log('fetch error: ' + self.options.host + ' : ' + err)
            self.emit('error', err)
            self.imap.emit('scanfinished');
        })
    })
    return this
}


/**
 * Stop scanning and close connection
 */
Notifier.prototype.stop = function () {
    var self = this
    if (this.imap.state !== 'disconnected') {
        Log.log('imap ending: ' + self.options.host)
        this.imap.end()
    } else {
        Log.log('notifier already disconnected: ' + self.options.host)
    }
    return this
}
