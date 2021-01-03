/**
 * Created by debayan on 7/23/16.
 */
var notifier = require('./notifier');
var NodeHelper = require('node_helper');
const Log = require("../../js/logger");
var _ = require('underscore');

var accountIndex = 0;
var accounts;

module.exports = NodeHelper.create({
    start: function(){
        Log.log(this.name + ' helper started ...');
    },

    socketNotificationReceived : function(notification, payload){
        Log.log("Email notification: " + notification);
        var self = this;
        if(notification === 'LISTEN_EMAIL' && accountIndex == 0){
            Log.log('listening for emails...');
            this.config = payload.config;
            this.payload = payload.payload;
            this.loaded = payload.loaded;

            accounts = this.config.accounts;

            // Loop through each email account
            if (typeof accounts !== "undefined") {
                final = [];
                self.checkAccount(notification, payload);
            }
        }
    },


    /**
     * check a single account
     * automatically kicks of checking the next account when done
     * and replies to client when all are checked
     * so that only one payload is delivered
     */
    checkAccount: function (notification, payload) {
        var self = this;

        imap = {
            user: accounts[accountIndex].user,
            password: accounts[accountIndex].password,
            host: accounts[accountIndex].host,
            port: accounts[accountIndex].port,
            tls: accounts[accountIndex].tls,
            tlsOptions: accounts[accountIndex].tlsOptions,
            markSeen: false,
            authTimeout: accounts[accountIndex].authTimeout,
            numberOfEmails: accounts[accountIndex].numberOfEmails
        };

        var seqs = [];
        if (this.payload.length > 0)
            this.payload.forEach(function (o) {
                seqs.push(o.id);
            });

        var n = notifier(imap);
        n.on('nonew', function () {
            Log.log('Email notifier no new mail: ' + n.options.host);
            if (!self.loaded) {
                n.stop();
            }
        }).on('mail', function (m, s) {
            if (seqs.indexOf(s) == -1) {
                Log.log('Email Notifier NewMail: ' + n.options.host + ' : ' + m.subject + ' : ' + m.date);
                var a = [{
                    address: m.from[0].address,
                    name: m.from[0].name
                }];
                var b = m.subject;
                var d = m.date;
                var tmp = {
                    sender: a,
                    subject: b,
                    date: d,
                    id: s,
                    host: n.options.host,
                    color: accounts[accountIndex].color ?? "white"
                };
                //add this message to the payload we'll return to client
                final.push(tmp);
                //n.stop();
            }
        }).on('end', function () {
            // session ended
            // according to docs this is unreliable
            // not using
            Log.log('Email notifier Session Ended: ' + n.options.host);
        }).on('close', function () {
            // session closed
            // closed event should happen consistently, so use that
            Log.log('Email notifier Session Closed: ' + n.options.host);
            n.stop();
            Log.log('Email notifier accountIndex: ' + accountIndex);
            if (accountIndex == accounts.length - 1) {
                Log.log('Email notifier Resetting for next refresh');
                // reset index for next pass
                accountIndex = 0;

                //now that all accounts are checked, signal payload
                final = _.sortBy(final, 'id').reverse();
                final = _.uniq(final, true, 'id');
                self.sendSocketNotification('EMAIL_RESPONSE', final);

                //preserve the payload so that we can keep track of which
                //messages have been displayed
                var timeout = self.config.refreshTimeout ?? 600000; //10 minute refresh by default
                Log.log('Email notifier Refresh Timeout: ' + timeout);
                setTimeout(function () {
                    Log.log('Email notifier Kickoff Refresh');
                    self.checkAccount(notification, payload);
                }, timeout);
            } else {
                accountIndex++;
                //continue to next account
                self.checkAccount(notification, payload);
            }
        }).on('error', function (e) {
            Log.log('Email notifier error: ' + n.options.host + ' : ' + e);
            //make sure to stop before trying to resume
            n.stop();
            //n.start();
        }).start();
    }
});

