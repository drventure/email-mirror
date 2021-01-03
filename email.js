/**
 * Created by debayan on 7/24/16.
 * NOTE: This runs in the CLIENT BROWSER, not under node
 */

Module.register("email",{

    // defaults : [
    //         {
    //             user: 'a@b.com',
    //             password: 'xxx',
    //             host: 'jjj.kkk.com',
    //             port: 993,
    //             tls: true,
    //             authTimeout: 10000,
    //             numberOfEmails: 5,
    //             fade: true,
    //             maxCharacters: 30
    //         }
    //     ]
    payload: [],

    /**
     * Kicks off the whole email checking process
     */
    start : function(){
        Log.info("Starting module: " + this.name);

        //send msg to the node backend to start checking for emails
        this.sendSocketNotification('LISTEN_EMAIL', { config: this.config, payload: this.payload, loaded: this.loaded });
        
        Log.log('AfterSendSocket');
        this.loaded = false;
    },


    /**
     * 
     * @param {string} notification type of notification received
     * @param {obj} payload the list of messages to display
     */
    socketNotificationReceived: function (notification, payload) {
        var self = this;
        Log.log('Got Notification: ' + notification);
        if (notification === 'EMAIL_RESPONSE') {
            if (payload) {
                this.loaded = true;
                Log.log("NEW PAYLOAD: ", payload);
                //get list of email ids that we've already got
                var payloadIds = self.payload.map(function (m) { return m.id });
                //find any new emails that aren't already in the list and add them
                payload.forEach(function (m) {
                    //make sure the payload entry actually contains something
                    if (m) {
                        //if we haven't got it, add it to the local payload of emails
                        if(payloadIds.indexOf(m.id) == -1)
                            self.payload.push(m);
                    }
                });

                //basically, sorts emails by descending received date
                //this.payload.sort(function(a,b) {return b.id - a.id; });
                //sort by desc date across all accounts instead
                self.payload.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

                //refresh the UI
                self.updateDom(2000);
            }
        }
    },

    
    // Define required scripts.
    getStyles: function() {
        return ["email.css", "font-awesome.css"];
    },


	// Return the scripts that are necessary for the email module.
	getScripts: function () {
        return ["notifier.js"];
    },
    
    
    getDom: function(){
        var wrapper = document.createElement("table");
        wrapper.className = "small";
        var that = this;
        if(this.payload.length > 0)
        {
            if (typeof that.config.accounts !== "undefined") {
                var indexToRemove = [];
                //for each email account we're tracking...
                for (var i = 0; i < this.config.accounts.length; i++) {
                    var maxNumEmails = this.config.accounts[i].numberOfEmails;
                    //count up the emails we have for this account
                    var count = 0;
                    for (var j = 0; j < this.payload.length; j++) {
                        if (this.payload[j].host === this.config.accounts[i].host) {
                            count++;
                        }
                        //too many, mark this one to remove
                        if (count > maxNumEmails) {
                            indexToRemove.push(j);
                        }
                    }
                }
                //go back through and removed the marked items
                for (var j = 0; j < this.payload.length; j++) {
                    if (indexToRemove.indexOf(j) > -1) {
                        delete this.payload[j];
                    }
                }

                //finally, populate the DOM with the emails that remain in the list
                var count = 0
                this.payload.forEach(function (mailObj) {

                    var host = mailObj.host.slice(0,1) + '@' + mailObj.host.substr(mailObj.host.indexOf('@') + 1)[0];

                    var name = mailObj.sender[0].name.replace(/['"]+/g, "");
                    name = name.substring(0, that.config.maxCharacters);

                    var subject = (mailObj.subject ?? "(no subject)").replace(/[\['"\]]+/g, "");
                    subject = subject.substring(0, that.config.maxCharacters);

                    var emailWrapper = document.createElement("tr");
                    emailWrapper.className = "normal";

                    var senderWrapper = document.createElement("tr");
                    senderWrapper.className = "normal";

                    var nameWrapper = document.createElement("td");
                    nameWrapper.className = "bright";
                    nameWrapper.setAttribute("data-letters", host);
                    nameWrapper.innerHTML = name;
                    nameWrapper.style.color = mailObj.color;
                    senderWrapper.appendChild(nameWrapper);
                    var addressWrapper = document.createElement("td");
                    addressWrapper.className = "address xsmall thin dimmed";
                    addressWrapper.innerHTML = mailObj.sender[0].address;
                    senderWrapper.appendChild(addressWrapper);
                    emailWrapper.appendChild(senderWrapper);

                    var subjectWrapper = document.createElement("tr");
                    subjectWrapper.className = "light";
                    subjectWrapper.innerHTML = subject;
                    emailWrapper.appendChild(subjectWrapper);

                    wrapper.appendChild(emailWrapper);

                    // Calculate total possible emails
                    var totalEmails = 0;
                    for (var i = 0; i < that.config.accounts.length; i++) {
                        totalEmails += that.config.accounts[i].numberOfEmails;
                    }

                    // Create fade effect.
                    if (that.config.fade) {
                        var startingPoint = that.payload.slice(0, totalEmails).length * 0.25;
                        //Fix fade effect courtesy Alex via MM Forums
                        var steps = that.payload.slice(0, that.config.numberOfEmails).length - startingPoint;
                        if (count >= startingPoint) {
                            var currentStep = count - startingPoint;
                            emailWrapper.style.opacity = 1 - (1 / steps * currentStep);
                        }
                    }
                    count++;
                });

            }

        }
        else{
            wrapper.innerHTML = (this.loaded) ? "No new mails" : this.translate("LOADING");
            wrapper.className = "small dimmed";
            return wrapper;
        }

        return wrapper;
    }

});
