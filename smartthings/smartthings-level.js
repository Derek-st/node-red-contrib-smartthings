var Promise = require('promise');

module.exports = function(RED) {

    function SmartthingsLevelNode(config) {
        RED.nodes.createNode(this, config);

        let node = this;

        console.debug("SmartthingsLevelNode")
        console.debug(config);

        this.conf = RED.nodes.getNode(config.conf);
        this.name = config.name;
        this.device = config.device;

        this.currentStatus = 0;
        this.currentLevel = 0;

        this.state = {
            value: 0,
            level: 0,
            levelUnit: ""
        }

        this.reportState = function(send, done, original) {
            send = send || function() { node.send.apply(node,arguments) };
            done = done || function() { };
            let msg = [{
                topic: "device",
                payload: {
                    deviceId: this.device,
                    deviceType: "switch",
                    name: this.name,
                    value: this.state.value
                }
            },{
                topic: "device",
                payload: {
                    deviceId: this.device,
                    deviceType: "level",
                    name: this.name,
                    value: this.state.level,
                    unit: this.state.levelUnit
                }
            }];

            if(original !== undefined){
              msg.forEach( (m) => {
                original.payload = m.payload;
                Object.assign(m,original);
              });
            }

            send(msg);
            done();
        }

        this.setState = function(value, send, done) {
            Object.assign(this.state, value);
            this.reportState(send, done);
        }

        this.pullState = function(value, send, done) {
            this.conf.getDeviceStatus(this.device,"main").then( (status) => {
                console.debug("LevelDevice("+this.name+") Status Refreshed");

                let state = {};

                if(status["switch"] !== undefined && status["switch"]["switch"] !== undefined){
                    state.value = (status["switch"]["switch"]["value"].toLowerCase() === "on" ? 1 : 0);
                }

                if(status["switchLevel"] !== undefined && status["switchLevel"]["level"] !== undefined){
                    state.level = status["switchLevel"]["level"]["value"];
                    state.levelUnit = status["switchLevel"]["level"]["unit"];
                }

                this.setState(state);
            }).catch( err => {
                console.error("Ops... error getting device state (LevelDevice)");
                console.error(err);
            });
        }

        if(this.conf && this.device){
            const callback  = (evt) => {
                console.debug("LevelDevice("+this.name+") Callback called");
                console.debug(evt);

                let state = {};

                switch(evt["name"].toLowerCase()){
                    case "switch":
                        state.value = (evt["value"].toLowerCase() === "on" ? 1 : 0);
                        break;

                    case "level":
                        state.level = evt["value"];
                        break;
                }

                this.setState(state);
            }

            this.conf.registerCallback(this, this.device, callback);
            this.pullState();

            this.on('input', (msg, send, done) => {
                send = send || function() { node.send.apply(node,arguments) };
                done = done || function() { };
                console.debug("Input Message Received");
                console.log(msg);

                if(msg && msg.topic !== undefined){
                    switch(msg.topic){
                        case "pull":
                            this.pullState();
                            break;

                        case "update":
                            this.reportState(send, done, msg);
                            break;

                        case "switch":
                            this.conf.executeDeviceCommand(this.device,[{
                                component: "main",
                                capability: "switch",
                                command: (msg.payload.value == 1 ? "on" : "off")
                            }]).then( (ret) => {
                                const state = {
                                    value: msg.payload.value
                                }
                                this.setState(state, send, done);
                            }).catch( (ret) => {
                                console.error("Error updating device");
                                done("Error updating device");
                            });
                            break;

                        case "level":
                            this.conf.executeDeviceCommand(this.device,[{
                                component: "main",
                                capability: "switchLevel",
                                command: "setLevel",
                                arguments: [
                                    msg.payload.value
                                ]
                            }]).then( (ret) => {
                                const state = {
                                    level: msg.payload.value
                                }
                                this.setState(state, send, done);
                            }).catch( (ret) => {
                                console.error("Error updating device");
                                done("Error updating device");
                            });
                            break;

                        default:
                            done("Invalid topic");
                            break;
                    }
                } else {
                    done("Invalid Message");
                }
            });

            this.on('close', () => {
                console.debug("Closed");
                this.conf.unregisterCallback(this, this.device, callback);
            });
        }
    }

    RED.nodes.registerType("smartthings-node-level", SmartthingsLevelNode);

};
